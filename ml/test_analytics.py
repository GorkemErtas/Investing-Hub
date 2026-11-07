"""Deterministic synthetic analytics fixtures; never real research results."""
import csv
import json
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pandas as pd
from analytics.statistics import summary, block_test, block_indices, holm, descriptive, correlations
from analytics.classification import classification_metrics, research
from analytics.anomalies import detect
from analytics.report import build_report, DEFAULT_CONFIG
from analytics.cli import run
from analytics.export import safe_cell
from analytics.sql import query
from common import DAY_MS, canonical
from features import validate_candles, feature_frame, FEATURES
from store import Store
from test_lifecycle import DatabaseTests, seed
from test_pipeline import candles


class StatisticsTests(unittest.TestCase):
    def test_summary_keeps_extremes_and_handles_empty_constant_and_small_samples(self):
        values = [0., 0., 0., .7]
        self.assertAlmostEqual(summary(values)['mean'], .175)
        self.assertEqual(summary(values)['samples'], 4)
        self.assertIsNone(summary([]))
        self.assertIsNone(summary([1, 1, 1, 1])['skewness'])
        self.assertIsNone(summary([1])['variance'])

    def test_circular_blocks_and_reproducible_dependence_inference(self):
        indices = block_indices(100, 14, np.random.default_rng(42))
        self.assertTrue(np.all(np.diff(indices[:14]) % 100 == 1))
        a = np.sin(np.arange(180) / 5) * .01
        first = block_test(a, a+.1, resamples=199)
        self.assertEqual(first, block_test(a, a+.1, resamples=199))
        self.assertGreater(first['ciLow'], 0)
        self.assertLess(first['pValue'], .02)
        with self.assertRaises(ValueError):
            block_test([0] * 20, [0] * 20)

    def test_holm_preserves_family_and_order(self):
        tests = [{'pValue': .04}, {'pValue': .001}, {'pValue': .03}, {'status': 'unavailable'}]
        self.assertEqual(holm(tests), 3)
        self.assertEqual([t.get('adjustedP') for t in tests], [.06, .003, .06, None])

    def test_missing_days_are_not_filled_or_joined_into_returns(self):
        raw = candles(400).drop(index=200)
        frame, _ = validate_candles(raw)
        result, returns = descriptive(frame, {**DEFAULT_CONFIG, 'bootstrap_resamples': 99})
        self.assertEqual(result['returns']['samples'], 397)
        self.assertTrue(np.isnan(returns.loc[int(candles(400).close_time.iloc[201])]))
        self.assertTrue(all(t['status'] == 'insufficient_data' for t in result['tests']))

    def test_correlations_require_aligned_complete_calendar_windows(self):
        index = np.arange(40) * DAY_MS
        a = pd.Series(np.sin(np.arange(40)), index=index)
        result = correlations({'BTCUSDT': a, 'ETHUSDT': a.copy()})
        self.assertAlmostEqual(result['BTCUSDT'][0]['value'], 1)
        b = a.copy(); b.iloc[-3] = np.nan
        self.assertIsNone(correlations({'BTCUSDT': a, 'ETHUSDT': b})['BTCUSDT'][0]['value'])

class ClassifierTests(unittest.TestCase):
    def test_confusion_imbalance_auc_ap_and_brier(self):
        result = classification_metrics([0,0,1,1], [.1,.6,.8,.4])
        self.assertEqual(result['confusion'], [1,1,1,1])
        self.assertEqual(result['accuracy'], .5)
        self.assertEqual(result['precision'], .5)
        self.assertAlmostEqual(result['brier'], (.01+.36+.04+.36)/4)
        degenerate = classification_metrics([0]*20, [.01]*20)
        self.assertEqual(degenerate['accuracy'], 1)
        self.assertIsNone(degenerate['averagePrecision'])
        self.assertIsNone(degenerate['rocAuc'])
        self.assertIsNone(degenerate['balancedAccuracy'])
        with self.assertRaises(ValueError):
            classification_metrics([1], [float('nan')])

    def test_training_thresholds_and_early_folds_do_not_see_changed_future(self):
        frame, _ = validate_candles(candles(620))
        data = feature_frame(frame).dropna(subset=FEATURES+['target','target_time'])
        cfg = {**DEFAULT_CONFIG, 'fold_days':30, 'walk_forward_splits':2}
        first = research(data, cfg, 'a'*64, 'b'*64)
        changed = data.copy()
        changed.loc[changed.index[-20:], 'target'] *= 20
        second = research(changed, cfg, 'a'*64, 'b'*64)
        self.assertEqual([r for r in first if r['fold']==1], [r for r in second if r['fold']==1])
        for a, b in zip(first, second):
            self.assertEqual(a['threshold'], b['threshold'])
            self.assertEqual(a['eventThreshold'], b['eventThreshold'])
            self.assertLess(a['trainEnd'], a['validationStart'])
            self.assertLess(a['validationEnd'], a['evaluationStart'])
        self.assertEqual(first, research(data, cfg, 'a'*64, 'b'*64))

    def test_single_class_training_remains_explicit(self):
        frame, _ = validate_candles(candles(620))
        data = feature_frame(frame).dropna(subset=FEATURES+['target','target_time'])
        data['target'] = .001
        rows = research(data, {**DEFAULT_CONFIG, 'fold_days':30,'walk_forward_splits':2}, 'a'*64, 'b'*64)
        self.assertTrue(any(r['status']=='single_class_training' and r['metrics'] is None for r in rows))

