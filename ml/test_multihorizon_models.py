import unittest
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits
from multihorizon.features import FEATURES, LOOKBACK
from multihorizon.models import ALGORITHMS, candidate, export_model, numeric_predict
from multihorizon.benchmark import DEFAULT_CONFIG, plan, select, metrics


class ModelTests(unittest.TestCase):
    def test_all_six_fitted_families_serialize_with_numeric_inference_parity(self):
        rng = np.random.default_rng(42)
        x = rng.normal(size=(1100, len(FEATURES)))
        y = x[:, 0]*.001+rng.normal(0, .001, len(x))
        with threadpool_limits(limits=1):
            for name in ALGORITHMS[1:]:
                with self.subTest(algorithm=name):
                    data = np.repeat(x[:, None, :], LOOKBACK, axis=1) if name == 'lstm' else x
                    model = candidate(name, epochs=1).fit(data[:1000], y[:1000])
                    artifact = export_model(model, name, data[1000:])
                    np.testing.assert_allclose(numeric_predict(artifact, data[1000:]), model.predict(data[1000:]), atol=1e-7)
                    if name == 'ridge':
                        np.testing.assert_allclose(artifact['mean'], x[:1000].mean(axis=0))
                        self.assertGreater(np.max(np.abs(x[1000:].mean(axis=0)-artifact['mean'])), .01)
                    artifact['schema'] = 'corrupt'
                    with self.assertRaises(ValueError):
                        numeric_predict(artifact, data[1000:])

    def test_purged_boundaries_and_common_nonoverlapping_origins(self):
        times = np.arange(220*1440, dtype=np.int64)*60000+1761955200000
        for horizon, minutes in [('1m', 1), ('15m', 15), ('1h', 60)]:
            data = pd.DataFrame({'source_time': times, 'target_time': times+minutes*60000})
            for train, test in plan(data, horizon, DEFAULT_CONFIG):
                self.assertLess(data.target_time.iloc[train].max()+60000, data.source_time.iloc[test].min())
                self.assertTrue((np.diff(data.source_time.iloc[test]) >= minutes*60000).all())
                self.assertLessEqual(len(train), DEFAULT_CONFIG['maxTrainRows'])

    def test_selection_never_accepts_marginal_advantage_or_incomplete_comparison(self):
        actual = np.tile([.01, -.01], 90*5)
        times = np.repeat(np.arange(90), 10)*86400000
        predictions = {n: actual*.001 for n in ALGORITHMS}
        baseline = metrics(actual, np.zeros(len(actual)), np.ones(len(actual)))
        results = {n: {'status': 'ok', 'validation': dict(baseline), 'walkForward': [
            {'metrics': dict(baseline), 'baseline': dict(baseline)} for _ in range(3)]} for n in ALGORITHMS}
        self.assertIsNone(select(results, actual, predictions, times, DEFAULT_CONFIG)['algorithm'])
        for name in ALGORITHMS[1:]:
            results[name]['validation']['returnRmse'] *= .8
            for fold in results[name]['walkForward']:
                fold['metrics']['returnRmse'] *= .8
            predictions[name] = actual*.2
        self.assertEqual(select(results, actual, predictions, times, DEFAULT_CONFIG)['algorithm'], 'ridge')
        results['lstm']['status'] = 'failed'
        self.assertEqual(select(results, actual, predictions, times, DEFAULT_CONFIG)['reason'], 'incomplete_required_benchmark')
