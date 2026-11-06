"""Synthetic fixtures are restricted to tests; no live network is required."""
from __future__ import annotations

import io
import json
import shutil
import uuid
import unittest
import urllib.error
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pandas as pd

from artifact import export_model, predict, tree_predict
from common import COLUMNS, DAY_MS, ROOT, canonical, day, digest, latest_open, load_config
from features import FEATURES, FEATURE_VERSION, prepare, validate_candles
from forecast import generate, reconcile
from ingestion import import_legacy, sync
from pipeline import main
from provider import ArchiveMissing, Binance, ProviderError
from registry import approve, evaluate, promote, reject, rollback
from store import Store, fingerprint
from test_pipeline import candles
from train import candidates, train_models, training_slice, walk_forward


def config():
    result = load_config()
    result.update({'fold_days': 30, 'training_years': [None, 1]})
    return result


def seed(store, frame, now, symbol='BTCUSDT'):
    source = {'kind': 'test_fixture', 'url': 'https://example.test/fixture',
              'sha256': fingerprint(frame), 'retrieved_at': now}
    identity = digest(canonical(source).encode())
    with store.transaction():
        return store.save_candles(symbol, frame, [source], {int(t): identity for t in frame.open_time}, now)


class FixtureProvider:
    def __init__(self, frame, now):
        self.frame, self.now, self.calls = frame, now, []
        self.failure = None
        self.missing_archives = False

    def batch(self, kind, start, end):
        self.calls.append((kind, start, end))
        if self.failure:
            raise self.failure
        subset = self.frame.loc[(self.frame.open_time >= start) & (self.frame.open_time <= end)].copy()
        source = {'kind': kind, 'url': 'https://example.test/' + str(start),
                  'retrieved_at': self.now, 'sha256': fingerprint(subset)}
        return subset, source

    def recent(self, symbol, start, end):
        return self.batch('rest', start, end)

    def archive(self, symbol, period):
        if self.missing_archives:
            raise ArchiveMissing('not published')
        start = day(period + '-01' if len(period) == 7 else period)
        end = (int((pd.Timestamp(start, unit='ms', tz='UTC') + pd.offsets.MonthBegin()).timestamp() * 1000)
               - DAY_MS if len(period) == 7 else start)
        return self.batch('archive', start, end)


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        (ROOT / 'data').mkdir(exist_ok=True)
        directory = ROOT / 'data' / ('test-' + uuid.uuid4().hex)
        # Windows sandbox tokens cannot traverse Python 3.13's mode-0700
        # TemporaryDirectory ACL. Use inherited workspace ACLs for fixtures.
        directory.mkdir()
        self.tmp = SimpleNamespace(name=str(directory))
        self.path = Path(self.tmp.name) / 'lifecycle.sqlite3'
        self.store = Store(self.path)

    def tearDown(self):
        self.store.close()
        directory = Path(self.tmp.name).resolve()
        if directory.parent != (ROOT / 'data').resolve() or not directory.name.startswith('test-'):
            raise ValueError('Unsafe test cleanup path')
        shutil.rmtree(directory)


