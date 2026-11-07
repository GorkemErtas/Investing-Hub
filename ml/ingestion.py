"""Provider-independent ingestion, legacy import and atomic dataset versions."""
from __future__ import annotations

import calendar
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from common import COLUMNS, DAY_MS, canonical, digest, latest_open, symbol_check
from features import validate_candles
from provider import ArchiveMissing
from store import Store

log = logging.getLogger(__name__)


def import_legacy(store: Store, directory: Path, symbol: str, now: int):
    """Pin old verified files without rewriting them or their manifest."""
    path, manifest_path = directory / f'{symbol}.csv', directory / 'provenance.json'
    if not path.exists():
        return False
    if not manifest_path.exists():
        raise ValueError('Legacy CSV exists without provenance; refusing to trust it')
    payload = path.read_bytes()
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    asset = manifest['assets'][symbol]
    if digest(payload) != asset['sha256'] or asset['file'] != path.name:
        raise ValueError('Legacy dataset checksum/file mismatch')
    if not asset.get('archives') or any(not a.get('url') or len(a.get('sha256', '')) != 64 for a in asset['archives']):
        raise ValueError('Legacy archive provenance missing')
    frame, _ = validate_candles(pd.read_csv(path), now_ms=now)
    source = {'provider': manifest.get('provider'), 'kind': 'verified_legacy_import',
              'url': path.resolve().as_uri(), 'sha256': digest(payload), 'retrieved_at': now,
              'original_downloaded_at': manifest.get('downloaded_at'),
              'legacy_manifest': manifest, 'publisher_sha256': None}
    source_id = digest(canonical(source).encode())
    with store.transaction():
        if store.dataset(symbol):
            return False
        store.save_candles(symbol, frame, [source], {int(t): source_id for t in frame.open_time}, now)
        store.event('legacy_import', {'symbol': symbol, 'sha256': digest(payload)}, now)
    return True


def missing_ranges(missing: list[int]):
    if not missing:
        return
    start = previous = missing[0]
    for value in missing[1:]:
        if value != previous + DAY_MS:
            yield start, previous
            start = value
        previous = value
    yield start, previous


def sync(store: Store, provider, symbol: str, start: int, now: int, max_return=0.8):
    symbol_check(symbol)
    if start % DAY_MS:
        raise ValueError('Sync start must be a UTC midnight')
    end = latest_open(now)
    if start > end:
        raise ValueError('Sync start is after the latest completed candle')
    # One symbol is one atomic commit. Earlier successful symbols can remain
    # committed if another symbol fails; no half-written symbol is exposed.
    with store.transaction():
        old = store.frame(symbol)
        if not old.empty:
            old, _, _ = store.verified_frame(symbol, now)
        previous = store.dataset(symbol)
        boundary = previous.get('history_boundary') if previous else None
        if boundary is None and hasattr(provider, 'first_available') and (old.empty or start < int(old.open_time.min())):
            boundary = provider.first_available(symbol, end)
            if boundary['first_open'] % DAY_MS or boundary['first_open'] > end:
                raise ValueError('Invalid evidenced listing boundary')
        if boundary:
            start = max(start, boundary['first_open'])
        known = set(int(t) for t in old.open_time)
        missing = sorted(set(range(start, end + DAY_MS, DAY_MS)) - known)
        if not missing:
            return {'symbol': symbol, 'added': 0, 'dataset': store.dataset(symbol)}
        fetched, sources, source_for_open = [], [], {}
        month_groups = {}
        for opening in missing:
            period = datetime.fromtimestamp(opening / 1000, timezone.utc).strftime('%Y-%m')
            month_groups.setdefault(period, []).append(opening)
        for period, openings in month_groups.items():
            log.info('%s: syncing %s (%s missing daily candles)', symbol, period, len(openings))
            year, month = map(int, period.split('-'))
            first = int(datetime(year, month, 1, tzinfo=timezone.utc).timestamp() * 1000)
            last = first + (calendar.monthrange(year, month)[1] - 1) * DAY_MS
            batches = []
            # Only download a whole archive when all its relevant observations
            # are missing. Gap repair and daily updates request exact intervals.
            if last <= end and openings == list(range(max(start, first), last + DAY_MS, DAY_MS)):
                try:
                    batches.append(provider.archive(symbol, period))
                except ArchiveMissing:
                    pass
            if not batches:
                for left, right in missing_ranges(openings):
                    if left == right and right < end - 2 * DAY_MS:
                        try:
                            batches.append(provider.archive(symbol, datetime.fromtimestamp(
                                left / 1000, timezone.utc).strftime('%Y-%m-%d')))
                            continue
                        except ArchiveMissing:
                            pass
                    batches.append(provider.recent(symbol, left, right))
            for frame, source in batches:
                frame, _ = validate_candles(frame, max_return, now_ms=now)
                source_id = digest(canonical(source).encode())
                # Initial partial listing month may contain earlier days than
                # configured. Validate them, then retain only requested days.
                frame = frame.loc[frame.open_time.isin(openings), COLUMNS]
                for opening in frame.open_time:
                    opening = int(opening)
                    if opening in source_for_open:
                        raise ValueError('Duplicate candle across downloaded batches')
                    source_for_open[opening] = source_id
                sources.append(source)
                fetched.append(frame)
        combined = pd.concat([f for f in [old[COLUMNS], *fetched] if not f.empty], ignore_index=True)
        combined, _ = validate_candles(combined, max_return, now_ms=now)
        unresolved = set(range(start, end + DAY_MS, DAY_MS)) - set(combined.open_time)
        if unresolved:
            raise ValueError(f'{symbol}: missing {len(unresolved)} requested daily candles; nothing committed')
        meta = store.save_candles(symbol, combined, sources, source_for_open, now, boundary)
        store.event('sync', {'symbol': symbol, 'added': len(missing), 'fingerprint': meta['fingerprint']}, now)
        return {'symbol': symbol, 'added': len(missing), 'dataset': meta}
