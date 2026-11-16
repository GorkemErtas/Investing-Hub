"""Validate committed real-data evidence without requiring ignored local training files."""
import json
from pathlib import Path
import unittest
from multihorizon.data import sha256


class ObjectiveEvidenceTests(unittest.TestCase):
    def test_research_evidence_is_complete_consistent_and_never_prospectively_accepted(self):
        root = Path(__file__).parent/'reports'/'objectives-phase2'
        if not (root/'evidence.json').is_file():
            self.skipTest('real-data objective evidence has not been exported yet')
        index = json.loads((root/'evidence.json').read_text(encoding='utf-8'))
        self.assertEqual(len(index['pairs']), 24)
        self.assertEqual(index['plannedConfigurations'], 768)
        self.assertEqual(index['productionAcceptedObjectives'], 0)
        self.assertEqual(index['futureConfirmationStatus'], 'not_observed')
        for reference in index['pairs']:
            path = (root/reference['file']).resolve()
            self.assertTrue(path.is_relative_to(root.resolve()))
            self.assertEqual(sha256(path), reference['sha256'])
            pair = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(len(pair['trials']), 32)
            for row in pair['trials']:
                self.assertIn(row['status'], ('completed', 'failed', 'unexecuted'))
                if row['status'] != 'completed':
                    self.assertTrue(row.get('error'))
                    continue
                self.assertFalse(row['productionAccepted'])
                self.assertEqual(row['evidence']['familySize'], 912)
                self.assertGreaterEqual(row['evidence']['effectiveWeeklyBlocks'], 8)
                for fold in row['folds']:
                    evaluation = pair['sharedEvaluationWindows'][fold['evaluationRef']]
                    self.assertLess(fold['trainTargetEnd'], evaluation['calibrationSourceStart'])
                    self.assertLess(evaluation['calibrationTargetEnd'], evaluation['validationSourceStart'])
                    self.assertLessEqual(fold['trainRows'], 36000)
                if row['developmentEligible']:
                    self.assertTrue(row['allFoldsWin'])
                    self.assertTrue(row['calibrationPass'])
                    self.assertGreaterEqual(row['baselineRelativeImprovement'], .01)
                    self.assertGreater(row['evidence']['simultaneousLowerImprovement'], 0)
