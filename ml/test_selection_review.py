import copy
import unittest
import numpy as np
import pandas as pd
from multihorizon.data import digest
from multihorizon.local_selection import rank_objectives, last_fold_interval_calibration
from multihorizon.evidence_metrics import aggregate_metrics, relative_improvement, runtime_evaluation
from multihorizon.selection_review import tail_diagnostics, checked_window, matching_replay


def row(name, mae, qlike, algorithm='har_rv'):
    return {'status': 'completed', 'trial': {'id': name, 'objective': 'volatility', 'algorithm': algorithm},
        'artifact': {'file': 'test-only.json'}, 'metrics': {'mae': mae, 'qlike': qlike},
        'developmentEligible': False, 'folds': []}


class SelectionReviewTests(unittest.TestCase):
    def test_failed_or_mismatched_cached_replay_cannot_masquerade_as_current_evidence(self):
        value = row('cached', .1, -9)
        value['artifact']['sha256'] = 'a'*64
        value['folds'] = [{'originFingerprint': 'b'*64}]
        replay = {'models': {'cached': {'artifactSha256': 'a'*64, 'originFingerprint': 'b'*64}}}
        self.assertIsNotNone(matching_replay(value, replay, True))
        self.assertIsNone(matching_replay(value, replay, False))
        replay['datasetFingerprint'] = 'd'*64
        self.assertIsNone(matching_replay(value, replay, True, 'e'*64))
        replay['models']['cached']['artifactSha256'] = 'c'*64
        self.assertIsNone(matching_replay(value, replay, True))

    def test_interval_coverage_matches_saved_artifacts_calibration_fold(self):
        value = row('interval', .1, -9)
        value['metrics']['intervalCoverage'] = .9
        value['folds'] = [{'metrics': {'intervalCoverage': .5}, 'calibration': {
            'radius': 2., 'samples': 200, 'method': 'past_split_conformal_log_sigma'}}]
        self.assertEqual(last_fold_interval_calibration(value)['measuredCoverage'], .5)
        del value['folds'][0]['metrics']['intervalCoverage']
        self.assertIsNone(last_fold_interval_calibration(value))

    def test_mae_first_then_qlike_simplicity_and_id_with_twelve_decimal_ties(self):
        a, b = row('a', .1, -9), row('b', .2, -10)
        self.assertEqual(rank_objectives([b, a], 'volatility')[0]['trial']['id'], 'a')
        self.assertEqual(rank_objectives([a, b], 'volatility', volatility_primary='qlike')[0]['trial']['id'], 'b')
        b['metrics']['mae'] = .1+1e-14
        self.assertEqual(rank_objectives([a, b], 'volatility')[0]['trial']['id'], 'b')
        b['metrics']['qlike'] = -9
        b['trial']['algorithm'] = 'lightgbm'
        self.assertEqual(rank_objectives([b, a], 'volatility')[0]['trial']['id'], 'a')
        b['trial']['algorithm'] = 'har_rv'
        self.assertEqual(rank_objectives([b, a], 'volatility')[0]['trial']['id'], 'a')
        invalid = row('bad', None, -50)
        self.assertEqual(len(rank_objectives([invalid, a], 'volatility')), 1)

    def test_weighted_losses_and_rmse_pooling_do_not_average_nonlinear_class_metrics(self):
        folds = [{'evaluationRows': 1, 'metrics': {'mae': 1, 'rmse': 1, 'ece': .1, 'mcc': .2}},
                 {'evaluationRows': 3, 'metrics': {'mae': 3, 'rmse': 3, 'ece': .9, 'mcc': .8}}]
        score = aggregate_metrics(folds, lambda f: f['metrics'])
        self.assertEqual(score['mae'], 2.5)
        self.assertAlmostEqual(score['rmse'], np.sqrt(7))
        self.assertNotIn('ece', score); self.assertNotIn('mcc', score)
        self.assertEqual(relative_improvement(3, 2), -.5)
        self.assertEqual(relative_improvement(1, 2), .5)
        for value in (0, None, -1, float('nan'), float('inf')):
            self.assertIsNone(relative_improvement(1, value))

    def test_missing_baseline_stays_unknown_in_runtime_metadata(self):
        value = runtime_evaluation(row('missing', .1, -9))
        self.assertIsNone(value['baselineRelativeImprovement'])
        self.assertIsNone(value['baselinePrimaryLoss'])
        self.assertEqual(value['selectionMetric'], 'mae')

    def test_extreme_observation_can_reverse_an_apparent_mean_win(self):
        model = np.ones(100); baseline = np.full(100, .9)
        baseline[-1] = 20
        axis = np.arange(100)
        result = tail_diagnostics(axis, axis, model, baseline)
        self.assertGreater(result['meanPrimaryImprovement'], 0)
        self.assertLess(result['slices']['realizedVolatility']['remainingMeanImprovement'], 0)
        self.assertEqual(result['tailSamples'], 1)
        with self.assertRaises(ValueError):
            tail_diagnostics([float('nan')], [0], [1], [1])

    def test_replay_rejects_future_fits_and_changed_evaluation_origins(self):
        target = pd.DataFrame({'source_time': [1000, 2000, 3000]})
        value = {'folds': [{'trainTargetEnd': 100, 'calibrationSourceStart': 200,
            'calibrationTargetEnd': 500, 'evaluationRows': 3, 'originFingerprint': digest([1000, 2000, 3000])}]}
        self.assertEqual(checked_window(value, target, np.arange(3)), [1000, 2000, 3000])
        changed = copy.deepcopy(value); changed['folds'][0]['trainTargetEnd'] = 2000
        with self.assertRaisesRegex(ValueError, 'overlapping'):
            checked_window(changed, target, np.arange(3))
        with self.assertRaisesRegex(ValueError, 'origins'):
            checked_window(value, target, np.arange(2))
