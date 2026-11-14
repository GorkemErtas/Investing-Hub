"""Offline deployment checks with isolated disks and child processes."""
import shutil
import sqlite3
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from backup import create_backup
from job_lock import JobBusy, job_lock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'deploy'/'railway'))
import runtime


@contextmanager
def temporary_directory():
    # Inherit workspace ACLs, matching the other ML tests on Windows.
    root = Path(__file__).resolve().parent/'data'
    root.mkdir(exist_ok=True)
    directory = root/('test-railway-'+uuid4().hex)
    directory.mkdir()
    try:
        yield directory
    finally:
        if directory.resolve().parent != root.resolve() or not directory.name.startswith('test-railway-'):
            raise ValueError('unsafe_test_cleanup')
        shutil.rmtree(directory)


class RailwayRuntimeTests(unittest.TestCase):
    def test_schedule_catches_up_once_and_respects_persisted_retry(self):
        now = datetime(2026, 11, 13, 0, 14, tzinfo=timezone.utc)
        self.assertEqual(runtime.slot(now), '2026-11-12')
        self.assertFalse(runtime.should_run({'lastSuccess': '2026-11-12'}, now))
        now = now.replace(minute=15)
        self.assertTrue(runtime.should_run({'lastSuccess': '2026-11-12'}, now))
        self.assertFalse(runtime.should_run({'nextAttempt': now.timestamp()+3600}, now))
        self.assertFalse(runtime.should_run({'lastSuccess': '2026-11-13'}, now))
        self.assertTrue(runtime.should_run({'lastSuccess': '2026-11-10'}, now))

    def test_state_is_atomic_and_survives_restart(self):
        with temporary_directory() as temporary:
            path = Path(temporary)/'scheduler.json'
            state = {'lastSuccess': '2026-11-13', 'nextAttempt': 100}
            runtime.save_state(path, state)
            self.assertEqual(runtime.load_state(path), state)
            with patch('runtime.os.replace', side_effect=OSError):
                with self.assertRaises(OSError):
                    runtime.save_state(path, {})
            self.assertEqual(runtime.load_state(path), state)
            self.assertEqual(list(Path(temporary).glob('*.tmp')), [])
            path.write_text('[]')
            self.assertEqual(runtime.load_state(path), {})

    def test_invalid_retry_state_cannot_silently_disable_the_daily_job(self):
        now = datetime(2026, 11, 14, 1, tzinfo=timezone.utc)
        with temporary_directory() as temporary:
            path = temporary/'scheduler.json'
            for value in ('NaN', 'Infinity', '-Infinity', 'true', '-1', '"later"', str(10**1000)):
                with self.subTest(value=value), patch('runtime.log') as log:
                    path.write_text('{"nextAttempt":'+value+'}')
                    state = runtime.load_state(path)
                    self.assertEqual(state, {})
                    self.assertTrue(runtime.should_run(state, now))
                    log.assert_called_once_with('scheduler_state_invalid')
            for value in ('not-a-date', '2026-02-30', '2026-1-1'):
                with self.subTest(value=value), patch('runtime.log'):
                    path.write_text('{"lastSuccess":"'+value+'","nextAttempt":0}')
                    self.assertEqual(runtime.load_state(path), {})

    def test_backup_preserves_source_stamp_models_and_history_and_limits_retention(self):
        with temporary_directory() as temporary:
            database = Path(temporary)/'source.sqlite3'
            with sqlite3.connect(database) as connection:
                connection.execute('CREATE TABLE models (id TEXT, weights TEXT)')
                connection.execute('INSERT INTO models VALUES (?, ?)', ('selected', '{"weight":1}'))
            connection.close()
            before = database.read_bytes(), database.stat().st_mtime_ns
            backups = Path(temporary)/'backups'
            for _ in range(3):
                output = create_backup(database, backups, keep=2)
            self.assertEqual(len(list(backups.glob('*.sqlite3'))), 2)
            self.assertEqual((database.read_bytes(), database.stat().st_mtime_ns), before)
            with sqlite3.connect(output) as connection:
                self.assertEqual(connection.execute('SELECT * FROM models').fetchall(), [('selected', '{"weight":1}')])
                self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone(), ('ok',))
            connection.close()
            with job_lock(database):
                with self.assertRaises(JobBusy):
                    create_backup(database, backups)
            with patch('backup.os.replace', side_effect=OSError):
                with self.assertRaises(OSError):
                    create_backup(database, backups)
            self.assertEqual(len(list(backups.glob('*.sqlite3'))), 2)
            self.assertEqual(list(backups.glob('*.tmp')), [])

    def test_http_failure_stops_the_worker_and_exits_nonzero(self):
        class Process:
            returncode = None
            terminated = False

            def poll(self):
                return self.returncode

            def terminate(self):
                self.terminated = True
                self.returncode = -15

            def wait(self, **_):
                return self.returncode

        api, worker = Process(), Process()

        class Event:
            def is_set(self):
                return False

            def wait(self, _):
                api.returncode = 1

        with temporary_directory() as temporary:
            database = Path(temporary)/'source.sqlite3'
            database.touch()
            with patch('runtime.signal.signal'), patch('runtime.threading.Event', return_value=Event()), \
                    patch('runtime.subprocess.Popen', side_effect=[api, worker]):
                self.assertEqual(runtime.supervise(database, database.with_suffix('.json'), True), 1)
            self.assertTrue(worker.terminated)

    def test_daily_success_failure_and_timeout_persist_correct_retry_state(self):
        class Process:
            terminated = False

            def __init__(self, code=None):
                self.returncode = code

            def poll(self):
                return self.returncode

            def terminate(self):
                self.terminated = True
                self.returncode = -15

            def wait(self, **_):
                return self.returncode

        class Event:
            waits = 0

            def is_set(self):
                return self.waits >= 3

            def wait(self, _):
                self.waits += 1

        for code, timeout in [(0, False), (1, False), (None, True)]:
            with self.subTest(code=code, timeout=timeout), temporary_directory() as temporary:
                database = temporary/'source.sqlite3'
                database.touch()
                api, worker = Process(), Process(code)
                with patch('runtime.signal.signal'), patch('runtime.threading.Event', return_value=Event()), \
                        patch('runtime.subprocess.Popen', side_effect=[api, worker]) as launch, \
                        patch('runtime.create_backup') as backup, \
                        patch('runtime.JOB_TIMEOUT_SECONDS', 0 if timeout else 1500):
                    self.assertEqual(runtime.supervise(database, temporary/'predictions.json', True), 0)
                state = runtime.load_state(temporary/'scheduler.json')
                self.assertEqual(launch.call_count, 2, 'no duplicate launch or immediate failure retry')
                self.assertTrue(api.terminated)
                if code == 0:
                    self.assertEqual(state['lastSuccess'], runtime.slot(datetime.now(timezone.utc)))
                    self.assertEqual(state['nextAttempt'], 0)
                    backup.assert_called_once()
                else:
                    self.assertNotIn('lastSuccess', state)
                    self.assertGreater(state['nextAttempt'], datetime.now(timezone.utc).timestamp())
                    backup.assert_not_called()
                if timeout:
                    self.assertTrue(worker.terminated)


if __name__ == '__main__':
    unittest.main()