class IngestionTests(DatabaseTests):
    def test_initial_incremental_idempotent_and_restart(self):
        raw = candles(40)
        first_now = int(raw.open_time.iloc[-2]) + DAY_MS + 1000
        provider = FixtureProvider(raw, first_now)
        first = sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), first_now)
        self.assertEqual(first['added'], 39)
        calls = len(provider.calls)
        second = sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), first_now)
        self.assertEqual(second['added'], 0)
        self.assertEqual(len(provider.calls), calls)
        self.assertEqual(first['dataset'], second['dataset'])
        self.store.close()
        self.store = Store(self.path)
        now = first_now + DAY_MS
        provider.now = now
        third = sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), now)
        self.assertEqual(third['added'], 1)
        self.assertEqual(provider.calls[-1], ('rest', int(raw.open_time.iloc[-1]), int(raw.open_time.iloc[-1])))
        self.assertEqual(third['dataset']['parent'], first['dataset']['fingerprint'])
        self.assertEqual(self.store.verified_frame('BTCUSDT', now)[1]['rows'], 40)

    def test_missing_day_repaired_without_redownloading_history(self):
        raw = candles(45)
        now = int(raw.close_time.iloc[-1]) + 1000
        seed(self.store, raw.drop(index=10), now)
        provider = FixtureProvider(raw, now)
        result = sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), now)
        self.assertEqual(result['added'], 1)
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(provider.calls[0][1:], (int(raw.open_time.iloc[10]), int(raw.open_time.iloc[10])))

    def test_missing_archive_falls_back_to_official_rest(self):
        raw = candles(31)
        now = int(raw.close_time.iloc[-1]) + 1000
        provider = FixtureProvider(raw, now)
        provider.missing_archives = True
        sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), now)
        self.assertEqual(provider.calls[0][0], 'rest')

    def test_outage_missing_duplicate_and_incomplete_leave_verified_data_intact(self):
        raw = candles(40)
        now = int(raw.close_time.iloc[-1]) + 1000
        original = seed(self.store, raw.iloc[:35], now - 5 * DAY_MS)
        for mode in ('outage', 'missing', 'duplicate', 'incomplete', 'invalid'):
            with self.subTest(mode=mode):
                broken = raw.copy()
                provider = FixtureProvider(broken, now)
                if mode == 'outage':
                    provider.failure = ProviderError('access restricted')
                elif mode == 'missing':
                    provider.frame = raw.drop(index=38)
                elif mode == 'duplicate':
                    provider.frame = pd.concat([raw, raw.iloc[[-1]]])
                elif mode == 'incomplete':
                    provider.frame.loc[39, 'close_time'] += DAY_MS
                else:
                    provider.frame.loc[39, 'volume'] = -1
                with self.assertRaises((ValueError, ProviderError)):
                    sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), now)
                self.assertEqual(self.store.dataset('BTCUSDT'), original)
                self.assertEqual(len(self.store.frame('BTCUSDT')), 35)

    def test_second_download_failure_rolls_back_first_batch(self):
        raw = candles(65)
        now = int(raw.close_time.iloc[-1]) + 1000
        provider = FixtureProvider(raw, now)
        original = provider.archive
        calls = []

        def fail_second(*args):
            calls.append(args)
            if len(calls) == 2:
                raise ProviderError('interrupted archive')
            return original(*args)

        provider.archive = fail_second
        with self.assertRaises(ProviderError):
            sync(self.store, provider, 'BTCUSDT', int(raw.open_time.iloc[0]), now)
        self.assertTrue(self.store.frame('BTCUSDT').empty)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM sources').fetchone()[0], 0)

    def test_conflicting_record_rolls_back(self):
        raw = candles(35)
        now = int(raw.close_time.iloc[-1]) + 1000
        original = seed(self.store, raw, now)
        broken = raw.copy()
        broken.loc[0, 'volume'] += 1
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            seed(self.store, broken, now)
        self.assertEqual(self.store.dataset('BTCUSDT'), original)

    def test_dataset_and_source_tampering_detected(self):
        raw = candles(35)
        now = int(raw.close_time.iloc[-1]) + 1000
        seed(self.store, raw, now)
        self.store.db.execute("UPDATE candles SET volume=volume+1 WHERE open_time=(SELECT MIN(open_time) FROM candles)")
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            self.store.verified_frame('BTCUSDT', now)
        self.store.db.execute("UPDATE candles SET volume=volume-1 WHERE open_time=(SELECT MIN(open_time) FROM candles)")
        self.store.db.execute("UPDATE sources SET metadata='{}'")
        with self.assertRaisesRegex(ValueError, 'provenance'):
            self.store.verified_frame('BTCUSDT', now)

    def test_legacy_import_verifies_checksum_and_preserves_original(self):
        raw = candles(35)
        directory = Path(self.tmp.name)
        path = directory / 'BTCUSDT.csv'
        raw.to_csv(path, index=False)
        payload = path.read_bytes()
        manifest = {'provider': 'Binance Vision', 'downloaded_at': '2021-01-01', 'assets': {
            'BTCUSDT': {'file': path.name, 'sha256': digest(payload),
                        'archives': [{'url': 'https://data.binance.vision/example', 'sha256': 'a' * 64}]}}}
        (directory / 'provenance.json').write_text(json.dumps(manifest))
        now = int(raw.close_time.iloc[-1]) + 1000
        self.assertTrue(import_legacy(self.store, directory, 'BTCUSDT', now))
        self.assertEqual(path.read_bytes(), payload)
        self.assertFalse(import_legacy(self.store, directory, 'BTCUSDT', now))
        path.write_bytes(payload + b'corruption')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            import_legacy(self.store, directory, 'BTCUSDT', now)

    def test_exact_utc_midnight_and_millisecond_completion(self):
        opening = day('2024-01-01')
        self.assertEqual(latest_open(opening), opening - DAY_MS)
        self.assertEqual(latest_open(opening - 1), opening - 2 * DAY_MS)
        raw = candles(1)
        close = int(raw.close_time.iloc[0])
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            validate_candles(raw, now_ms=close)
        validate_candles(raw, now_ms=close + 1)
        raw['open_time'] = raw['open_time'].astype(float)
        raw.loc[0, 'open_time'] += 0.5
        with self.assertRaises(ValueError):
            validate_candles(raw, now_ms=close + 1)


