"""Offline experimental publication regression tests; synthetic fixtures only."""
import json
from pathlib import Path
from unittest.mock import patch

from calibration import fit_interval
from common import DAY_MS, SYMBOLS, canonical, digest
from experimental_publication import experimental_result, export_experimental
from forecast import generate
from pipeline import main
from publication import forecast_result
from test_lifecycle import DatabaseTests, config, register, seed
from test_pipeline import candles


class ExperimentalTests(DatabaseTests):
    def fixture(self, symbol='BTCUSDT', identity='candidate-z', rmse=0.03, interval=False):
        raw = candles(700)
        raw['volume'] += SYMBOLS.index(symbol)  # Distinct test-only provenance per asset.
        now = int(raw.close_time.iloc[-1]) + 1000
        if not self.store.dataset(symbol):
            seed(self.store, raw, now, symbol)
        register(self.store, identity, now, historical_pass=False)
        report = self.store.model(identity)['metadata']
        report.update(algorithm='ridge', window='full')
        report['validation_metrics'].update(return_rmse=rmse, samples=30)
        report['baseline_metrics']['samples'] = 30
        for fold in report['walk_forward']:
            fold['metrics']['return_rmse'] = rmse
            fold['evaluation_target_end'] = now - DAY_MS
        if interval:
            report['interval_calibration'] = fit_interval([0.04] * 90, now - 4 * DAY_MS,
                now - 3 * DAY_MS, [0.01] * 30, [0.01] * 30, now - DAY_MS)
        self.store.db.execute('UPDATE models SET symbol=?,metadata=? WHERE id=?', (symbol, canonical(report), identity))
        with self.store.transaction():
            row = generate(self.store, symbol, config(), now, identity)
        self.assertEqual(row['status'], 'pending')
        return now, row

    def test_losing_unapproved_zero_prospective_candidate_is_visible_and_approved_path_unchanged(self):
        now, row = self.fixture()
        with patch('registry.evaluate', side_effect=AssertionError('No approval evaluation permitted')):
            result = experimental_result(self.store, 'BTCUSDT', config(), now)
        self.assertEqual(result['status'], 'experimental')
        data = result['data']
        self.assertEqual(data['predictedPrice'], row['predicted_price'])
        self.assertEqual(data['referencePrice'], row['reference_price'])
        self.assertIsNone(data['interval'])
        self.assertFalse(data['validation']['historicalGatePassed'])
        self.assertEqual(data['validation']['foldWins'], 0)
        self.assertEqual(data['validation']['forwardSamples'], 0)
        self.assertGreater(data['validation']['selectionReturnRmse'], data['validation']['baselineReturnRmse'])
        self.assertEqual(forecast_result(self.store, 'BTCUSDT', config(), now)['status'], 'unavailable')

    def test_ranking_rmse_then_identity_is_independent_of_insert_order(self):
        now, _ = self.fixture(identity='candidate-z', rmse=0.03)
        self.fixture(identity='candidate-b', rmse=0.025)
        self.fixture(identity='candidate-a', rmse=0.025)
        result = experimental_result(self.store, 'BTCUSDT', config(), now)
        self.assertEqual(result['data']['modelId'], 'candidate-a')
        self.assertEqual(result['data']['validation']['eligibleCandidates'], 3)
        self.store.db.execute("UPDATE models SET status='rejected' WHERE id='candidate-a'")
        self.assertEqual(experimental_result(self.store, 'BTCUSDT', config(), now)['data']['modelId'], 'candidate-b')

    def test_all_eight_assets_readonly_atomic_export_preserves_every_ledger_table(self):
        for symbol in SYMBOLS:
            now, _ = self.fixture(symbol, symbol + '-test')
        before = self.path.read_bytes()
        output = Path(self.tmp.name) / 'experimental.json'
        with patch('artifact.predict', side_effect=AssertionError('No export inference')), patch('os.replace', wraps=__import__('os').replace) as replace:
            export_experimental(self.path, output, config(), now)
            replace.assert_called_once()
        self.assertEqual(before, self.path.read_bytes())
        envelope = json.loads(output.read_text())
        self.assertEqual(digest(envelope['payload'].encode()), envelope['sha256'])
        report = json.loads(envelope['payload'])
        self.assertEqual(report['registry']['mtimeNs'], str(self.path.stat().st_mtime_ns))
        self.assertEqual([r['symbol'] for r in report['forecasts']], list(SYMBOLS))
        self.assertTrue(all(r['status'] == 'experimental' for r in report['forecasts']))

    def test_only_original_valid_interval_is_exported_and_invalid_interval_does_not_block_point(self):
        now, row = self.fixture(interval=True)
        result = experimental_result(self.store, 'BTCUSDT', config(), now)
        original = json.loads(row['details'])
        self.assertEqual(result['data']['interval']['lowerPrice'], original['calibration']['lowerPrice'])
        original['calibration']['upperPrice'] += 1
        self.store.db.execute('UPDATE predictions SET details=? WHERE id=?', (canonical(original), row['id']))
        result = experimental_result(self.store, 'BTCUSDT', config(), now)
        self.assertEqual(result['status'], 'experimental')
        self.assertIsNone(result['data']['interval'])
        self.assertEqual(result['data']['predictedPrice'], row['predicted_price'])

    def test_corrupt_failed_future_stale_incompatible_or_expired_records_are_withheld(self):
        now, row = self.fixture()
        updates = [
            ('UPDATE predictions SET predicted_price=predicted_price+1', ()),
            ("UPDATE predictions SET status='failed'", ()),
            ('UPDATE predictions SET generated_at=?', (now + 1000,)),
            ('UPDATE predictions SET reference_price=reference_price+1', ()),
            ("UPDATE models SET status='archived'", ()),
        ]
        for query, params in updates:
            with self.subTest(query=query):
                self.store.db.execute('SAVEPOINT corrupt_fixture')
                self.store.db.execute(query, params)
                self.assertEqual(experimental_result(self.store, 'BTCUSDT', config(), now)['status'], 'unavailable')
                self.store.db.execute('ROLLBACK TO corrupt_fixture')
                self.store.db.execute('RELEASE corrupt_fixture')
        report = self.store.model(row['model_id'])['metadata']
        for key, value in [('feature_version', 'unsupported'), ('trained_at', now - 91 * DAY_MS)]:
            changed = {**report, key: value}
            self.store.db.execute('UPDATE models SET metadata=?', (canonical(changed),))
            self.assertEqual(experimental_result(self.store, 'BTCUSDT', config(), now)['status'], 'unavailable')
        self.store.db.execute('UPDATE models SET metadata=?', (canonical(report),))
        self.assertEqual(experimental_result(self.store, 'BTCUSDT', config(), now + DAY_MS)['reason'], 'dataset_stale_or_gapped')

    def test_source_and_dataset_fingerprint_corruption_fail_closed(self):
        now, _ = self.fixture()
        output = Path(self.tmp.name) / 'experimental.json'
        self.store.db.execute("UPDATE sources SET metadata='{}'")
        export_experimental(self.path, output, config(), now)
        result = json.loads(json.loads(output.read_text())['payload'])['forecasts'][0]
        self.assertEqual(result['reason'], 'model_or_dataset_validation_failed')
        self.assertIsNone(result['data'])

    def test_missing_database_cli_does_not_create_it_and_missing_assets_are_explicit(self):
        missing = Path(self.tmp.name) / 'missing.sqlite3'
        output = Path(self.tmp.name) / 'experimental.json'
        with patch('sys.stdout'):
            self.assertEqual(main(['export-experimental', '--db', str(missing), '--output', str(output)]), 1)
        self.assertFalse(missing.exists())
        self.assertFalse(output.exists())
        export_experimental(self.path, output, config(), 1794052800000)
        self.assertTrue(all(r['reason'] == 'no_dataset' for r in json.loads(json.loads(output.read_text())['payload'])['forecasts']))
        with self.assertRaises(ValueError):
            export_experimental(self.path, self.path, config(), 1794052800000)

    def test_failed_atomic_write_preserves_old_export_and_database(self):
        now, _ = self.fixture()
        output = Path(self.tmp.name) / 'experimental.json'
        output.write_text('previous-export')
        before = self.path.read_bytes()
        with patch('experimental_publication.os.replace', side_effect=OSError('test-only failure')):
            with self.assertRaises(OSError):
                export_experimental(self.path, output, config(), now)
        self.assertEqual(output.read_text(), 'previous-export')
        self.assertEqual(before, self.path.read_bytes())
        self.assertEqual(list(output.parent.glob('*.tmp')), [])
