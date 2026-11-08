"""Offline tests of the single selection/forecast flow; synthetic data only."""
import io
import json
import shutil
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
import numpy as np
from artifact import predict
from common import ROOT, SYMBOLS, canonical, digest
from features import FEATURES, prepare
from forecast import generate
from lstm import LSTMRegressor
from pipeline import main
from publication import export_predictions, prediction_result
from store import Store
from test_lifecycle import DatabaseTests, config, seed
from test_pipeline import candles
from train import ALGORITHMS, evaluation_plan, sequence_data, select_best, train_models, training_slice, candidates


class ForecastWorkflowTests(DatabaseTests):
    @classmethod
    def setUpClass(cls):
        cls.reference_dir=ROOT/'data'/('test-reference-'+uuid.uuid4().hex)
        cls.reference_dir.mkdir()
        cls.reference=Store(cls.reference_dir/'reference.sqlite3')
        cls.raw=candles(700)
        cls.now=int(cls.raw.close_time.max())+1000
        cls.cfg=config()
        for index, symbol in enumerate(SYMBOLS):
            raw=cls.raw.copy()
            raw['volume']+=index
            seed(cls.reference,raw,cls.now,symbol)
            with cls.reference.transaction():
                train_models(cls.reference,symbol,cls.cfg,cls.now)
                select_best(cls.reference,symbol,cls.cfg,cls.now)

    @classmethod
    def tearDownClass(cls):
        cls.reference.close()
        if cls.reference_dir.resolve().parent != (ROOT/'data').resolve() or not cls.reference_dir.name.startswith('test-reference-'):
            raise ValueError('Unsafe test cleanup')
        shutil.rmtree(cls.reference_dir)

    def setUp(self):
        super().setUp()
        self.reference.db.backup(self.store.db)

    def test_all_eight_symbols_train_all_four_real_candidates_on_identical_windows(self):
        for symbol in SYMBOLS:
            models=[self.store.model(row[0]) for row in self.store.db.execute('SELECT id FROM models WHERE symbol=?',(symbol,))]
            self.assertEqual(set(m['metadata']['algorithm'] for m in models),set(ALGORITHMS))
            periods=[]
            for model in models:
                meta=model['metadata'];folds=meta['walk_forward']
                self.assertTrue(all(f['train_target_end']<f['evaluation_source_start'] for f in folds+[meta['final_evaluation']]))
                self.assertLess(folds[-1]['evaluation_target_end'],meta['final_evaluation']['evaluation_source_start'])
                self.assertEqual(meta['final_evaluation']['metrics']['samples'],self.cfg['holdout_days'])
                self.assertLessEqual(meta['parity_max_absolute_error'],1e-12)
                periods.append([(f['evaluation_source_start'],f['evaluation_target_end']) for f in folds])
            self.assertTrue(all(period==periods[0] for period in periods))
            with self.store.transaction():row=generate(self.store,symbol,self.cfg,self.now+1)
            self.assertEqual(row['status'],'pending')
            self.assertGreater(row['predicted_price'],0)

    def test_selection_ignores_final_scores_and_does_not_require_baseline_wins(self):
        for row in self.store.db.execute('SELECT id FROM models WHERE symbol=?',('BTCUSDT',)).fetchall():
            model=self.store.model(row[0]);meta=model['metadata'];rank=ALGORITHMS.index(meta['algorithm'])
            meta['validation_metrics'].update(price_rmse_usdt=500.+rank*10,return_rmse=10.)
            meta['baseline_metrics'].update(price_rmse_usdt=1.,return_rmse=.001)
            meta['final_evaluation']['metrics']['price_rmse_usdt']=1000.-rank*200
            self.store.db.execute('UPDATE models SET metadata=? WHERE id=?',(canonical(meta),model['id']))
        with self.store.transaction():
            chosen=select_best(self.store,'BTCUSDT',self.cfg,self.now+1)
            repeated=select_best(self.store,'BTCUSDT',self.cfg,self.now+1)
            row=generate(self.store,'BTCUSDT',self.cfg,self.now+2)
        self.assertEqual(chosen['algorithm'],'ridge')
        self.assertEqual(chosen,repeated)
        self.assertEqual(row['status'],'pending')
        self.assertEqual(prediction_result(self.store,'BTCUSDT',self.now+2)['status'],'experimental')

    def test_training_and_forecasts_are_repeatable_and_do_not_overwrite_the_ledger(self):
        with self.store.transaction():
            repeated=train_models(self.store,'BTCUSDT',self.cfg,self.now+1)
            first=generate(self.store,'BTCUSDT',self.cfg,self.now+1)
            second=generate(self.store,'BTCUSDT',self.cfg,self.now+2)
        self.assertTrue(all(r['result']=='already_registered' for r in repeated))
        self.assertEqual(first,second)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM predictions').fetchone()[0],1)

    def test_artifact_corruption_future_training_and_invalid_source_fail_without_numeric_output(self):
        model=self.store.active('BTCUSDT')
        self.store.db.execute("UPDATE models SET artifact='{}' WHERE id=?",(model['id'],))
        with self.store.transaction():result=generate(self.store,'BTCUSDT',self.cfg,self.now+1)
        self.assertEqual(result['status'],'unavailable')
        self.assertNotIn('predicted_price',result)
        with self.store.transaction():
            self.store.db.execute('UPDATE candles SET volume=volume+1 WHERE symbol=? AND open_time=?',('ETHUSDT',int(self.raw.open_time.iloc[0])))
            result=generate(self.store,'ETHUSDT',self.cfg,self.now+1)
        self.assertEqual(result['status'],'unavailable')
        model=self.store.active('SOLUSDT');meta=model['metadata'];meta['trained_at']=self.now+100
        self.store.db.execute('UPDATE models SET metadata=? WHERE id=?',(canonical(meta),model['id']))
        with self.store.transaction():result=generate(self.store,'SOLUSDT',self.cfg,self.now+1)
        self.assertEqual(result['status'],'unavailable')

    def test_cli_select_predict_status_and_publication_preserve_existing_records(self):
        cfg=Path(self.tmp.name)/'config.json';cfg.write_text(canonical(self.cfg),encoding='utf-8')
        output=Path(self.tmp.name)/'predictions.json'
        with patch('pipeline.utc_ms',return_value=self.now+1),patch('sys.stdout',new_callable=io.StringIO):
            for command in ['select','predict','status','evaluate']:
                args=[command,'--db',str(self.path),'--config',str(cfg)]
                if command=='predict':args+=['--output',str(output)]
                self.assertEqual(main(args),0)
        report=json.loads(json.loads(output.read_text(encoding='utf-8'))['payload'])
        self.assertEqual(len(report['forecasts']),8)
        self.assertTrue(all(f['status']=='experimental' for f in report['forecasts']))
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM models').fetchone()[0],32)