class ProviderTests(unittest.TestCase):
    def test_units_normalize_but_mixed_seconds_fractional_rejected(self):
        row = candles(1)[COLUMNS].iloc[0].tolist()
        row[0], row[6] = int(row[0]), int(row[6])
        micro = [row[0] * 1000, *row[1:6], row[6] * 1000 + 999]
        pd.testing.assert_frame_equal(Binance.parse_rows([row]), Binance.parse_rows([micro]))
        for bad in ([row[0] * 1000, *row[1:]], [row[0] // 1000, *row[1:]],
                    [float(row[0]) + 0.1, *row[1:]], [True, *row[1:]]):
            with self.assertRaises(ProviderError):
                Binance.parse_rows([bad])

    def test_bounded_timeouts_retries_and_rate_limit_no_retry(self):
        calls, pauses = [], []

        def unavailable(req, timeout):
            calls.append(timeout)
            raise TimeoutError()

        with self.assertRaises(ProviderError):
            Binance(unavailable, pauses.append).download('https://data-api.binance.vision/test')
        self.assertEqual(calls, [20, 20, 20])
        self.assertEqual(pauses, [0.5, 1.0])
        for code in (418, 429, 403, 451):
            opener = unittest.mock.Mock(side_effect=urllib.error.HTTPError(
                'https://data-api.binance.vision/test', code, 'error', {'Retry-After': '120'}, None))
            with self.assertRaises(ProviderError):
                Binance(opener, pauses.append).download('https://data-api.binance.vision/test')
            self.assertEqual(opener.call_count, 1)

    def test_checksum_and_zip_corruption_never_accepted(self):
        provider = Binance()
        for archive, checksum in ((b'bad zip', b'0' * 64 + b'  BTCUSDT-1d-2020-01.zip'),
                                 (b'bad zip', (digest(b'bad zip') + '  BTCUSDT-1d-2020-01.zip').encode())):
            with patch.object(provider, 'download', side_effect=[archive, checksum]):
                with self.assertRaises(ProviderError):
                    provider.archive('BTCUSDT', '2020-01')

    def test_real_archive_parser_checks_member_and_microseconds(self):
        raw = candles(1).iloc[0]
        values = [int(raw.open_time) * 1000, raw.open, raw.high, raw.low, raw.close, raw.volume,
                  int(raw.close_time) * 1000 + 999, 0, 1, 0, 0, 0]
        for member in ('BTCUSDT-1d-2020-01-01.csv', '../escape.csv'):
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, 'w') as zipped:
                zipped.writestr(member, ','.join(map(str, values)) + '\n')
            payload = buffer.getvalue()
            checksum = (digest(payload) + '  BTCUSDT-1d-2020-01-01.zip').encode()
            provider = Binance(clock=lambda: 1)
            with patch.object(provider, 'download', side_effect=[payload, checksum]):
                if member.startswith('..'):
                    with self.assertRaises(ProviderError):
                        provider.archive('BTCUSDT', '2020-01-01')
                else:
                    frame, source = provider.archive('BTCUSDT', '2020-01-01')
                    self.assertEqual(int(frame.open_time.iloc[0]), int(raw.open_time))
                    self.assertEqual(source['publisher_sha256'], digest(payload))


