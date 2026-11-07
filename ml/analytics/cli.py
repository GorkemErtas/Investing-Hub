"""Run explicitly: python ml/pipeline.py analytics --output ml/data/analytics."""
from pathlib import Path
from store import Store
from .report import build_report
from .export import export_report


def run(database, output, now):
    database, output = Path(database).resolve(), Path(output).resolve()
    if output == database or database.is_relative_to(output / 'runs'):
        raise ValueError('Analytics output must be separate from the registry')
    store = Store.readonly(database)
    before = database.stat()
    try:
        if store.db.execute('PRAGMA journal_mode').fetchone()[0].lower() == 'wal':
            raise ValueError('Analytics snapshot stamping requires the lifecycle default rollback journal')
        store.db.execute('BEGIN')
        report, evaluated, events = build_report(store, database, now)
        after = database.stat()
        if (before.st_mtime_ns, before.st_size) != (after.st_mtime_ns, after.st_size):
            raise ValueError('Registry changed during analytics; rerun against a stable snapshot')
        # Keep the read transaction until publication completes; subsequent
        # database changes invalidate the report in the backend reader.
        return export_report(output, report, evaluated, events)
    finally:
        store.close()
