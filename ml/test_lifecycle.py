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

import pandas as pd

from common import COLUMNS, DAY_MS, ROOT, canonical, day, digest, latest_open, load_config
from features import validate_candles
from ingestion import import_legacy, sync
from provider import ArchiveMissing, Binance, ProviderError
from store import Store, fingerprint
from test_pipeline import candles


def config():
    result = load_config()
    result.update({'fold_days': 20, 'holdout_days': 30, 'lstm_epochs': 2})
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



if __name__ == '__main__':
    unittest.main()
