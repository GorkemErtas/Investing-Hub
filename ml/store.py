"""SQLite transactions are the commit boundary for data, registry and forecasts.

Use a local disk, not a network share or a concurrently synced database file.
The connection rolls back on errors; immutable candles reject source revisions.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pandas as pd

from common import COLUMNS, canonical, digest, symbol_check, utc_ms

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, symbol TEXT NOT NULL, retrieved_at INTEGER NOT NULL,
 metadata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS candles (
 symbol TEXT NOT NULL, open_time INTEGER NOT NULL,
 open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL,
 close REAL NOT NULL, volume REAL NOT NULL, close_time INTEGER NOT NULL,
 source_id TEXT NOT NULL REFERENCES sources(id), PRIMARY KEY(symbol, open_time)
);
CREATE TABLE IF NOT EXISTS datasets (
 symbol TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, metadata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dataset_versions (
 symbol TEXT NOT NULL, fingerprint TEXT NOT NULL, metadata TEXT NOT NULL,
 PRIMARY KEY(symbol, fingerprint)
);
CREATE TABLE IF NOT EXISTS models (
 id TEXT PRIMARY KEY, symbol TEXT NOT NULL, status TEXT NOT NULL
 CHECK(status IN ('candidate','approved','active','rejected','archived')),
 metadata TEXT NOT NULL, artifact TEXT NOT NULL, checksum TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active ON models(symbol) WHERE status='active';
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL, details TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS predictions (
 id TEXT PRIMARY KEY, symbol TEXT NOT NULL, model_id TEXT NOT NULL REFERENCES models(id),
 generated_at INTEGER NOT NULL, source_time INTEGER NOT NULL, target_time INTEGER NOT NULL,
 reference_price REAL NOT NULL, predicted_return REAL, predicted_price REAL,
 actual_price REAL, error REAL, actual_return REAL,
 status TEXT NOT NULL CHECK(status IN ('pending','evaluated','failed','rejected')),
 details TEXT NOT NULL, UNIQUE(symbol,model_id,target_time)
);
CREATE TABLE IF NOT EXISTS performance (
 model_id TEXT NOT NULL REFERENCES models(id), through_time INTEGER NOT NULL,
 metadata TEXT NOT NULL, PRIMARY KEY(model_id,through_time)
);
PRAGMA user_version=1;
"""


def fingerprint(frame: pd.DataFrame) -> str:
    rows = []
    for row in frame[COLUMNS].itertuples(index=False, name=None):
        rows.append([int(row[0]), *[float(v) for v in row[1:6]], int(row[6])])
    return digest(canonical(rows).encode())


