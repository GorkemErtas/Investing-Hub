"""Official Binance archives and market-data-only REST; no synthetic fallback."""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone

import pandas as pd

from common import COLUMNS, DAY_MS, TERMS, digest, symbol_check, utc_ms

log = logging.getLogger(__name__)
MAX_BYTES = 8 * 1024 * 1024


class ProviderError(RuntimeError):
    pass


class ArchiveMissing(ProviderError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProviderError('Unexpected provider redirect')


class Binance:
    def __init__(self, opener=None, pause=time.sleep, clock=utc_ms):
        self.open = opener or urllib.request.build_opener(NoRedirect()).open
        self.pause, self.clock = pause, clock

    def download(self, url: str, archive: bool = False) -> bytes:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != 'https' or parsed.netloc not in ('data.binance.vision', 'data-api.binance.vision'):
            raise ProviderError('Nonallowlisted provider URL')
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={'User-Agent': 'Investing-Hub-research/2'})
                with self.open(request, timeout=20) as response:
                    payload = response.read(MAX_BYTES + 1)
                if len(payload) > MAX_BYTES:
                    raise ProviderError('Oversized provider response')
                return payload
            except urllib.error.HTTPError as error:
                if error.code == 404 and archive:
                    raise ArchiveMissing('Archive not yet published') from None
                if error.code in (418, 429):
                    # Stop the whole sync, including other symbols. Do not retry
                    # before Retry-After or keep a worker asleep indefinitely.
                    raise ProviderError(f'Provider rate limited (HTTP {error.code}); '
                                        f'retry after {error.headers.get("Retry-After", "unspecified")} seconds') from None
                if error.code in (401, 403, 451):
                    raise ProviderError(f'Binance access restricted (HTTP {error.code}); existing data preserved') from None
                if error.code < 500 or attempt == 2:
                    raise ProviderError(f'Provider HTTP {error.code}: {url}') from None
            except (TimeoutError, OSError, urllib.error.URLError) as error:
                if attempt == 2:
                    raise ProviderError(f'Provider unavailable after 3 attempts: {type(error).__name__}') from None
            log.warning('Transient provider failure; retry %s/2: %s', attempt + 1, url)
            self.pause(0.5 * 2**attempt)
        raise ProviderError('Provider download failed')

    @staticmethod
    def parse_rows(rows) -> pd.DataFrame:
        normalized = []
        for row in rows:
            if not isinstance(row, (list, tuple)) or len(row) < 7:
                raise ProviderError('Malformed kline record')
            stamps = []
            for value in (row[0], row[6]):
                if isinstance(value, bool) or not re.fullmatch(r'\d+', str(value)):
                    raise ProviderError('Invalid timestamp representation')
                stamps.append(int(value))
            if all(10**12 <= t < 10**14 for t in stamps):
                opening, closing = stamps
            elif all(10**15 <= t < 10**17 for t in stamps):
                if stamps[0] % 1000 or stamps[1] % 1000 != 999:
                    raise ProviderError('Microsecond candle boundary mismatch')
                opening, closing = (t // 1000 for t in stamps)
            else:
                raise ProviderError('Mixed or unsupported timestamp units')
            normalized.append([opening, *row[1:6], closing])
        try:
            return pd.DataFrame(normalized, columns=COLUMNS).apply(pd.to_numeric, errors='raise')
        except (ValueError, TypeError) as error:
            raise ProviderError('Non-numeric OHLCV response') from error

    def provenance(self, url, payload, kind, publisher_checksum=None):
        return {'provider': 'Binance', 'kind': kind, 'url': url, 'sha256': digest(payload),
                'publisher_sha256': publisher_checksum, 'retrieved_at': self.clock(),
                'terms_url': TERMS, 'license': 'CC BY-NC-SA 4.0 + Vision Dataset Terms',
                'timestamp_unit': 'normalized_unix_ms', 'interval': '1d', 'timezone': 'UTC'}

    def archive(self, symbol: str, period: str):
        symbol_check(symbol)
        if not re.fullmatch(r'\d{4}-\d{2}(-\d{2})?', period):
            raise ValueError('Invalid archive period')
        kind = 'monthly' if len(period) == 7 else 'daily'
        name = f'{symbol}-1d-{period}'
        url = f'https://data.binance.vision/data/spot/{kind}/klines/{symbol}/1d/{name}.zip'
        payload = self.download(url, archive=True)
        checksum_payload = self.download(url + '.CHECKSUM')
        try:
            fields = checksum_payload.decode('ascii').split()
            expected = fields[0].lower()
            if len(fields) != 2 or fields[1].lstrip('*') != name + '.zip' or not re.fullmatch('[a-f0-9]{64}', expected):
                raise ValueError('Malformed checksum sidecar')
            if digest(payload) != expected:
                raise ValueError('Archive checksum mismatch')
            with zipfile.ZipFile(io.BytesIO(payload)) as zipped:
                entries = zipped.infolist()
                if len(entries) != 1 or entries[0].filename != name + '.csv' or entries[0].file_size > MAX_BYTES:
                    raise ValueError('Unexpected archive content/size')
                # Read in memory, never extract provider paths to the filesystem.
                rows = list(csv.reader(io.StringIO(zipped.read(entries[0]).decode('utf-8'))))
        except (ValueError, IndexError, UnicodeError, zipfile.BadZipFile, RuntimeError) as error:
            raise ProviderError(f'Corrupted archive: {error}') from error
        frame = self.parse_rows(rows)
        start = int(datetime.strptime(period, '%Y-%m' if kind == 'monthly' else '%Y-%m-%d')
                    .replace(tzinfo=timezone.utc).timestamp() * 1000)
        if kind == 'monthly':
            dt = datetime.fromtimestamp(start / 1000, timezone.utc)
            end = int(datetime(dt.year + (dt.month == 12), dt.month % 12 + 1, 1,
                               tzinfo=timezone.utc).timestamp() * 1000)
        else:
            end = start + DAY_MS
        if frame.empty or ((frame.open_time < start) | (frame.open_time >= end)).any():
            raise ProviderError('Archive contains candles outside requested period')
        source = self.provenance(url, payload, kind + '_archive', expected)
        source['checksum_sidecar_sha256'] = digest(checksum_payload)
        return frame, source

    def recent(self, symbol: str, start: int, end: int):
        symbol_check(symbol)
        query = urllib.parse.urlencode({'symbol': symbol, 'interval': '1d', 'timeZone': '0',
                                       'startTime': start, 'endTime': end + DAY_MS - 1, 'limit': 1000})
        url = 'https://data-api.binance.vision/api/v3/klines?' + query
        payload = self.download(url)
        try:
            rows = json.loads(payload)
        except (ValueError, UnicodeError) as error:
            raise ProviderError('Invalid provider JSON') from error
        if not isinstance(rows, list) or not 1 <= len(rows) <= 1000:
            raise ProviderError('Empty or invalid kline response')
        frame = self.parse_rows(rows)
        if ((frame.open_time < start) | (frame.open_time > end)).any():
            raise ProviderError('REST returned candles outside requested range')
        return frame, self.provenance(url, payload, 'rest_klines')
