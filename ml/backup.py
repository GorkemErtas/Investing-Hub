"""Atomic, integrity-checked SQLite backups; no source writes or model loading."""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from job_lock import job_lock


def sync_directory(directory):
    if os.name != 'nt':
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def create_backup(database, directory, keep=7):
    database, directory = Path(database).resolve(), Path(directory).resolve()
    if keep < 1 or not database.is_file():
        raise ValueError('existing_database_and_positive_retention_required')
    directory.mkdir(parents=True, exist_ok=True)
    name = 'lifecycle-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8]
    temporary, output = directory/(name+'.tmp'), directory/(name+'.sqlite3')
    try:
        with job_lock(database):
            source = sqlite3.connect(database.as_uri()+'?mode=ro', uri=True, timeout=5)
            try:
                target = sqlite3.connect(temporary)
                try:
                    source.backup(target)
                    if target.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                        raise ValueError('backup_integrity_failed')
                finally:
                    target.close()
            finally:
                source.close()
        with temporary.open('r+b') as stream:
            os.fsync(stream.fileno())
        os.replace(temporary, output)
        sync_directory(directory)
        # Retention runs only after a verified replacement exists.
        for old in sorted(directory.glob('lifecycle-*.sqlite3'),
                          key=lambda p: (p.stat().st_mtime_ns, p.name), reverse=True)[keep:]:
            old.unlink()
        return output
    finally:
        temporary.unlink(missing_ok=True)
