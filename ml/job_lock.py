"""One OS-released database job lock, shared by manual and scheduled CLI writes."""
import os
from contextlib import contextmanager
from pathlib import Path


class JobBusy(RuntimeError):
    pass


@contextmanager
def job_lock(database):
    path = Path(database).resolve()
    lock = path.with_name(path.name + '.job.lock')
    # A persistent byte is intentional: unlinking a lock can split concurrent owners.
    with lock.open('a+b') as stream:
        if stream.tell() == 0:
            stream.write(b'0')
            stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise JobBusy('another_job_is_running') from None
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
