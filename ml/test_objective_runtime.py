import json
import unittest
from unittest.mock import Mock
import numpy as np
from multihorizon.data import SYMBOLS, digest, save_json, sha256, validate_candles
from multihorizon.features import HORIZONS
from multihorizon.objective_features import objective_features, OBJECTIVE_FEATURE_VERSION
from multihorizon.objective_registry import (ObjectiveRegistry, confirmation_valid, FUTURE_START, FUTURE_END,
                                            objective_unavailable)
from multihorizon.objective_live import ObjectiveEngine
from multihorizon.live import BinanceMinutes
from test_multihorizon_data import candles
from test_multihorizon_live import temporary_registry


def confirmation(checksum):
    return {'version': 'objective-confirmation-v1', 'artifactSha256': checksum,
        'startMs': FUTURE_START, 'endExclusiveMs': FUTURE_END, 'frozenAtMs': FUTURE_START-10000,
        'trainingTargetEndMs': FUTURE_START-20000, 'effectiveWeeklyBlocks': 12,
        'allFoldsWin': True, 'calibrationPass': True, 'relativeLossImprovement': .02,
        'simultaneousLowerImprovement': .001, 'familySize': 912, 'datasetFingerprint': 'a'*64}


class ObjectiveRuntimeTests(unittest.TestCase):
    def test_unobserved_future_period_cannot_be_accepted(self):
        value = confirmation('b'*64)
        self.assertFalse(confirmation_valid(value, 'b'*64, FUTURE_START-1000))
        self.assertTrue(confirmation_valid(value, 'b'*64, FUTURE_END+1000))
        for field, invalid in [('frozenAtMs', FUTURE_START+1), ('familySize', 144),
                               ('calibrationPass', False), ('relativeLossImprovement', .001)]:
            with self.subTest(field=field):
                self.assertFalse(confirmation_valid({**value, field: invalid}, 'b'*64, FUTURE_END+1000))

    def test_direction_can_run_while_volatility_is_unavailable_and_expiry_clears_output(self):
        frame = validate_candles(candles(1536))
        adjustment = FUTURE_END+86400000-int(frame.open_time.iloc[-1])
        frame['open_time'] += adjustment
        frame['close_time'] += adjustment
        now = int(frame.close_time.iloc[-1])+1000
        rich, _ = objective_features(frame, 'BTCUSDT', {'BTCUSDT': frame, 'ETHUSDT': frame})
        columns = list(rich.columns)
        artifact = {'schema': OBJECTIVE_FEATURE_VERSION, 'objective': 'direction', 'algorithm': 'logistic',
            'features': columns, 'classes': 3, 'temperature': 1., 'mean': [0]*len(columns),
            'scale': [1]*len(columns), 'coef': [[0]*len(columns)]*3, 'bias': [-2, 0, 2]}
        class Registry:
            key = 'test-only-confirmed-registry'
            def get(self, symbol, horizon, objective):
                if symbol == 'BTCUSDT' and horizon != '1M' and objective == 'direction':
                    return {'status': 'validated', 'reason': 'test_fixture_only', 'modelVersion': 'synthetic-test-direction',
                        'algorithm': 'logistic', 'evaluation': None}, artifact
                return objective_unavailable('test_unavailable'), None
        provider = Mock()
        provider.candles.return_value = frame, now
        engine = ObjectiveEngine(Registry(), provider, clock=lambda: now)
        first = engine.cycle()
        result = first['forecasts'][0]
        self.assertEqual(result['direction']['direction'], 'up')
        self.assertAlmostEqual(sum(result['direction']['probabilities'].values()), 1)
        self.assertIsNone(result['volatility']['expectedVolatility'])
        self.assertEqual(engine.cycle()['forecasts'][0]['direction']['generatedAt'], result['direction']['generatedAt'])
        now += 60000
        expired = engine.cycle()['forecasts'][0]
        self.assertTrue(expired['stale'])
        self.assertIsNone(expired['direction']['probabilities'])

    def test_registry_rejects_a_forged_retrospective_accepted_flag(self):
        with temporary_registry() as directory:
            entries = [{'symbol': s, 'horizon': h, 'objectives': {n: objective_unavailable('test_only')
                for n in ('direction', 'volatility')}} for s in SYMBOLS for h in HORIZONS]
            entries[0]['objectives']['direction'].update(status='validated', artifactSha256='b'*64,
                                                       confirmation=confirmation('b'*64))
            payload = {'version': 'objective-registry-v1', 'entries': entries}
            path = directory/'objectives.json'
            save_json(path, {'payload': payload, 'sha256': digest(payload)})
            with self.assertRaisesRegex(ValueError, 'future_confirmation_required'):
                ObjectiveRegistry(path, clock=lambda: FUTURE_START-1).refresh()

    def test_provider_two_page_bounds_and_same_origin_deduplication(self):
        raw = candles(1537)
        raw['open_time'] //= 1000
        raw['close_time'] //= 1000
        rows = raw.to_numpy().tolist()
        now = int(raw.open_time.iloc[-1])+1000
        class Response:
            def __init__(self, values): self.values = values
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, _): return json.dumps(self.values).encode()
        request = Mock(side_effect=[Response(rows[-1000:]), Response(rows[:-1000])])
        provider = BinanceMinutes(history_size=1536, request=request, clock=lambda: now)
        frame, updated = provider.candles('BTCUSDT')
        self.assertEqual(len(frame), 1536)
        self.assertEqual(request.call_count, 2)
        second, retrieved = provider.candles('BTCUSDT')
        self.assertEqual(retrieved, updated)
        self.assertEqual(request.call_count, 2)
        np.testing.assert_array_equal(frame.close_time, second.close_time)

    def test_lagged_provider_tail_is_not_refetched_per_horizon_within_one_minute(self):
        raw = candles(257)
        raw['open_time'] //= 1000
        raw['close_time'] //= 1000
        now = int(raw.close_time.iloc[-1])+60001
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_): pass
            def read(self, _): return json.dumps(raw.to_numpy().tolist()).encode()
        request = Mock(return_value=Response())
        provider = BinanceMinutes(request=request, clock=lambda: now)
        frame, retrieved = provider.candles('BTCUSDT')
        self.assertGreater(now-int(frame.close_time.iloc[-1]), 60000)
        provider.candles('BTCUSDT')
        self.assertEqual(request.call_count, 1)
