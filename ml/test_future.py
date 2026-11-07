"""Future Analysis publication/calibration tests use synthetic local data only."""
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from calibration import fit_interval, price_interval
from common import DAY_MS, ROOT, SYMBOLS, canonical, digest, load_config
from forecast import generate, reconcile
from ingestion import sync
from provider import Binance, ProviderError
from publication import export_analysis, forecast_result
from registry import approve, promote
from test_lifecycle import DatabaseTests, FixtureProvider, config, register, seed
from test_pipeline import candles


class CalibrationTests(unittest.TestCase):
    def test_catalog_and_config_follow_shared_contract(self):
        self.assertEqual(len(SYMBOLS), 8)
        self.assertEqual(load_config()['symbols'], list(SYMBOLS))
        for symbol in SYMBOLS:
            self.assertIn('symbol: "' + symbol + '"', (ROOT.parent / 'shared/contracts.ts').read_text(encoding='utf-8'))

    def test_finite_sample_quantile_and_frozen_selection_evaluation(self):
        errors = np.arange(1, 101) / 1000
        first = fit_interval(errors, 100, 101, np.zeros(10), np.zeros(10), 200)
        changed_future = fit_interval(errors, 100, 101, np.ones(10), np.zeros(10), 200)
        self.assertAlmostEqual(first['radiusReturn'], 0.091)
        self.assertEqual(first['radiusReturn'], changed_future['radiusReturn'])
        self.assertEqual(first['status'], 'empirically_calibrated')
        self.assertEqual(changed_future['status'], 'experimental')
        self.assertIsNone(price_interval(changed_future, 100, 0.01))

    def test_interval_chronology_insufficient_nan_and_negative_price_are_rejected(self):
        for residuals, end, start in [([0.01] * 29, 1, 2), ([float('nan')] * 30, 1, 2), ([0.01] * 30, 2, 2)]:
            with self.assertRaises(ValueError):
                fit_interval(residuals, end, start, [0], [0], 3)
        calibration = fit_interval([0.04] * 40, 1, 2, [0], [0], 3)
        interval = price_interval(calibration, 100, 0.01)
        self.assertAlmostEqual(interval['lowerPrice'], 97)
        self.assertAlmostEqual(interval['upperPrice'], 105)
        self.assertIsNone(price_interval(calibration, 100, -0.99))

    def test_listing_boundary_uses_official_earliest_candle(self):
        raw = candles(1)
        rows = raw.values.tolist()
        for row in rows:
            row[0], row[6] = int(row[0]), int(row[6])
        response = io.BytesIO(json.dumps(rows).encode())
        provider = Binance(opener=lambda req, timeout: response, clock=lambda: int(raw.close_time.iloc[-1]) + 1000)
        boundary = provider.first_available('SOLUSDT', int(raw.open_time.iloc[0]))
        self.assertEqual(boundary['first_open'], int(raw.open_time.iloc[0]))
        self.assertIn('startTime=0', boundary['source']['url'])
        self.assertIn('limit=1', boundary['source']['url'])
        self.assertEqual(boundary['source']['kind'], 'listing_boundary')
        provider = Binance(opener=lambda req, timeout: io.BytesIO(b'[]'))
        with self.assertRaises(ProviderError):
            provider.first_available('SOLUSDT', int(raw.open_time.iloc[0]))


