"""Named, parameterized, bounded SQLite analyses; no schema or registry writes."""
from pathlib import Path
import re

PARTS = re.split(r'^-- name: (\w+)\s*$', Path(__file__).with_name('queries.sql').read_text(encoding='utf-8'), flags=re.M)
QUERIES = {PARTS[i]: PARTS[i+1].strip() for i in range(1, len(PARTS), 2)}


def query(store, name, **parameters):
    return [dict(row) for row in store.db.execute(QUERIES[name], parameters)]
