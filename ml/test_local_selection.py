"""Synthetic software fixtures; market results are verified separately on local artifacts."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
from multihorizon.data import save_json, sha256
from multihorizon.features import FEATURES, FEATURE_VERSION
from multihorizon.local_selection import rank_objectives, rank_prices, build_local_objectives, build_local_prices
from multihorizon.objective_features import OBJECTIVE_FEATURE_VERSION
from multihorizon.objective_registry import ObjectiveRegistry
from multihorizon.registry import Registry
from multihorizon.live import BinanceMinutes


def direction_row(name='simple', loss=.9):
    return {'trial': {'id': name, 'objective': 'direction', 'mode': 'neutral', 'algorithm': 'logistic'},
        'status': 'completed', 'artifact': {'file': name+'-artifact.json'},
        'metrics': {'logLoss': loss, 'brier': .6, 'ece': .12},
        'developmentEligible': False, 'allFoldsWin': False, 'calibrationPass': False,
        'baselineRelativeImprovement': -.1, 'evidence': {'simultaneousLowerImprovement': -.2},
        'folds': [{'trainTargetEnd': 1000}]}


class LocalSelectionTests(unittest.TestCase):
    def test_ranking_uses_development_scores_without_activation_gates_or_holdout(self):
        best, other = direction_row('ablation', .8), direction_row('other', .9)
        best['trial']['removed'] = 'cross_asset'
        self.assertEqual(rank_objectives([other, best], 'direction')[0]['trial']['id'], 'ablation')
        changed = copy.deepcopy(best)
        changed.update(holdout={'logLoss': 900}, developmentEligible=True, allFoldsWin=True)
        self.assertEqual(rank_objectives([other, changed], 'direction')[0]['trial']['id'], 'ablation')
        binary = direction_row('conditional-binary', .1)
        binary['trial']['mode'] = 'binary'
        self.assertEqual(len(rank_objectives([binary, best], 'direction')), 1)
        tied = direction_row('z', .8)
        self.assertEqual(rank_objectives([tied, best], 'direction')[0]['trial']['id'], 'ablation')

    def test_missing_best_artifact_falls_back_to_valid_trained_candidate_and_missing_history_is_optional(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); pair = root/'study'/'BTCUSDT'/'1m'; pair.mkdir(parents=True)
            valid = direction_row('valid')
            artifact = {'schema': OBJECTIVE_FEATURE_VERSION, 'objective': 'direction', 'algorithm': 'logistic',
                'classes': 3, 'temperature': 1., 'features': ['return_1'], 'mean': [0.], 'scale': [1.],
                'coef': [[0.], [0.], [0.]], 'bias': [0., 0., 0.]}
            save_json(pair/'valid-artifact.json', artifact)
            valid['artifact']['sha256'] = sha256(pair/'valid-artifact.json')
            save_json(pair/'valid.json', valid)
            invalid = direction_row('missing', .1); invalid['artifact']['sha256'] = 'a'*64
            save_json(pair/'missing.json', invalid)
            output = root/'registry'/'objectives.json'
            selections = build_local_objectives(root/'study', output, root/'missing-data')
            registry = ObjectiveRegistry(output, clock=lambda: 0)
            item, model = registry.get('BTCUSDT', '1m', 'direction')
            self.assertEqual(item['status'], 'experimental')
            self.assertFalse(item['evaluation']['developmentEligible'])
            self.assertEqual(model, artifact)
            self.assertEqual(len(selections[0]['excludedInvalidArtifacts']), 1)
            self.assertIsNone(registry.get('BTCUSDT', '1m', 'volatility')[1])
            self.assertEqual(registry.get('BTCUSDT', '1M', 'direction')[0]['status'], 'unavailable')
            (output.parent/item['artifact']).unlink()
            registry = ObjectiveRegistry(output)
            self.assertEqual(registry.get('BTCUSDT', '1m', 'direction')[0]['reason'], 'objective_artifact_invalid')
            self.assertEqual(registry.get('ETHUSDT', '15m', 'direction')[0]['reason'], 'local_model_missing')

    def test_price_selection_ignores_final_holdout_and_keeps_below_baseline_model(self):
        comparison = {'candidates': {
            'ridge': {'status': 'ok', 'validation': {'returnRmse': .2}, 'holdout': {'returnRmse': 900}},
            'lstm': {'status': 'ok', 'validation': {'returnRmse': .3}, 'holdout': {'returnRmse': .01}}},
            'artifacts': {'ridge': {}, 'lstm': {}}}
        self.assertEqual(rank_prices(comparison), ['ridge', 'lstm'])
        comparison['candidates']['lstm']['holdout']['returnRmse'] = 1e9
        self.assertEqual(rank_prices(comparison), ['ridge', 'lstm'])
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root/'ridge.json'
            save_json(source, {'schema': FEATURE_VERSION, 'algorithm': 'ridge', 'features': list(FEATURES),
                'mean': [0.]*len(FEATURES), 'scale': [1.]*len(FEATURES), 'coef': [0.]*len(FEATURES), 'bias': 0.})
            candidate = {'status': 'ok', 'validation': {'returnRmse': .2},
                'holdout': {'metrics': {'returnRmse': 999., 'directionalAccuracy': 0.}, 'baseline': {'returnRmse': .1}}}
            report = {'symbol': 'BTCUSDT', 'horizon': '1m', 'runId': 'test', 'datasetFingerprint': 'a'*64,
                'candidates': {'ridge': candidate, 'naive': {'status': 'ok', 'validation': {'returnRmse': .1}}},
                'artifacts': {'ridge': {'path': str(source), 'sha256': sha256(source), 'modelVersion': 'synthetic-test', 'trainingPeriod': {}}}}
            study = root/'study.json'; save_json(study, [report]); output = root/'registry'/'prices.json'
            build_local_prices(study, output)
            selected = Registry(output).get('BTCUSDT', '1m')[0]
            self.assertEqual(selected['algorithm'], 'ridge')
            self.assertEqual(selected['status'], 'experimental')
            self.assertEqual(selected['evaluationMetrics']['holdoutReturnRmse'], 999.)

    def test_offline_provider_cools_down_across_horizons_and_recovers_on_a_bounded_retry(self):
        now = 1000
        request = Mock(side_effect=OSError('test network disconnected'))
        provider = BinanceMinutes(request=request, clock=lambda: now, pause=lambda _: None)
        for _ in range(6):
            with self.assertRaises(ValueError): provider.candles('BTCUSDT')
        self.assertEqual(request.call_count, 2)
        now += 60001
        with self.assertRaises(ValueError): provider.candles('BTCUSDT')
        self.assertEqual(request.call_count, 4)