class AnalyticsIntegrationTests(DatabaseTests):
    def test_failed_asset_does_not_leave_partial_csv_rows(self):
        raw = candles(80); now = int(raw.close_time.max())+1000
        seed(self.store, raw, now)
        with patch('analytics.report.detect', return_value=({}, [{'time':'2020-01-01T00:00:00Z','method':'rolling_z'}])), patch('analytics.report.registry_models', side_effect=ValueError('invalid model fixture')):
            report, evaluated, events = build_report(self.store, self.path, now, {'bootstrap_resamples':99})
        self.assertEqual(report['assets'][0]['status'], 'unavailable')
        self.assertEqual(events, [])
        self.assertEqual(evaluated, [])

    def test_readonly_does_not_create_mutate_or_write_events(self):
        raw = candles(80); now = int(raw.close_time.max())+1000
        seed(self.store, raw, now)
        before = self.path.read_bytes()
        reader = Store.readonly(self.path)
        try:
            with self.assertRaises(sqlite3.OperationalError):
                reader.db.execute("DELETE FROM models")
            self.assertEqual(reader.verified_frame('BTCUSDT', now)[1]['rows'], 80)
            report, _, _ = build_report(reader, self.path, now, {'bootstrap_resamples':99})
            self.assertEqual(report['assets'][0]['status'], 'insufficient_data')
            self.assertEqual(len(report['assets']), 8)
            self.assertEqual(report['assets'][1]['reason'], 'no_verified_dataset')
        finally:
            reader.close()
        self.assertEqual(before, self.path.read_bytes())
        with self.assertRaises(sqlite3.OperationalError):
            Store.readonly(Path(self.tmp.name)/'absent.sqlite3')

    def test_sql_join_windows_and_transient_anomaly_frequency(self):
        raw = candles(40); now=int(raw.close_time.max())+1000
        seed(self.store, raw, now)
        rows=query(self.store,'observations',symbol='BTCUSDT')
        self.assertAlmostEqual(rows[0]['daily_return'], raw.close.iloc[-1]/raw.close.iloc[-2]-1)
        self.assertEqual(query(self.store,'assets')[0]['rows'],40)
        self.assertEqual(query(self.store,'versions',symbol='BTCUSDT'),[])
        events=[{'time':'2025-01-01T00:00:00Z','method':'rolling_z'}, {'time':'2025-01-02T00:00:00Z','method':'rolling_z'}]
        self.assertEqual(query(self.store,'anomaly_frequency',anomalies=canonical(events)),[{'month':'2025-01','method':'rolling_z','flags':2}])
        evaluated=[{'model_id':'fixture','target_time':i,'actual_return':0.,'predicted_return': .1 if i>=30 else .01} for i in range(60)]
        drift=query(self.store,'deterioration',evaluated=canonical(evaluated))[0]
        self.assertEqual(drift['recent_samples'],30)
        self.assertAlmostEqual(drift['recent_mse'],.01)
        self.assertAlmostEqual(drift['previous_mse'],.0001)

    def test_immutable_csv_export_and_registry_invariants(self):
        raw=candles(80); now=int(raw.close_time.max())+1000; seed(self.store,raw,now)
        before=self.path.read_bytes()
        destination=Path(self.tmp.name)/'analytics'
        result=run(self.path,destination,now)
        self.assertEqual(before,self.path.read_bytes())
        output=Path(result['directory'])
        with (output/'descriptive_statistics.csv').open(encoding='utf-8-sig',newline='') as stream:
            records=list(csv.DictReader(stream))
        self.assertTrue(records)
        self.assertEqual(records[0]['symbol'],'BTCUSDT')
        self.assertTrue((output/'columns.json').exists())
        self.assertTrue((destination/'latest.json').exists())
        self.assertEqual(safe_cell('=HYPERLINK("x")'), '\'=HYPERLINK("x")')
        self.assertEqual(safe_cell(-.5),-.5)

    def test_anomaly_causality_references_and_determinism(self):
        raw=candles(320); frame,_=validate_candles(raw); x=feature_frame(frame); x['segment']=frame.segment
        # Controlled feature shock is synthetic and never written into real data.
        x.loc[250,'log_volume_change']=8
        first, events=detect(x, DEFAULT_CONFIG)
        changed=x.copy(); changed.loc[280:,'log_volume_change']=12
        _, later=detect(changed,DEFAULT_CONFIG)
        cutoff=stamp_time=int(x.loc[279,'source_time'])
        from analytics.statistics import stamp
        self.assertEqual([e for e in events if e['time']<=stamp(cutoff)], [e for e in later if e['time']<=stamp(cutoff)])
        self.assertEqual((first,events),detect(x,DEFAULT_CONFIG))
        self.assertTrue(any(e['time']==stamp(int(x.loc[250,'source_time'])) for e in events))
        self.assertTrue(all(e['referenceEnd']<e['time'] for e in events))
        self.assertFalse(first['labelsAvailable'])


if __name__=='__main__':
    unittest.main()
