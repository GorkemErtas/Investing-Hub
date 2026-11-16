"""Strict, non-repairing Binance spot minute ingestion and reproducible partitions."""
from __future__ import annotations

import hashlib
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd

SYMBOLS = ('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT')
COLUMNS = ('open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time',
           'quote_volume', 'trades', 'taker_base', 'taker_quote', 'ignore')
MINUTE = 60_000
DATA_VERSION = 'binance-spot-minute-v2'


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def save_json(path, value):
    """Atomic plain JSON for evidence/metadata (not an executable artifact)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, sort_keys=True, indent=2, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def validate_candles(frame, *, unit='us', now_ms=None):
    if list(frame.columns) != list(COLUMNS) or not len(frame):
        raise ValueError('invalid_schema_or_empty')
    values = frame.to_numpy(dtype=np.float64)
    if not np.isfinite(values).all():
        raise ValueError('nonfinite_candle')
    scale = {'us': 1000, 'ms': 1}[unit]
    opens = frame.open_time.to_numpy()
    closes = frame.close_time.to_numpy()
    for array in (opens, closes, frame.trades.to_numpy()):
        if not np.equal(array, np.floor(array)).all():
            raise ValueError('noninteger_timestamp_or_trades')
    if not ((opens >= 1_500_000_000_000 * scale) & (opens < 10_000_000_000_000 * scale)).all():
        raise ValueError('timestamp_unit_or_range')
    if not (opens % (MINUTE * scale) == 0).all() or not (closes == opens + MINUTE * scale - 1).all():
        raise ValueError('incomplete_or_misaligned_candle')
    differences = np.diff(opens)
    if (differences <= 0).any():
        raise ValueError('duplicate_or_unordered_candle')
    if not (differences == MINUTE * scale).all():
        raise ValueError('missing_candle_or_gap')
    if now_ms is not None and (closes >= now_ms * scale).any():
        raise ValueError('unfinished_candle')
    price = frame[['open', 'high', 'low', 'close']]
    if (price <= 0).any().any():
        raise ValueError('invalid_price')
    if ((frame.low > price.min(axis=1)) | (frame.high < price.max(axis=1))).any():
        raise ValueError('ohlc_inconsistent')
    if (frame[['volume', 'quote_volume', 'trades', 'taker_base', 'taker_quote']] < 0).any().any():
        raise ValueError('negative_market_activity')
    if ((frame.taker_base > frame.volume + 1e-8) | (frame.taker_quote > frame.quote_volume + 1e-8)).any():
        raise ValueError('invalid_taker_volume')
    # Zero-activity minutes are valid; inconsistent base/quote activity is not.
    if ((frame.volume == 0) != (frame.quote_volume == 0)).any():
        raise ValueError('inconsistent_volume')
    result = frame.drop(columns='ignore').copy()
    result['open_time'] = opens.astype(np.int64) // scale
    result['close_time'] = closes.astype(np.int64) // scale
    result['trades'] = frame.trades.astype(np.int64)
    result['time'] = pd.to_datetime(result.open_time, unit='ms', utc=True)
    return result


def verify_archive(csv):
    """Verify optional source ZIP checksum AND decompressed bytes; no network substitution."""
    archive = csv.with_suffix('.zip')
    checksum = archive.with_name(archive.name + '.CHECKSUM')
    if not archive.exists() and not checksum.exists():
        return 'csv_only_no_source_archive_or_checksum'
    if not archive.is_file() or not checksum.is_file():
        raise ValueError('incomplete_source_archive_evidence')
    parts = checksum.read_text(encoding='utf-8').split()
    if len(parts) != 2 or parts[1].lstrip('*') != archive.name or sha256(archive) != parts[0]:
        raise ValueError('source_archive_checksum_mismatch')
    with zipfile.ZipFile(archive) as source:
        if source.namelist() != [csv.name]:
            raise ValueError('unexpected_archive_members')
        with source.open(csv.name) as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != sha256(csv):
                raise ValueError('archive_csv_mismatch')
    return 'archive_checksum_and_contents_verified'


def normalize(source, destination, *, start='2025-11-01', end='2026-11-01'):
    source, destination = Path(source), Path(destination)
    if not source.is_dir():
        raise FileNotFoundError(f'historical_data_missing: {source}')
    months = pd.date_range(start, end, freq='MS', inclusive='left', tz='UTC')
    expected = {source / s / f'{s}-1m-{m:%Y-%m}.csv' for s in SYMBOLS for m in months}
    actual = set(source.rglob('*.csv'))
    report = {'version': DATA_VERSION, 'createdAt': datetime.now(timezone.utc).isoformat(),
              'source': 'Binance Spot public monthly klines (user-supplied CSVs)',
              'sourceUrl': 'https://data.binance.vision/?prefix=data/spot/monthly/klines/',
              'start': start, 'endExclusive': end, 'unit': 'microseconds -> UTC milliseconds',
              'files': [], 'errors': [], 'rows': 0, 'status': 'invalid'}
    if actual != expected:
        report['errors'].append({'missing': sorted(str(p.relative_to(source)) for p in expected-actual),
                                 'unexpected': sorted(str(p.relative_to(source)) for p in actual-expected)})
    for symbol in SYMBOLS:
        previous = None
        for month in months:
            path = source / symbol / f'{symbol}-1m-{month:%Y-%m}.csv'
            if not path.is_file():
                continue
            try:
                before = sha256(path)
                raw = pd.read_csv(path, header=None)
                if raw.shape[1] != len(COLUMNS):
                    raise ValueError('expected_12_numeric_columns')
                raw.columns = COLUMNS
                frame = validate_candles(raw, now_ms=int(datetime.now(timezone.utc).timestamp()*1000))
                next_month = month + pd.offsets.MonthBegin(1)
                first, last = int(month.timestamp()*1000), int(next_month.timestamp()*1000) - 1
                if frame.open_time.iloc[0] != first or frame.close_time.iloc[-1] != last or len(frame) != (last+1-first)//MINUTE:
                    raise ValueError('incomplete_month')
                if previous is not None and first != previous + 1:
                    raise ValueError('cross_partition_gap')
                previous = last
                provenance = verify_archive(path)
                relative = Path(f'symbol={symbol}') / f'month={month:%Y-%m}' / 'candles.parquet'
                output = destination / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                temporary = output.with_suffix('.tmp')
                try:
                    frame.to_parquet(temporary, index=False, compression='zstd')
                    os.replace(temporary, output)
                finally:
                    temporary.unlink(missing_ok=True)
                if sha256(path) != before:
                    raise ValueError('source_changed_during_validation')
                report['files'].append({'symbol': symbol, 'month': f'{month:%Y-%m}',
                    'source': str(path.relative_to(source)).replace('\\', '/'), 'sha256': before,
                    'parquet': relative.as_posix(), 'parquetSha256': sha256(output),
                    'rows': len(frame), 'firstOpenMs': first, 'lastCloseMs': last, 'provenance': provenance})
                report['rows'] += len(frame)
            except Exception as error:
                report['errors'].append({'file': path.name, 'error': str(error)})
    if not report['errors'] and len(report['files']) == len(expected):
        report['status'] = 'valid'
    report['fingerprint'] = digest({'version': DATA_VERSION, 'files': report['files']})
    # An invalid attempt must revoke the manifest consumed by fitting.
    save_json(destination / 'validation.json', report)
    return report


def load_symbol(destination, symbol):
    if symbol not in SYMBOLS:
        raise ValueError('unsupported_symbol')
    destination = Path(destination)
    manifest = json.loads((destination / 'validation.json').read_text(encoding='utf-8'))
    if manifest['status'] != 'valid' or manifest['fingerprint'] != digest({'version': DATA_VERSION, 'files': manifest['files']}):
        raise ValueError('validated_dataset_required')
    files = [item for item in manifest['files'] if item['symbol'] == symbol]
    frames = []
    for item in files:
        path = (destination / item['parquet']).resolve()
        if not path.is_relative_to(destination.resolve()) or sha256(path) != item['parquetSha256']:
            raise ValueError('partition_checksum_or_path_invalid')
        frames.append(pd.read_parquet(path))
    frame = pd.concat(frames, ignore_index=True)
    if not (np.diff(frame.open_time) == MINUTE).all():
        raise ValueError('partition_continuity_failed')
    return frame, manifest['fingerprint']


def resample(frame, minutes):
    """Only whole UTC bins; gaps and partial bins are rejected, never filled."""
    if minutes < 1 or 1440 % minutes:
        raise ValueError('unsupported_resampling_interval')
    if not (np.diff(frame.open_time) == MINUTE).all():
        raise ValueError('resampling_gap')
    grouped = frame.groupby(frame.open_time // (minutes*MINUTE), sort=True)
    if not (grouped.size() == minutes).all():
        raise ValueError('partial_resampling_bin')
    return grouped.agg(open_time=('open_time', 'first'), close_time=('close_time', 'last'),
        open=('open', 'first'), high=('high', 'max'), low=('low', 'min'), close=('close', 'last'),
        volume=('volume', 'sum'), quote_volume=('quote_volume', 'sum'), trades=('trades', 'sum'),
        taker_base=('taker_base', 'sum'), taker_quote=('taker_quote', 'sum')).reset_index(drop=True)