class Store:
    @classmethod
    def readonly(cls, path: Path | str):
        """Reuse verification/query methods without schema writes or file creation."""
        instance = cls.__new__(cls)
        instance.db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
        instance.db.row_factory = sqlite3.Row
        instance.db.execute('PRAGMA query_only=ON')
        if instance.db.execute('PRAGMA user_version').fetchone()[0] != 1:
            instance.close()
            raise ValueError('Unsupported analytics database schema')
        return instance

    def __init__(self, path: Path | str):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=30, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('PRAGMA synchronous=FULL')
        version = self.db.execute('PRAGMA user_version').fetchone()[0]
        if version not in (0, 1):
            self.db.close()
            raise ValueError(f'Unsupported database schema {version}')
        self.db.executescript(SCHEMA)

    def close(self):
        self.db.close()

    @contextmanager
    def transaction(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def event(self, kind: str, details: dict, now: int | None = None):
        self.db.execute('INSERT INTO events(at,kind,details) VALUES(?,?,?)',
                        (utc_ms() if now is None else now, kind, canonical(details)))

    def frame(self, symbol: str) -> pd.DataFrame:
        symbol_check(symbol)
        return pd.read_sql_query(
            f"SELECT {','.join(COLUMNS)} FROM candles WHERE symbol=? ORDER BY open_time",
            self.db, params=(symbol,))

    def dataset(self, symbol: str) -> dict | None:
        row = self.db.execute('SELECT metadata FROM datasets WHERE symbol=?', (symbol,)).fetchone()
        return json.loads(row[0]) if row else None

    def verified_frame(self, symbol: str, now: int | None = None):
        from features import validate_candles
        frame = self.frame(symbol)
        meta = self.dataset(symbol)
        if meta is None or fingerprint(frame) != meta['fingerprint']:
            raise ValueError(f'{symbol}: dataset fingerprint mismatch or absent provenance')
        frame, quality = validate_candles(frame, now_ms=now)
        # Verify each row has an attributable source; foreign keys alone do not
        # cover offline edits made with another tool's foreign_keys disabled.
        sources = self.db.execute(
            'SELECT DISTINCT s.id,s.metadata,s.retrieved_at,s.symbol FROM candles c LEFT JOIN sources s ON s.id=c.source_id '
            'WHERE c.symbol=?', (symbol,)).fetchall()
        for source in sources:
            if source['id'] is None or digest(source['metadata'].encode()) != source['id']:
                raise ValueError('Source provenance integrity mismatch')
            if source['symbol'] != symbol or json.loads(source['metadata'])['retrieved_at'] != source['retrieved_at']:
                raise ValueError('Source symbol/retrieval metadata mismatch')
        if sorted(r['id'] for r in sources) != meta['source_ids']:
            raise ValueError('Dataset source manifest mismatch')
        boundary = meta.get('history_boundary')
        if boundary and (boundary['first_open'] % 86400000 or boundary['first_open'] > int(frame.open_time.min()) or
                         boundary['source']['kind'] != 'listing_boundary' or
                         not boundary['source']['url'].startswith('https://data-api.binance.vision/api/v3/klines?') or
                         len(boundary['source']['sha256']) != 64):
            raise ValueError('Invalid evidenced history boundary')
        return frame, meta, quality

    def save_candles(self, symbol: str, frame: pd.DataFrame, sources: list[dict],
                     source_for_open: dict[int, str], now: int, history_boundary=None):
        """Caller holds transaction; never overwrite a conflicting verified row."""
        for source in sources:
            content = canonical(source)
            self.db.execute('INSERT OR IGNORE INTO sources VALUES(?,?,?,?)',
                            (digest(content.encode()), symbol, source['retrieved_at'], content))
        for row in frame[COLUMNS].itertuples(index=False, name=None):
            normalized = (int(row[0]), *[float(v) for v in row[1:6]], int(row[6]))
            old = self.db.execute(
                f"SELECT {','.join(COLUMNS)} FROM candles WHERE symbol=? AND open_time=?",
                (symbol, normalized[0])).fetchone()
            if old:
                if tuple(old) != normalized:
                    raise ValueError('Conflicting existing candle; manual source review required')
                continue
            self.db.execute('INSERT INTO candles VALUES(?,?,?,?,?,?,?,?,?)',
                            (symbol, *normalized, source_for_open[normalized[0]]))
        complete = self.frame(symbol)
        source_ids = [r[0] for r in self.db.execute(
            'SELECT DISTINCT source_id FROM candles WHERE symbol=? ORDER BY source_id', (symbol,))]
        checksum = fingerprint(complete)
        previous = self.dataset(symbol)
        if previous and previous['fingerprint'] == checksum:
            return previous
        meta = {'schema_version': 1, 'symbol': symbol, 'fingerprint': checksum,
                'rows': len(complete), 'start': int(complete.open_time.min()),
                'end': int(complete.close_time.max()), 'created_at': now, 'source_ids': source_ids,
                'parent': previous['fingerprint'] if previous else None}
        if history_boundary:
            meta['history_boundary'] = history_boundary
        elif previous and previous.get('history_boundary'):
            meta['history_boundary'] = previous['history_boundary']
        payload = canonical(meta)
        self.db.execute('INSERT OR REPLACE INTO datasets VALUES(?,?,?)', (symbol, checksum, payload))
        self.db.execute('INSERT OR IGNORE INTO dataset_versions VALUES(?,?,?)', (symbol, checksum, payload))
        return meta

    def model(self, model_id: str) -> dict:
        row = self.db.execute('SELECT * FROM models WHERE id=?', (model_id,)).fetchone()
        if not row:
            raise ValueError('Unknown model ID')
        result = dict(row)
        result['metadata'] = json.loads(result['metadata'])
        if digest(result['artifact'].encode()) != result['checksum']:
            raise ValueError('Model artifact checksum mismatch')
        return result

    def active(self, symbol: str) -> dict | None:
        row = self.db.execute("SELECT id FROM models WHERE symbol=? AND status='active'", (symbol,)).fetchone()
        return self.model(row[0]) if row else None
