"""Download checksum-verified, UTC daily candles for noncommercial research.

No credentials, raw archives or datasets are committed. The manifest records
each source URL and SHA-256. Dataset license: Binance Vision CC BY-NC-SA 4.0
plus published Vision Dataset Terms; see README before redistributing derivatives.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import time
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def download(url: str) -> bytes:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code in (418, 429):
                raise RuntimeError('Provider rate limited download; stop and retry later.') from None
            if error.code < 500 or attempt == 2:
                raise RuntimeError(f'Archive request failed with HTTP {error.code}.') from None
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise RuntimeError('Archive download failed after bounded retries.') from None
        time.sleep(0.5 * (2 ** attempt))
    raise RuntimeError('Download failed')


def months(start: str, end: str):
    year, month = map(int, start.split('-'))
    while f'{year:04d}-{month:02d}' <= end:
        yield f'{year:04d}-{month:02d}'
        month += 1
        if month == 13:
            year, month = year + 1, 1


def main():
    config = json.loads((ROOT / 'config.json').read_text())
    output = ROOT / 'data'
    output.mkdir(exist_ok=True)
    manifest = {'provider': 'Binance Vision', 'license': 'CC BY-NC-SA 4.0 + Vision Dataset Terms',
                'terms': 'https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md',
                'downloaded_at': datetime.now(timezone.utc).isoformat(), 'assets': {}}
    for symbol in config['symbols']:
        rows, sources = [], []
        for month in months(config['start_month'], config['end_month']):
            filename = f'{symbol}-1d-{month}.zip'
            url = f'https://data.binance.vision/data/spot/monthly/klines/{symbol}/1d/{filename}'
            archive = download(url)
            checksum = download(url + '.CHECKSUM').decode().split()[0]
            actual = hashlib.sha256(archive).hexdigest()
            if actual != checksum:
                raise RuntimeError(f'Checksum mismatch for {filename}')
            with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
                with zipped.open(filename.replace('.zip', '.csv')) as source:
                    for row in csv.reader(io.TextIOWrapper(source)):
                        # Binance spot archives switched to microseconds in January 2025.
                        unit = 1000 if int(row[0]) >= 10**14 else 1
                        rows.append([int(row[0]) // unit, *row[1:6], int(row[6]) // unit])
            sources.append({'url': url, 'sha256': actual})
            print(f'{symbol}: verified {month}', flush=True)
            time.sleep(0.05)
        destination = output / f'{symbol}.csv'
        with destination.open('w', newline='') as target:
            writer = csv.writer(target)
            writer.writerow(['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time'])
            writer.writerows(rows)
        manifest['assets'][symbol] = {'file': destination.name, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'archives': sources}
    (output / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
