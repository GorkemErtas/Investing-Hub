"""Synthetic reviewed observations and provenance; all regression tests are offline."""
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from anomaly_reviews import AnomalyReviewError, load_policy, row_fingerprint
from common import DAY_MS, canonical, digest, iso
from features import validate_candles, prepare
from forecast import generate
from ingestion import sync, import_legacy
from store import fingerprint
from train import train_models, select_best
from test_lifecycle import DatabaseTests, config
from test_pipeline import candles


def extreme_frame(n=80, index=31):
    frame = candles(n)
    frame.loc[index, ['open', 'high', 'low', 'close']] *= 1.9
    return frame


class ReviewedProvider:
    """Synthetic official-looking metadata, scoped to temporary test approvals."""
    def __init__(self, frame, symbol, now):
        self.frame, self.symbol, self.now = frame, symbol, now
        self.sources = {}
        for period, rows in frame.groupby(pd.to_datetime(frame.open_time, unit='ms', utc=True).dt.strftime('%Y-%m')):
            sha = fingerprint(rows)
            self.sources[period] = {'provider': 'Binance', 'kind': 'monthly_archive',
                'url': f'https://data.binance.vision/data/spot/monthly/klines/{symbol}/1d/{symbol}-1d-{period}.zip',
                'sha256': sha, 'publisher_sha256': sha, 'checksum_sidecar_sha256': digest(b'TEST FIXTURE SIDECAR'),
                'retrieved_at': now, 'interval': '1d', 'timezone': 'UTC', 'timestamp_unit': 'normalized_unix_ms'}

    def archive(self, symbol, period):
        assert symbol == self.symbol
        stamps = pd.to_datetime(self.frame.open_time, unit='ms', utc=True).dt.strftime('%Y-%m' if len(period)==7 else '%Y-%m-%d')
        return self.frame.loc[stamps == period].copy(), self.sources[period[:7]]

    def recent(self, symbol, start, end):
        assert symbol == self.symbol
        rows = self.frame.loc[self.frame.open_time.between(start, end)].copy()
        period = pd.to_datetime(start, unit='ms', utc=True).strftime('%Y-%m')
        return rows, self.sources[period]

    def context(self):
        return {int(row.open_time): self.sources[pd.to_datetime(row.open_time, unit='ms', utc=True).strftime('%Y-%m')] for row in self.frame.itertuples()}


def fixture_policy(provider, index):
    previous, current = provider.frame.iloc[index-1], provider.frame.iloc[index]
    evidence = copy.deepcopy(provider.sources)
    rest = {'provider': 'Binance', 'kind': 'rest_klines',
        'url': f'https://data-api.binance.vision/api/v3/klines?symbol={provider.symbol}&interval=1d&timeZone=0&startTime={int(previous.open_time)}&endTime={int(current.close_time)}&limit=2',
        'sha256': digest(b'TEST FIXTURE REST'), 'publisher_sha256': None, 'retrieved_at': provider.now,
        'interval': '1d', 'timezone': 'UTC', 'timestamp_unit': 'normalized_unix_ms'}
    rest_key = 'rest-'+str(int(current.open_time))
    evidence[rest_key] = rest
    points = {}
    for label, row in [('previous', previous), ('current', current)]:
        period = pd.to_datetime(row.open_time, unit='ms', utc=True).strftime('%Y-%m')
        points[label] = {'open_time': int(row.open_time), 'close': str(row.close), 'row_sha256': row_fingerprint(row), 'evidence': [period, rest_key]}
    date = pd.to_datetime(current.open_time, unit='ms', utc=True).strftime('%Y-%m-%d')
    return {'version': 1, 'evidence': evidence, 'reviews': [{'id': provider.symbol+'/'+date,
        'symbol': provider.symbol, 'utc_date': date, 'reviewed_at': iso(provider.now).replace('+00:00', 'Z'),
        'verification': 'publisher_checksum_and_official_rest_exact_row_match', 'reason': 'TEST FIXTURE, NOT REAL SOURCE APPROVAL', **points}]}