class TrainingTests(DatabaseTests):
    def test_chronological_purge_and_window_modes(self):
        raw = candles(800)
        data, _ = prepare(raw)
        cfg = config()
        for mode in ('rolling', 'expanding'):
            cfg['window_mode'] = mode
            folds, _ = walk_forward(data, cfg, 'ridge', 365)
            self.assertEqual(folds[-1]['role'], 'selection')
            for fold in folds:
                self.assertLess(fold['train_target_end'], fold['evaluation_source_start'])
                self.assertLessEqual(fold['train_samples'], 365 if mode == 'rolling' else 460)
            self.assertTrue(all(f['evaluation_target_end'] < folds[i + 1]['evaluation_source_start']
                                for i, f in enumerate(folds[:-1])))

    def test_scaler_uses_training_only(self):
        data, _ = prepare(candles(700))
        boundary = int(data.source_time.iloc[500])
        train = training_slice(data, boundary, None, 'expanding', boundary, 180)
        model = candidates(42)['ridge'].fit(train[FEATURES], train.target)
        np.testing.assert_allclose(model.steps[0][1].mean_, train[FEATURES].mean())
        self.assertLess(train.target_time.max(), boundary)

    def test_all_artifacts_match_sklearn_and_fit_reproducibly(self):
        data, _ = prepare(candles(700))
        for algorithm, model in candidates(42).items():
            with self.subTest(algorithm=algorithm):
                model.fit(data[FEATURES], data.target)
                artifact = export_model(model, algorithm)
                np.testing.assert_allclose(predict(canonical(artifact), data[FEATURES]),
                                           model.predict(data[FEATURES]), atol=1e-12, rtol=0)
                second = candidates(42)[algorithm].fit(data[FEATURES], data.target)
                self.assertEqual(canonical(artifact), canonical(export_model(second, algorithm)))

    def test_registry_training_repeat_and_independent_reproduction(self):
        raw = candles(700)
        now = int(raw.close_time.iloc[-1]) + 1000
        seed(self.store, raw, now)
        cfg = config()
        cfg['training_years'] = [None]
        original_candidates = candidates

        def small_candidates(seed):
            result = original_candidates(seed)
            result['random_forest'].set_params(randomforestregressor__n_estimators=8)
            result['gradient_boosting'].set_params(gradientboostingregressor__n_estimators=8)
            return result

        with patch('train.candidates', small_candidates):
            with self.store.transaction():
                first = train_models(self.store, 'BTCUSDT', cfg, now)
            with self.store.transaction():
                second = train_models(self.store, 'BTCUSDT', cfg, now + 1)
            self.assertEqual([r['model_id'] for r in first], [r['model_id'] for r in second])
            self.assertTrue(all(r['result'] == 'already_registered' for r in second))
            self.assertIsNone(self.store.active('BTCUSDT'))
            other = Store(Path(self.tmp.name) / 'other.sqlite3')
            try:
                seed(other, raw, now)
                with other.transaction():
                    third = train_models(other, 'BTCUSDT', cfg, now)
                self.assertEqual(first, third)
                for result in first:
                    a, b = self.store.model(result['model_id']), other.model(result['model_id'])
                    self.assertEqual(a['artifact'], b['artifact'])
                    self.assertEqual(a['metadata'], b['metadata'])
            finally:
                other.close()

    def test_artifact_malformed_indices_and_feature_contract_rejected(self):
        x = np.zeros((1, len(FEATURES)))
        cyclic = {'left': [0], 'right': [0], 'feature': [0], 'threshold': [1], 'value': [0]}
        with self.assertRaises(ValueError):
            tree_predict(cyclic, x)
        data, _ = prepare(candles(700))
        model = candidates(42)['ridge'].fit(data[FEATURES], data.target)
        artifact = export_model(model, 'ridge')
        artifact['features'] = list(reversed(FEATURES))
        with self.assertRaisesRegex(ValueError, 'contract'):
            predict(artifact, x)


