"""Supervise HTTP and finite daily ML jobs on one persistent Railway volume."""
import json
import math
import os
import signal
import subprocess
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'ml'))
from backup import create_backup, sync_directory
from job_lock import job_lock

UTC = timezone.utc
RETRY_SECONDS = 3600
JOB_TIMEOUT_SECONDS = 25*60
SHUTDOWN_SECONDS = 12


def log(event, **fields):
    print(json.dumps({'utc': datetime.now(UTC).isoformat(), 'event': event, **fields}), flush=True)


def save_state(path, state):
    temporary = path.with_name(path.name+'.'+uuid4().hex+'.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(state, stream, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def load_state(path):
    try:
        if path.stat().st_size > 4096:
            raise ValueError('oversized_state')
        state = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(state, dict):
            raise ValueError('invalid_state')
        retry = state.get('nextAttempt', 0)
        if type(retry) not in (int, float) or not math.isfinite(retry) or retry < 0:
            raise ValueError('invalid_retry')
        if 'lastSuccess' in state:
            success = state['lastSuccess']
            if not isinstance(success, str) or date.fromisoformat(success).isoformat() != success:
                raise ValueError('invalid_success_date')
        return state
    except FileNotFoundError:
        return {}
    except (ValueError, TypeError, OverflowError):
        log('scheduler_state_invalid')
        return {}


def slot(now):
    # Match the existing 03:15 Europe/Istanbul / 00:15 UTC schedule.
    due = now.replace(hour=0, minute=15, second=0, microsecond=0)
    if now < due:
        due -= timedelta(days=1)
    return due.date().isoformat()


def should_run(state, now):
    return state.get('lastSuccess') != slot(now) and now.timestamp() >= state.get('nextAttempt', 0)


def terminate(process):
    if process is not None and process.poll() is None:
        process.terminate()


def supervise(database, output, enabled, minute_enabled=False):
    state_path = database.parent/'scheduler.json'
    state = load_state(state_path)
    stop = threading.Event()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, lambda *_: stop.set())
    api = subprocess.Popen(['node', 'backend/dist/server.js'], cwd=ROOT)
    worker = None
    minute_worker = None
    minute_retry = 0
    started = 0
    run_slot = None
    log('supervisor_started', dailyEnabled=enabled)
    try:
        while not stop.is_set():
            if api.poll() is not None:
                log('http_process_exited', exitCode=api.returncode)
                return 1
            now = datetime.now(UTC)
            if minute_worker is not None and minute_worker.poll() is not None:
                log('minute_worker_exited', exitCode=minute_worker.returncode)
                minute_worker = None
                minute_retry = now.timestamp()+60
            if minute_enabled and minute_worker is None and now.timestamp() >= minute_retry:
                minute_worker = subprocess.Popen([sys.executable, 'ml/forecast_v2.py', 'worker',
                    '--registry', os.environ['FORECAST_REGISTRY_PATH'],
                    '--output', os.environ['FORECASTS_EXPORT_PATH']], cwd=ROOT)
                log('minute_worker_started')
            if worker is not None:
                timed_out = time.monotonic()-started >= JOB_TIMEOUT_SECONDS
                if timed_out and worker.poll() is None:
                    terminate(worker)
                    try:
                        worker.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        worker.kill()
                        worker.wait()
                if worker.poll() is not None:
                    success = worker.returncode == 0 and not timed_out
                    log('daily_finished', exitCode=worker.returncode, timedOut=timed_out)
                    if success:
                        # The pipeline exits only after all eight forecasts verify.
                        state['lastSuccess'] = run_slot
                        try:
                            create_backup(database, database.parent/'backups')
                            log('backup_finished')
                        except Exception as error:
                            log('backup_failed', error=type(error).__name__)
                    state['nextAttempt'] = 0 if success else now.timestamp()+RETRY_SECONDS
                    save_state(state_path, state)
                    worker = None
            elif enabled and should_run(state, now):
                # Persist the retry boundary before starting: a redeploy must not
                # turn a failed run into a tight retry loop.
                state['nextAttempt'] = now.timestamp()+RETRY_SECONDS
                save_state(state_path, state)
                if not database.is_file():
                    log('ml_database_missing')
                else:
                    run_slot = slot(now)
                    worker = subprocess.Popen([sys.executable, 'ml/pipeline.py', 'daily',
                        '--db', str(database), '--output', str(output)], cwd=ROOT)
                    started = time.monotonic()
                    log('daily_started', slot=run_slot)
            stop.wait(1)
        log('shutdown_started')
        return 0
    finally:
        # Both children receive TERM together. SQLite rollback-journal recovery
        # and the OS-released job lock make even a forced worker exit recoverable.
        terminate(worker)
        terminate(minute_worker)
        terminate(api)
        deadline = time.monotonic()+SHUTDOWN_SECONDS
        for process in (worker, minute_worker, api):
            if process is None:
                continue
            try:
                process.wait(timeout=max(0, deadline-time.monotonic()))
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def main():
    try:
        database = Path(os.environ['ML_DATABASE_PATH']).resolve()
        output = Path(os.environ['PREDICTIONS_EXPORT_PATH']).resolve()
        enabled = os.environ.get('ML_DAILY_ENABLED', 'true')
        minute_enabled = os.environ.get('ML_MINUTE_ENABLED', 'false')
        if minute_enabled not in ('true', 'false'):
            raise ValueError('invalid_minute_setting')
        if minute_enabled == 'true' and (
            Path(os.environ.get('FORECAST_REGISTRY_PATH', '')).resolve() != Path('/data/ml/registry-v2/registry.json') or
            Path(os.environ.get('FORECASTS_EXPORT_PATH', '')).resolve() != Path('/data/ml/forecasts-v2.json')):
            raise ValueError('invalid_minute_persistent_paths')
        if enabled not in ('true', 'false') or database.parent != Path('/data/ml') or output != database.parent/'predictions.json':
            raise ValueError('invalid_persistent_paths_or_daily_setting')
        # A second supervisor on the same disk must not start another HTTP/ML pair.
        with job_lock(database.parent/'service'):
            return supervise(database, output, enabled == 'true', minute_enabled == 'true')
    except Exception as error:
        log('supervisor_failed', error=type(error).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
