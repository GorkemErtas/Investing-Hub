import unittest
from pathlib import Path
from contextlib import contextmanager
from uuid import uuid4
import shutil
from unittest.mock import Mock
from urllib.error import HTTPError
import numpy as np
from multihorizon.data import SYMBOLS, validate_candles, save_json, digest
from multihorizon.features import HORIZONS, FEATURES, FEATURE_VERSION
from multihorizon.live import Engine, BinanceMinutes
from multihorizon.registry import Registry
from test_multihorizon_data import candles


@contextmanager
def temporary_registry():
    root = Path(__file__).parent/'data'
    root.mkdir(exist_ok=True)
    directory = root/('test-v2-registry-'+uuid4().hex)
    directory.mkdir()
    try:
        yield directory
    finally:
        if directory.resolve().parent != root.resolve() or not directory.name.startswith('test-v2-registry-'):
            raise ValueError('unsafe_test_cleanup')
        shutil.rmtree(directory)


class FakeRegistry:
    key = 'test-registry-only'
    def get(self, symbol, horizon):
        available = symbol == 'BTCUSDT' and horizon != '1M'
        return {'status': 'experimental' if available else 'unavailable', 'reason': 'test_fixture_only',
            'modelVersion': 'synthetic-v2', 'algorithm': 'ridge', 'featureSchema': FEATURE_VERSION,
            'datasetFingerprint': 'a'*64, 'evaluationMetrics': {}}, ({'schema': FEATURE_VERSION,
            'features': list(FEATURES), 'algorithm': 'ridge', 'mean': [0]*len(FEATURES),
            'scale': [1]*len(FEATURES), 'coef': [0]*len(FEATURES), 'bias': .001} if available else None)


class LiveTests(unittest.TestCase):
    def test_completed_history_frozen_inference_cache_and_freshness(self):
        frame = validate_candles(candles(256))
        now = int(frame.close_time.iloc[-1])+1000
        provider = Mock()
        provider.candles.return_value = frame, now
        engine = Engine(FakeRegistry(), provider, clock=lambda: now)
        first = engine.cycle()
        self.assertEqual(len(first['forecasts']), 32)
        available = [f for f in first['forecasts'] if f['status'] == 'experimental']
        self.assertEqual(len(available), 3)
        self.assertAlmostEqual(available[0]['predictedPrice'], frame.close.iloc[-1]*np.exp(.001))
        self.assertEqual(engine.cycle(), first)
        now += 60000
        expired = engine.cycle()['forecasts'][0]
        self.assertEqual(expired['status'], 'unavailable')
        self.assertTrue(expired['stale'])
        provider.candles.side_effect = TimeoutError()
        self.assertTrue(all(f['status'] == 'unavailable' for f in engine.cycle()['forecasts']))

    def test_rate_limit_respected_without_repeated_requests(self):
        request = Mock(side_effect=HTTPError('https://example.invalid', 429, 'rate limit', {'Retry-After': '120'}, None))
        provider = BinanceMinutes(request=request, clock=lambda: 1761955200000, pause=Mock())
        for _ in range(2):
            with self.assertRaisesRegex(ValueError, 'rate_limited'):
                provider.candles('BTCUSDT')
        self.assertEqual(request.call_count, 1)

    def test_registry_missing_corrupt_and_invalid_pairs(self):
        with temporary_registry() as directory:
            path = Path(directory)/'registry.json'
            registry = Registry(path)
            with self.assertRaises(FileNotFoundError):
                registry.refresh()
            path.write_text('corrupt', encoding='utf-8')
            with self.assertRaises(ValueError):
                registry.refresh()
            payload = {'version': 'forecast-registry-v2', 'entries': []}
            save_json(path, {'payload': payload, 'sha256': digest(payload)})
            with self.assertRaisesRegex(ValueError, 'pairs'):
                registry.refresh()
            entries = [{'symbol': s, 'horizon': h, 'status': 'unavailable'} for s in SYMBOLS for h in HORIZONS]
            payload['entries'] = entries
            save_json(path, {'payload': payload, 'sha256': digest(payload)})
            registry.refresh()
            self.assertEqual(len(registry.entries), 32)