def register(store, model_id, trained_at, value=0.01, historical_pass=True):
    artifact = {'format': 'numeric-sklearn-v1', 'feature_version': FEATURE_VERSION, 'features': FEATURES,
                'algorithm': 'ridge', 'mean': [0] * len(FEATURES), 'scale': [1] * len(FEATURES),
                'coef': [0] * len(FEATURES), 'intercept': value}
    content = canonical(artifact)
    folds = [{'train_target_end': trained_at - 2 * DAY_MS,
              'evaluation_source_start': trained_at - DAY_MS,
              'metrics': {'return_rmse': 0.01}, 'no_change': {'return_rmse': 0.02}} for _ in range(4)]
    report = {'trained_at': trained_at, 'feature_version': FEATURE_VERSION, 'feature_order': FEATURES,
              'artifact_checksum': digest(content.encode()), 'training_range': {'target_end': trained_at - DAY_MS},
              'walk_forward': folds, 'validation_metrics': {'return_rmse': 0.01 if historical_pass else 0.03},
              'baseline_metrics': {'return_rmse': 0.02}, 'historical_pass': historical_pass}
    store.db.execute('INSERT INTO models VALUES(?,?,?,?,?,?)',
                     (model_id, 'BTCUSDT', 'candidate', canonical(report), content, digest(content.encode())))