class ChronologyAndLSTMTests(unittest.TestCase):
    def test_lstm_is_trainable_reproducible_and_scalers_never_see_future_values(self):
        data,_=prepare(candles(700));data,x=sequence_data(data,14);cfg=config();plan=evaluation_plan(data,cfg)
        _,training,evaluation=plan[0]
        y=data.target.to_numpy();first=LSTMRegressor(42,8,2).fit(x[training],y[training])
        np.testing.assert_allclose(first.scaler.mean_,x[training].reshape(-1,len(FEATURES)).mean(axis=0))
        changed=x.copy();changed[evaluation]*=1000
        second=LSTMRegressor(42,8,2).fit(changed[training],y[training])
        from features import FEATURE_VERSION
        a=first.artifact(FEATURES,FEATURE_VERSION);b=second.artifact(FEATURES,FEATURE_VERSION)
        self.assertEqual(canonical(a),canonical(b))
        np.testing.assert_allclose(predict(a,x[evaluation]),first.predict(x[evaluation]),atol=1e-12,rtol=0)
        a['weights']['head.bias']=[float('nan')]
        with self.assertRaises(ValueError):predict(a,x[evaluation])

    def test_ridge_scaler_and_sequence_endpoints_use_training_history_only(self):
        data,_=prepare(candles(700));aligned,x=sequence_data(data,14)
        np.testing.assert_allclose(x[0,-1],aligned[FEATURES].iloc[0])
        boundary=int(aligned.source_time.iloc[400]);training=training_slice(aligned,boundary,None,'expanding',boundary,180)
        model=candidates(42)['ridge'].fit(training[FEATURES],training.target)
        np.testing.assert_allclose(model.steps[0][1].mean_,training[FEATURES].mean())
        self.assertLess(training.target_time.max(),boundary)


if __name__=='__main__':unittest.main()
