"""Bounded, checksum-protected atomic JSON snapshots (data only)."""
import os
from pathlib import Path
from uuid import uuid4
from common import canonical, digest


def atomic_json(path, content):
    payload = canonical(content)
    if len(payload.encode('utf-8')) > 2 * 1024 * 1024:
        raise ValueError('Output exceeds bounded snapshot size')
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            stream.write(canonical({'payload': payload, 'sha256': digest(payload.encode())}))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        # Persist the rename as well as the file contents across a host restart.
        if os.name != 'nt':
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)