class ForecastRegistryTests(DatabaseTests):
    def prospective(self, ids=('good',), count=32):
        raw = candles(40 + count)
        price = 100 * 1.01 ** np.arange(len(raw))
        raw[['open', 'close']] = np.column_stack([price, price])
        raw['low'], raw['high'] = price * 0.99, price * 1.01
        now = int(raw.open_time.iloc[39]) + DAY_MS + 1000
        seed(self.store, raw.iloc[:40], now)
        for model_id in ids:
            value = 0.01 if model_id in ('good', 'better') else 0.005 if model_id == 'old' else 0.1
            register(self.store, model_id, now, value)
        for i in range(count):
            for model_id in ids:
                with self.store.transaction():
                    generate(self.store, 'BTCUSDT', config(), now, model_id)
            now += DAY_MS
            seed(self.store, raw.iloc[:41 + i], now)
            with self.store.transaction():
                reconcile(self.store, 'BTCUSDT', now)
        return now, raw

    def test_disabled_and_candidate_cannot_auto_activate(self):
        with self.store.transaction():
            result = generate(self.store, 'BTCUSDT', config(), day('2024-01-01'))
        self.assertEqual(result['status'], 'disabled_unvalidated')
        register(self.store, 'candidate', day('2024-01-01'))
        with self.store.transaction():
            result = promote(self.store, 'candidate', config(), day('2024-01-01'))
        self.assertFalse(result['eligible'])
        self.assertIsNone(self.store.active('BTCUSDT'))

    def test_forward_reconciliation_idempotency_metrics_and_explicit_promotion(self):
        now, raw = self.prospective()
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM predictions WHERE status='evaluated'").fetchone()[0], 32)
        before = self.store.db.execute('SELECT COUNT(*) FROM predictions').fetchone()[0]
        # Duplicate generation returns its immutable original observation.
        with self.store.transaction():
            first = generate(self.store, 'BTCUSDT', config(), now, 'good')
        with self.store.transaction():
            second = generate(self.store, 'BTCUSDT', config(), now + 1, 'good')
        self.assertEqual(first['id'], second['id'])
        self.assertEqual(before + 1, self.store.db.execute('SELECT COUNT(*) FROM predictions').fetchone()[0])
        with self.store.transaction():
            self.assertEqual(reconcile(self.store, 'BTCUSDT', now)['reconciled'], 0)
            self.assertTrue(approve(self.store, 'good', config(), now)['eligible'])
        self.assertEqual(self.store.model('good')['status'], 'approved')
        with self.store.transaction():
            self.assertTrue(promote(self.store, 'good', config(), now)['eligible'])
        self.assertEqual(self.store.active('BTCUSDT')['id'], 'good')
        row = self.store.db.execute("SELECT * FROM predictions WHERE status='evaluated' LIMIT 1").fetchone()
        self.assertAlmostEqual(row['error'], 0, places=10)
        self.assertGreater(row['target_time'], row['generated_at'])
        self.assertGreater(row['generated_at'], row['source_time'])
        self.assertGreater(self.store.db.execute('SELECT COUNT(*) FROM performance').fetchone()[0], 0)

    def test_insufficient_forward_and_worse_baseline_preserve_active(self):
        now, _ = self.prospective(('good', 'bad'))
        with self.store.transaction():
            approve(self.store, 'good', config(), now)
            promote(self.store, 'good', config(), now)
            result = evaluate(self.store, 'bad', config(), now)
        self.assertFalse(result['eligible'])
        self.assertTrue(any('baseline' in r for r in result['reasons']))
        register(self.store, 'fresh', now)
        with self.store.transaction():
            self.assertFalse(approve(self.store, 'fresh', config(), now)['eligible'])
        self.assertEqual(self.store.active('BTCUSDT')['id'], 'good')

    def test_paired_active_gate_and_rollback(self):
        now, _ = self.prospective(('old', 'better'))
        with self.store.transaction():
            self.assertTrue(approve(self.store, 'old', config(), now)['eligible'])
            promote(self.store, 'old', config(), now)
            result = approve(self.store, 'better', config(), now)
            self.assertTrue(result['eligible'])
            promote(self.store, 'better', config(), now)
        self.assertEqual(self.store.model('old')['status'], 'archived')
        with self.store.transaction():
            rollback(self.store, 'old', config(), now, 'reviewed regression')
        self.assertEqual(self.store.active('BTCUSDT')['id'], 'old')
        register(self.store, 'never-active', now)
        self.store.db.execute("UPDATE models SET status='archived' WHERE id='never-active'")
        with self.assertRaisesRegex(ValueError, 'never approved'):
            with self.store.transaction():
                rollback(self.store, 'never-active', config(), now, 'invalid')
        self.assertEqual(self.store.active('BTCUSDT')['id'], 'old')

    def test_worse_than_active_on_same_dates_is_rejected(self):
        now, _ = self.prospective(('good', 'old'))
        with self.store.transaction():
            approve(self.store, 'good', config(), now)
            promote(self.store, 'good', config(), now)
            result = evaluate(self.store, 'old', config(), now)
        self.assertFalse(result['eligible'])
        self.assertTrue(any('identical target' in r for r in result['reasons']))

    def test_historical_failure_cannot_be_rescued_by_forward_scores(self):
        now, _ = self.prospective()
        model = self.store.model('good')
        metadata = model['metadata']
        metadata['validation_metrics']['return_rmse'] = 0.1
        self.store.db.execute('UPDATE models SET metadata=? WHERE id=?', (canonical(metadata), 'good'))
        with self.store.transaction():
            result = approve(self.store, 'good', config(), now)
        self.assertFalse(result['eligible'])
        self.assertIn('Historical development/selection gate failed', result['reasons'])
        self.assertIsNone(self.store.active('BTCUSDT'))

    def test_incomplete_target_is_not_reconciled_and_values_stay_immutable(self):
        raw = candles(40)
        now = int(raw.close_time.iloc[-1]) + 1000
        seed(self.store, raw, now)
        register(self.store, 'shadow', now)
        with self.store.transaction():
            record = generate(self.store, 'BTCUSDT', config(), now, 'shadow')
            result = reconcile(self.store, 'BTCUSDT', now + 1000)
        self.assertEqual(result['reconciled'], 0)
        saved = dict(self.store.db.execute('SELECT * FROM predictions WHERE id=?', (record['id'],)).fetchone())
        self.assertEqual(saved, record)
        self.assertEqual(saved['status'], 'pending')
        self.assertIsNone(saved['actual_price'])

    def test_rollback_refuses_expired_and_corrupted_prior_models(self):
        now, _ = self.prospective(('old', 'better'))
        with self.store.transaction():
            approve(self.store, 'old', config(), now)
            promote(self.store, 'old', config(), now)
            approve(self.store, 'better', config(), now)
            promote(self.store, 'better', config(), now)
        with self.assertRaisesRegex(ValueError, 'expired'):
            with self.store.transaction():
                rollback(self.store, 'old', config(), now + 100 * DAY_MS, 'too old')
        self.store.db.execute("UPDATE models SET artifact='{}' WHERE id='old'")
        with self.assertRaisesRegex(ValueError, 'checksum'):
            with self.store.transaction():
                rollback(self.store, 'old', config(), now, 'corrupted')
        self.assertEqual(self.store.active('BTCUSDT')['id'], 'better')

    def test_failed_stale_rejected_forecasts_and_checksum_audit(self):
        raw = candles(40)
        now = int(raw.close_time.iloc[-1]) + 1000
        seed(self.store, raw, now)
        register(self.store, 'expired', now - 100 * DAY_MS)
        register(self.store, 'rejected', now)
        with self.store.transaction():
            reject(self.store, 'rejected', 'failed review', now)
            expired = generate(self.store, 'BTCUSDT', config(), now, 'expired')
            rejected = generate(self.store, 'BTCUSDT', config(), now, 'rejected')
        self.assertEqual(expired['status'], 'failed')
        self.assertEqual(rejected['status'], 'rejected')
        self.assertIsNone(expired['predicted_price'])
        self.store.db.execute("UPDATE models SET artifact='{}' WHERE id='expired'")
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.store.model('expired')

    def test_no_backdated_unavailable_or_completed_target_forecast(self):
        raw = candles(40)
        now = int(raw.close_time.iloc[-1]) + 1000
        seed(self.store, raw, now + 1000)
        register(self.store, 'candidate', now)
        with self.store.transaction():
            result = generate(self.store, 'BTCUSDT', config(), now, 'candidate')
        self.assertEqual(result['status'], 'failed')
        self.assertIn('retrieved', json.loads(result['details'])['reason'])
        register(self.store, 'stale-data', now)
        with self.store.transaction():
            result = generate(self.store, 'BTCUSDT', config(), now + DAY_MS, 'stale-data')
        self.assertEqual(result['status'], 'failed')
        self.assertIn('stale', json.loads(result['details'])['reason'])

    def test_rollback_transaction_failure_preserves_old_active(self):
        now, _ = self.prospective(('old', 'better'))
        with self.store.transaction():
            approve(self.store, 'old', config(), now)
            promote(self.store, 'old', config(), now)
            approve(self.store, 'better', config(), now)
        self.store.db.execute("CREATE TRIGGER promotion_failure BEFORE UPDATE OF status ON models "
                              "WHEN NEW.id='better' AND NEW.status='active' BEGIN SELECT RAISE(ABORT,'injected failure'); END")
        with self.assertRaises(Exception):
            with self.store.transaction():
                promote(self.store, 'better', config(), now)
        self.assertEqual(self.store.active('BTCUSDT')['id'], 'old')


class CLITests(DatabaseTests):
    def test_status_and_invalid_dataset_exit_codes(self):
        with patch('sys.stdout', new_callable=io.StringIO) as output:
            self.assertEqual(main(['status', '--db', str(self.path)]), 0)
        self.assertIn('not_synced', output.getvalue())
        with patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(main(['validate', '--db', str(self.path)]), 1)

    def test_backup_is_readable_and_never_overwrites(self):
        destination = Path(self.tmp.name) / 'backup.sqlite3'
        with patch('sys.stdout', new_callable=io.StringIO):
            self.assertEqual(main(['backup', '--db', str(self.path), '--output', str(destination)]), 0)
            self.assertEqual(main(['backup', '--db', str(self.path), '--output', str(destination)]), 1)
        backup = Store(destination)
        try:
            self.assertEqual(backup.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        finally:
            backup.close()


if __name__ == '__main__':
    unittest.main()
