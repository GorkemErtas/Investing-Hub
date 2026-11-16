import json
from pathlib import Path
import unittest
from multihorizon.data import digest
from multihorizon.evidence_metrics import relative_improvement


class ReviewEvidenceTests(unittest.TestCase):
    def test_portable_comparison_is_complete_arithmetically_correct_and_development_only(self):
        reports = Path(__file__).parent/'reports'
        path = reports/'selection-quality'/'evidence.json'
        if not path.is_file():
            self.skipTest('real-data review has not been exported')
        report = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(len(report['volatilityComparison']), 24)
        self.assertEqual(len(report['objectives']), 72)
        self.assertEqual(report['summary']['replaysCompleted'], 24)
        self.assertFalse(report['summary']['holdoutUsedForSelectionOrReplay'])
        for name, field in [('local-selection.json', 'currentManifestCanonical'), ('local-selection-v1.json', 'previousManifestCanonical')]:
            self.assertEqual(digest(json.loads((reports/name).read_text(encoding='utf-8'))), report['sourceFingerprints'][field])
        for change in report['volatilityComparison']:
            old, new = change['previous']['model']['mae'], change['selected']['model']['mae']
            self.assertLessEqual(new, old+1e-12)
            self.assertAlmostEqual(change['maeImprovementVsPrevious'], relative_improvement(new, old))
        for entry in report['objectives']:
            self.assertFalse(entry['independentlyFutureValidated'])
            self.assertEqual(entry['status'], 'best_available_experimental')
            self.assertRegex(entry['artifactSha256'], r'^[0-9a-f]{64}$')
            comparison = entry['comparison']; primary = comparison['primaryMetric']
            self.assertAlmostEqual(comparison['relativePrimaryImprovement'], relative_improvement(comparison['model'][primary], comparison['baseline'][primary]))
            for fold in comparison['folds']:
                if entry['objective'] == 'price':
                    self.assertLess(fold['trainTargetEnd'], fold['evaluationSourceStart'])
                else:
                    self.assertLess(fold['trainTargetEnd'], fold['calibrationSourceStart'])
                    self.assertLess(fold['calibrationTargetEnd'], fold['validationSourceStart'])
        for replay in report['replayMetadata'].values():
            self.assertLess(replay['featureInputEndMs'], replay['developmentEndExclusiveMs'])
            self.assertGreaterEqual(replay['minimumOriginSpacingMinutes'], {'1m': 1, '15m': 15, '1h': 60}[replay['horizon']])