class ReviewPolicyTests(DatabaseTests):
    def setUp(self):
        super().setUp()
        self.raw = extreme_frame()
        self.now = int(self.raw.close_time.max()) + 1000
        self.provider = ReviewedProvider(self.raw, 'DOGEUSDT', self.now)
        self.policy = fixture_policy(self.provider, 31)
        self.review_path = Path(self.tmp.name)/'reviews.json'
        self.save_policy()
        self.patcher = patch('anomaly_reviews.POLICY_PATH', self.review_path)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def save_policy(self):
        self.review_path.write_text(canonical(self.policy), encoding='utf-8')

    def validate(self, frame=None, symbol='DOGEUSDT', sources=None):
        return validate_candles(self.raw if frame is None else frame, now_ms=self.now, symbol=symbol,
                                sources=self.provider.context() if sources is None else sources)

    def test_exact_review_preserves_every_value_and_reports_audit(self):
        checked, quality = self.validate()
        pd.testing.assert_frame_equal(checked[self.raw.columns], self.raw, check_dtype=False)
        self.assertEqual(fingerprint(checked), fingerprint(self.raw))
        self.assertEqual(quality['anomalies'], 1)
        detail = quality['anomaly_reviews']['approved'][0]
        self.assertEqual(detail['review_id'], 'DOGEUSDT/2020-02-01')
        self.assertEqual(detail['review_status'], 'approved')
        self.assertEqual(row_fingerprint(self.raw.iloc[[31]].iloc[0]), fingerprint(self.raw.iloc[[31]]))

    def test_unreviewed_symbol_date_and_missing_context_fail_with_diagnostics(self):
        for symbol, sources, status in [('BTCUSDT', self.provider.context(), 'unreviewed'),
                                        ('DOGEUSDT', {}, 'source_evidence_mismatch')]:
            with self.subTest(symbol=symbol, status=status), self.assertRaises(AnomalyReviewError) as caught:
                self.validate(symbol=symbol, sources=sources)
            self.assertIn(symbol+' UTC 2020-02-01', str(caught.exception))
            self.assertIn('observed_return=', str(caught.exception))
            self.assertEqual(caught.exception.details[0]['review_status'], status)
        moved = self.raw.copy(); moved[['open_time','close_time']] += DAY_MS
        with self.assertRaisesRegex(AnomalyReviewError, 'unreviewed'):
            validate_candles(moved, now_ms=self.now+DAY_MS, symbol='DOGEUSDT', sources={})

    def test_prices_volume_and_source_hash_must_match_exactly(self):
        for column in ('close', 'volume'):
            changed = self.raw.copy(); changed[column] = changed[column].astype(float); changed.loc[31, column] *= 1.000001
            with self.subTest(column=column), self.assertRaisesRegex(AnomalyReviewError, 'observed_values_mismatch'):
                self.validate(changed)
        for field in ('sha256', 'publisher_sha256', 'checksum_sidecar_sha256', 'url', 'retrieved_at'):
            sources = copy.deepcopy(self.provider.context())
            sources[int(self.raw.open_time.iloc[31])] = {**sources[int(self.raw.open_time.iloc[31])], field: 'bad'}
            with self.subTest(field=field), self.assertRaisesRegex(AnomalyReviewError, 'source_evidence_mismatch'):
                self.validate(sources=sources)

    def test_gap_does_not_approve_nonconsecutive_candles(self):
        with self.assertRaisesRegex(AnomalyReviewError, 'nonconsecutive_previous_candle'):
            self.validate(self.raw.drop(index=30))

    def test_policy_requires_valid_publisher_checksum_corroboration_and_exact_dates(self):
        for mutate in (lambda p: p['evidence']['2020-02'].update(publisher_sha256='f'*64),
                       lambda p: p['reviews'][0]['current'].update(evidence=['2020-02']),
                       lambda p: p['reviews'][0]['current'].update(open_time=0),
                       lambda p: p['reviews'].append(copy.deepcopy(p['reviews'][0]))):
            original = copy.deepcopy(self.policy)
            mutate(self.policy); self.save_policy()
            with self.assertRaises(ValueError):
                self.validate()
            self.policy = original
        self.save_policy()

    def test_threshold_cannot_be_raised_to_bypass_reviews(self):
        for threshold in (1., float('inf'), float('nan')):
            with self.assertRaises(ValueError):
                validate_candles(self.raw, threshold)

    def test_missing_or_ambiguous_policy_fails_with_review_diagnostics(self):
        self.review_path.unlink()
        with self.assertRaisesRegex(AnomalyReviewError, 'DOGEUSDT UTC 2020-02-01.*invalid_review_policy'):
            self.validate()
        self.review_path.write_text('{"version":1,"version":1,"evidence":{},"reviews":[]}',encoding='utf-8')
        with self.assertRaisesRegex(AnomalyReviewError, 'invalid_review_policy'):
            self.validate()

    def test_additional_extreme_needs_a_new_exact_review_before_sync(self):
        raw=self.raw.copy();raw.loc[70,['open','high','low','close']]*=1.9
        provider=ReviewedProvider(raw,'DOGEUSDT',self.now)
        with self.assertRaisesRegex(AnomalyReviewError,'2020-03-11.*unreviewed'):
            sync(self.store,provider,'DOGEUSDT',int(raw.open_time.min()),self.now)
        extra=fixture_policy(provider,70)
        self.policy['evidence'].update(extra['evidence']);self.policy['reviews'].extend(extra['reviews']);self.save_policy()
        sync(self.store,provider,'DOGEUSDT',int(raw.open_time.min()),self.now)
        self.assertEqual(self.store.verified_frame('DOGEUSDT',self.now)[2]['anomalies'],2)

    def test_initial_cross_month_sync_stored_integrity_and_idempotency(self):
        result = sync(self.store, self.provider, 'DOGEUSDT', int(self.raw.open_time.min()), self.now)
        self.assertEqual(result['added'], len(self.raw))
        checked, metadata, quality = self.store.verified_frame('DOGEUSDT', self.now)
        self.assertEqual(metadata['fingerprint'], fingerprint(self.raw))
        self.assertEqual(metadata['anomaly_reviews']['approved'], quality['anomaly_reviews']['approved'])
        self.assertEqual(sync(self.store,self.provider,'DOGEUSDT',int(self.raw.open_time.min()),self.now)['added'],0)
        self.assertEqual(checked.close.iloc[31], self.raw.close.iloc[31])
        self.policy['reviews'] = []; self.save_policy()
        with self.assertRaisesRegex(AnomalyReviewError, 'unreviewed'):
            self.store.verified_frame('DOGEUSDT', self.now)

    def test_unreviewed_boundary_rolls_back_all_rows_sources_and_events(self):
        self.policy['reviews'] = []; self.save_policy()
        with self.assertRaises(AnomalyReviewError):
            sync(self.store,self.provider,'DOGEUSDT',int(self.raw.open_time.min()),self.now)
        for table in ('candles','sources','datasets','dataset_versions','events','models','predictions'):
            self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0)

    def test_existing_dataset_survives_failed_incremental_ingestion(self):
        sync(self.store,self.provider,'DOGEUSDT',int(self.raw.open_time.min()),int(self.raw.close_time.iloc[29])+1000)
        before = self.store.dataset('DOGEUSDT')
        old_rows = self.store.frame('DOGEUSDT').copy()
        self.policy['reviews'] = [];self.save_policy()
        with self.assertRaises(AnomalyReviewError):
            sync(self.store,self.provider,'DOGEUSDT',int(self.raw.open_time.min()),self.now)
        self.assertEqual(before,self.store.dataset('DOGEUSDT'))
        pd.testing.assert_frame_equal(old_rows,self.store.frame('DOGEUSDT'))

    def test_source_and_review_audit_tampering_are_detected(self):
        sync(self.store,self.provider,'DOGEUSDT',int(self.raw.open_time.min()),self.now)
        metadata=self.store.dataset('DOGEUSDT');metadata['anomaly_reviews']['approved']=[]
        self.store.db.execute('UPDATE datasets SET metadata=?',(canonical(metadata),))
        with self.assertRaisesRegex(ValueError,'audit mismatch'):
            self.store.verified_frame('DOGEUSDT',self.now)
        self.store.db.execute("UPDATE sources SET metadata='{}'")
        with self.assertRaisesRegex(ValueError,'provenance integrity'):
            self.store.verified_frame('DOGEUSDT',self.now)

    def test_missing_dataset_fails_without_creating_history(self):
        with self.assertRaisesRegex(ValueError,'absent provenance'):
            self.store.verified_frame('DOGEUSDT',self.now)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM predictions').fetchone()[0],0)

    def test_reviewed_legacy_import_reuses_same_policy(self):
        directory=Path(self.tmp.name); csv=directory/'DOGEUSDT.csv';self.raw.to_csv(csv,index=False)
        manifest={'provider':'Binance Vision','assets':{'DOGEUSDT':{'file':csv.name,'sha256':digest(csv.read_bytes()),
            'archives':[{'url':s['url'],'sha256':s['sha256']} for s in self.provider.sources.values()]}}}
        (directory/'provenance.json').write_text(canonical(manifest),encoding='utf-8')
        self.assertTrue(import_legacy(self.store,directory,'DOGEUSDT',self.now))
        self.assertEqual(self.store.verified_frame('DOGEUSDT',self.now)[2]['anomalies'],1)

    def test_training_and_candidate_inference_share_reviewed_prerequisites(self):
        raw=extreme_frame(700,400); now=int(raw.close_time.max())+1000
        provider=ReviewedProvider(raw,'DOGEUSDT',now);self.policy=fixture_policy(provider,400);self.save_policy()
        sync(self.store,provider,'DOGEUSDT',int(raw.open_time.min()),now)
        frame,_,_=self.store.verified_frame('DOGEUSDT',now)
        prepared,_=prepare(frame,now_ms=now,symbol='DOGEUSDT',sources=self.store.candle_sources('DOGEUSDT'))
        self.assertEqual(len(prepared),685)
        cfg=config()
        with self.store.transaction():
            registered=train_models(self.store,'DOGEUSDT',cfg,now)
        with self.store.transaction():
            select_best(self.store,'DOGEUSDT',cfg,now+1)
            prediction=generate(self.store,'DOGEUSDT',cfg,now+1)
        self.assertEqual(prediction['status'],'pending')
        self.assertIsNotNone(self.store.active('DOGEUSDT'))
        self.assertEqual(json.loads(prediction['details'])['model_status_at_generation'],'active')
        self.policy['reviews']=[];self.save_policy()
        self.assertEqual(generate(self.store,'DOGEUSDT',cfg,now+2)['status'],'unavailable')
        with self.assertRaises(AnomalyReviewError):
            train_models(self.store,'DOGEUSDT',cfg,now+2)


class CommittedPolicyTests(unittest.TestCase):
    def test_only_independently_reviewed_doge_dates_are_approved(self):
        policy,sha=load_policy()
        self.assertEqual([r['utc_date'] for r in policy['reviews']],['2021-01-02','2021-01-28','2021-04-16'])
        self.assertEqual(len(sha),64)
        self.assertEqual(policy['evidence']['monthly-2021-01']['publisher_sha256'], '97eb6a9187e490a280b08b2fecdcd2b77593cf4063ee91f2a9df415ed947a6af')


if __name__=='__main__':
    unittest.main()
