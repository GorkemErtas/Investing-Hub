"""Finite daily orchestration and bounded local operational records; no training."""
import json
from pathlib import Path
from uuid import uuid4
from common import DAY_MS, SYMBOLS, canonical, latest_open, utc_ms
from job_lock import job_lock
from publication import stamp, verify_predictions
from store import Store

MAX_LOGS = 60
RETENTION_DAYS = 30


class DailyLog:
    def __init__(self, directory, now):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        files = sorted(self.directory.glob('daily-*.jsonl'), key=lambda p: (p.stat().st_mtime_ns,p.name), reverse=True)
        for index, path in enumerate(files):
            if index >= MAX_LOGS-1 or path.stat().st_mtime*1000 < now-RETENTION_DAYS*DAY_MS:
                path.unlink()
        self.path = self.directory / ('daily-' + stamp(now).replace(':', '').replace('.', '') + '-' + uuid4().hex[:8] + '.jsonl')
        self.stream = self.path.open('x', encoding='utf-8')
        self.retries = 0

    def record(self, event, now, **fields):
        # Call sites supply only codes, counts, symbols and UTC times, never exception text.
        if event == 'network_retry':
            self.retries += 1
            if self.stream.tell() > 48*1024:
                return
        if event == 'finished':
            fields['network_retry_attempts'] = self.retries
        self.stream.write(canonical({'utc': stamp(now), 'event': event, **fields}) + '\n')
        self.stream.flush()

    def close(self):
        self.stream.close()


def daily_status(directory):
    files = sorted(Path(directory).glob('daily-*.jsonl'), key=lambda p: (p.stat().st_mtime_ns,p.name), reverse=True)
    if not files:
        return {'status': 'never_run'}
    path = files[0]
    if path.stat().st_size > 64*1024:
        return {'status': 'invalid_log'}
    try:
        rows = [json.loads(line) for line in path.read_text(encoding='utf-8-sig').splitlines()]
        finish = rows[-1] if rows else {}
        return {'status': finish.get('status', 'interrupted_or_running'),
                'startedAt': rows[0]['utc'], 'lastEvent': finish}
    except (ValueError, KeyError, IndexError):
        return {'status': 'invalid_log'}


def run_daily(args, operation, clock=utc_ms):
    started = clock()
    log = DailyLog(args.log_directory, started)
    stage = 'lock'
    log.record('started', started)
    store = None
    try:
        with job_lock(args.db):
            if not Path(args.db).is_file():
                raise ValueError('existing_database_required')
            store = Store(args.db)
            for stage in ('sync', 'validate', 'reconcile', 'predict'):
                if latest_open(clock()) != latest_open(started):
                    raise ValueError('utc_day_changed')
                log.record('step_started', clock(), stage=stage)
                result = operation(stage, store, clock(), lambda attempt: log.record('network_retry', clock(), attempt=attempt))
                if stage in ('sync', 'validate', 'reconcile'):
                    # Keep per-symbol operational counts, without source content or private paths.
                    counts = [{key: row[key] for key in ('symbol', 'added', 'rows', 'reconciled') if key in row} for row in result]
                    log.record('step_finished', clock(), stage=stage, results=counts)
                else:
                    log.record('step_finished', clock(), stage=stage,
                               valid_forecasts=sum(row['status'] == 'experimental' for row in result['forecasts']))
            stage = 'verify'
            with store.transaction():
                verified = verify_predictions(store, args.db, args.output, clock())
            result = {'status': 'success', 'valid_forecasts': verified['valid_forecasts'], 'symbols': list(SYMBOLS)}
            log.record('finished', clock(), **result)
            return result
    except Exception as error:
        known = {'another_job_is_running','existing_database_required','utc_day_changed',
                 'incomplete_prediction_set_previous_publication_preserved',
                 'invalid_publication_checksum','invalid_publication_content_or_registry','incomplete_publication'}
        code = str(error) if str(error) in known else stage+'_error'
        log.record('finished', clock(), status='failure', stage=stage, error=type(error).__name__, code=code)
        raise RuntimeError('daily_' + stage + '_failed; see daily-status') from None
    finally:
        if store is not None:
            store.close()
        log.close()