class FuturePublicationTests(DatabaseTests):
    def test_each_asset_initial_sync_uses_evidenced_listing_then_no_network_on_noop(self):
        raw = candles(40)
        now = int(raw.close_time.iloc[-1]) + 1000
        for symbol in SYMBOLS:
            provider = FixtureProvider(raw, now)
            original_batch = provider.batch
            def attributed_batch(kind, start, end):
                frame, source = original_batch(kind, start, end)
                return frame, {**source, 'url': source['url'] + '?symbol=' + symbol}
            provider.batch = attributed_batch
            boundary = {'first_open': int(raw.open_time.iloc[0]), 'source': {
                'kind': 'listing_boundary', 'url': 'https://data-api.binance.vision/api/v3/klines?symbol=' + symbol,
                'sha256': 'a' * 64, 'retrieved_at': now}}
            provider.first_available = lambda *args: boundary
            with patch.object(provider, 'first_available', wraps=provider.first_available) as earliest:
                first = sync(self.store, provider, symbol, int(raw.open_time.iloc[0]) - 900 * DAY_MS, now)
                self.assertEqual(first['added'], 40)
                calls = len(provider.calls)
                second = sync(self.store, provider, symbol, int(raw.open_time.iloc[0]) - 900 * DAY_MS, now)
                self.assertEqual(second['added'], 0)
                self.assertEqual(len(provider.calls), calls)
                earliest.assert_called_once()
                self.assertEqual(self.store.verified_frame(symbol, now)[1]['history_boundary'], boundary)

    def test_export_no_models_is_atomic_complete_and_does_not_change_registry(self):
        before = self.path.stat().st_mtime_ns
        output = Path(self.tmp.name) / 'publication.json'
        now = 1794052800000
        export_analysis(self.store, self.path, output, config(), now)
        envelope = json.loads(output.read_text())
        self.assertEqual(digest(envelope['payload'].encode()), envelope['sha256'])
        content = json.loads(envelope['payload'])
        self.assertEqual([r['symbol'] for r in content['forecasts']], list(SYMBOLS))
        self.assertTrue(all(r['data'] is None for r in content['forecasts']))
        self.assertEqual(int(content['registry']['mtimeNs']), self.path.stat().st_mtime_ns)
        self.assertEqual(before, self.path.stat().st_mtime_ns)
        with self.assertRaisesRegex(ValueError, 'path mismatch'):
            export_analysis(self.store, output, output.with_name('other.json'), config(), now)

    def ready_fixture(self):
        raw = candles(736)
        price = 100 * 1.01 ** np.arange(len(raw))
        raw[['open', 'close']] = np.column_stack([price, price])
        raw['low'], raw['high'] = price * 0.99, price * 1.01
        now = int(raw.close_time.iloc[699]) + 1000
        seed(self.store, raw.iloc[:700], now)
        register(self.store, 'test-only-model', now)
        metadata = self.store.model('test-only-model')['metadata']
        metadata['walk_forward_wins'] = 4
        metadata['interval_calibration'] = fit_interval([0.04] * 90, now - 4 * DAY_MS,
            now - 3 * DAY_MS, [0.01] * 30, [0.01] * 30, now - DAY_MS)
        self.store.db.execute('UPDATE models SET metadata=? WHERE id=?', (canonical(metadata), 'test-only-model'))
        for i in range(35):
            with self.store.transaction():
                generate(self.store, 'BTCUSDT', config(), now, 'test-only-model')
            now += DAY_MS
            seed(self.store, raw.iloc[:701 + i], now)
            with self.store.transaction():
                reconcile(self.store, 'BTCUSDT', now)
        return now, raw

    def test_candidate_shadow_cannot_be_relabelled_after_promotion_and_active_origin_can_publish(self):
        now, raw = self.ready_fixture()
        self.assertEqual(forecast_result(self.store, 'BTCUSDT', config(), now)['reason'], 'no_active_approved_model')
        with self.store.transaction():
            shadow = generate(self.store, 'BTCUSDT', config(), now, 'test-only-model')
            self.assertTrue(approve(self.store, 'test-only-model', config(), now)['eligible'])
            self.assertTrue(promote(self.store, 'test-only-model', config(), now)['eligible'])
        self.assertEqual(forecast_result(self.store, 'BTCUSDT', config(), now)['reason'], 'shadow_forecast_not_publishable')
        with self.store.transaction():
            same = generate(self.store, 'BTCUSDT', config(), now)
        self.assertEqual(shadow['details'], same['details'])
        now += DAY_MS
        seed(self.store, raw, now)
        with self.store.transaction():
            reconcile(self.store, 'BTCUSDT', now)
            active = generate(self.store, 'BTCUSDT', config(), now)
        result = forecast_result(self.store, 'BTCUSDT', config(), now)
        self.assertEqual(result['status'], 'validated')
        self.assertEqual(result['data']['predictedPrice'], active['predicted_price'])
        self.assertEqual(result['data']['direction'], 'UP')
        self.assertEqual(result['data']['interval'], {**json.loads(active['details'])['calibration'],
            **{key: result['data']['interval'][key] for key in ('calibrationEnd', 'validationStart', 'evaluatedAt')}})
        before = self.store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0]
        output = Path(self.tmp.name) / 'eligible.json'
        export_analysis(self.store, self.path, output, config(), now)
        exported = json.loads(json.loads(output.read_text())['payload'])
        self.assertEqual(exported['forecasts'][0], result)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], before)
        self.assertEqual(exported['registry']['mtimeNs'], str(self.path.stat().st_mtime_ns))

    def test_unvalidated_calibration_never_publishes_numbers(self):
        now, _ = self.ready_fixture()
        with self.store.transaction():
            approve(self.store, 'test-only-model', config(), now)
            promote(self.store, 'test-only-model', config(), now)
        metadata = self.store.model('test-only-model')['metadata']
        metadata.pop('interval_calibration')
        self.store.db.execute('UPDATE models SET metadata=? WHERE id=?', (canonical(metadata), 'test-only-model'))
        with self.store.transaction():
            generate(self.store, 'BTCUSDT', config(), now)
        result = forecast_result(self.store, 'BTCUSDT', config(), now)
        self.assertEqual(result['reason'], 'interval_calibration_not_ready')
        self.assertIsNone(result['data'])


if __name__ == '__main__':
    unittest.main()
