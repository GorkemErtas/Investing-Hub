"""Exact, source-bound approvals for reviewed observations, never model approval."""
from __future__ import annotations

import json
import logging
import re
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

from common import COLUMNS, DAY_MS, ROOT, SYMBOLS, canonical, digest

POLICY_PATH = ROOT / 'reviews' / 'historical_price_movements.json'
log = logging.getLogger(__name__)
SHA = re.compile(r'[a-f0-9]{64}')


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate key in historical anomaly review policy')
        result[key] = value
    return result


def row_fingerprint(row):
    """Same normalized numeric representation as a one-row Store fingerprint."""
    values = [int(row['open_time']), *[float(row[c]) for c in COLUMNS[1:6]], int(row['close_time'])]
    return digest(canonical([values]).encode())


def evidence_covers(item, symbol, opening):
    url = urlparse(item['url'])
    date = datetime.fromtimestamp(opening/1000, timezone.utc).strftime('%Y-%m-%d')
    if item['kind'] in ('monthly_archive', 'daily_archive'):
        kind = 'monthly' if item['kind'] == 'monthly_archive' else 'daily'
        period = date[:7] if kind == 'monthly' else date
        return url.path == f'/data/spot/{kind}/klines/{symbol}/1d/{symbol}-1d-{period}.zip'
    params = parse_qs(url.query)
    try:
        return (set(params) == {'symbol', 'interval', 'timeZone', 'startTime', 'endTime', 'limit'} and
                all(len(values) == 1 for values in params.values()) and params['symbol'] == [symbol] and
                int(params['startTime'][0]) <= opening and int(params['endTime'][0]) >= opening + DAY_MS-1 and
                1 <= int(params['limit'][0]) <= 1000)
    except (KeyError, ValueError):
        return False


def load_policy():
    if POLICY_PATH.stat().st_size > 256 * 1024:
        raise ValueError('Historical anomaly review policy exceeds size limit')
    policy = json.loads(POLICY_PATH.read_text(encoding='utf-8'), object_pairs_hook=unique_keys)
    if set(policy) != {'version', 'evidence', 'reviews'} or type(policy['version']) is not int or policy['version'] != 1:
        raise ValueError('Invalid historical anomaly review policy')
    evidence = policy['evidence']
    if not isinstance(evidence, dict) or not 1 <= len(evidence) <= 1000 or len(policy['reviews']) > 200:
        raise ValueError('Invalid bounded anomaly review evidence')
    for item in evidence.values():
        url = urlparse(item['url'])
        if item['provider'] != 'Binance' or url.scheme != 'https' or url.username or url.password or url.port:
            raise ValueError('Invalid anomaly evidence provider')
        if not SHA.fullmatch(item['sha256']) or type(item['retrieved_at']) is not int:
            raise ValueError('Invalid anomaly evidence hash/time')
        if item['interval'] != '1d' or item['timezone'] != 'UTC' or item['timestamp_unit'] != 'normalized_unix_ms':
            raise ValueError('Invalid anomaly evidence units')
        if item['kind'] in ('monthly_archive', 'daily_archive'):
            if url.hostname != 'data.binance.vision' or not re.fullmatch(r'/data/spot/(monthly|daily)/klines/[A-Z0-9]+USDT/1d/[A-Z0-9]+USDT-1d-\d{4}-\d{2}(-\d{2})?\.zip', url.path) or url.query:
                raise ValueError('Invalid anomaly archive evidence URL')
            if item['publisher_sha256'] != item['sha256'] or not SHA.fullmatch(item.get('checksum_sidecar_sha256', '')):
                raise ValueError('Anomaly archive evidence needs verified publisher checksum')
        elif item['kind'] == 'rest_klines':
            params = parse_qs(url.query)
            if url.hostname != 'data-api.binance.vision' or url.path != '/api/v3/klines' or params.get('interval') != ['1d'] or params.get('timeZone') != ['0']:
                raise ValueError('Invalid anomaly corroboration endpoint')
        else:
            raise ValueError('Unsupported anomaly evidence kind')
    identities = set()
    for review in policy['reviews']:
        if set(review) != {'id', 'symbol', 'utc_date', 'reviewed_at', 'verification', 'reason', 'previous', 'current'}:
            raise ValueError('Invalid anomaly approval fields')
        opening = int(datetime.strptime(review['utc_date'], '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp() * 1000)
        identity = (review['symbol'], review['utc_date'])
        if review['symbol'] not in SYMBOLS or identity in identities or review['id'] != '/'.join(identity):
            raise ValueError('Duplicate or non-specific anomaly approval')
        identities.add(identity)
        reviewed_at = datetime.fromisoformat(review['reviewed_at'].replace('Z', '+00:00'))
        if reviewed_at.utcoffset() is None or reviewed_at.timestamp() * 1000 < opening + DAY_MS or not review['reason'] or review['verification'] != 'publisher_checksum_and_official_rest_exact_row_match':
            raise ValueError('Anomaly approval needs dated independent verification')
        for label, expected in [('previous', opening-DAY_MS), ('current', opening)]:
            point = review[label]
            if set(point) != {'open_time', 'close', 'row_sha256', 'evidence'} or point['open_time'] != expected or not SHA.fullmatch(point['row_sha256']):
                raise ValueError('Invalid exact anomaly observation identity')
            try:
                if not isinstance(point['close'], str):
                    raise ValueError('Anomaly prices must be exact decimal strings')
                close = Decimal(point['close'])
                if not close.is_finite() or close <= 0:
                    raise ValueError('Invalid anomaly observation price')
            except (InvalidOperation, TypeError):
                raise ValueError('Invalid anomaly observation price') from None
            kinds = {evidence[key]['kind'] for key in point['evidence']}
            if not all(evidence_covers(evidence[key], review['symbol'], expected) for key in point['evidence']):
                raise ValueError('Anomaly evidence does not cover the exact symbol/date')
            if any(evidence[key]['retrieved_at'] < expected + DAY_MS or evidence[key]['retrieved_at'] > reviewed_at.timestamp()*1000 for key in point['evidence']):
                raise ValueError('Anomaly evidence acquisition/review chronology mismatch')
            if 'rest_klines' not in kinds or not kinds.intersection({'monthly_archive', 'daily_archive'}):
                raise ValueError('Approval needs archive and independent REST corroboration')
    return policy, digest(canonical(policy).encode())


def matches_source(source, evidence, symbol, opening):
    if not isinstance(source, dict) or type(source.get('retrieved_at')) is not int or source['retrieved_at'] < opening + DAY_MS:
        return False
    if source.get('kind') == 'verified_legacy_import':
        # The CSV hash is checked by import_legacy and source metadata is pinned
        # by Store. Only a pinned original archive can support a legacy row.
        asset = source.get('legacy_manifest', {}).get('assets', {}).get(symbol, {})
        return evidence['kind'] in ('monthly_archive', 'daily_archive') and any(
            entry.get('url') == evidence['url'] and entry.get('sha256') == evidence['sha256']
            for entry in asset.get('archives', []))
    keys = ('provider', 'kind', 'url', 'sha256', 'publisher_sha256', 'checksum_sidecar_sha256', 'interval', 'timezone', 'timestamp_unit')
    return all(source.get(key) == evidence.get(key) for key in keys)


class AnomalyReviewError(ValueError):
    def __init__(self, details):
        self.details = details
        messages = [f"{d['symbol']} UTC {d['utc_date']} observed_return={d['observed_return']:+.12g} ({d['observed_return']*100:+.6f}%) anomaly_review_status={d['review_status']}" for d in details[:10]]
        super().__init__('Extreme daily return requires manual source review; ' + '; '.join(messages) + (f'; {len(details)} total' if len(details)>10 else ''))


def review_extremes(frame, extreme_indices, symbol, sources):
    try:
        policy, policy_hash = load_policy()
    except (OSError, ValueError, KeyError, TypeError, OverflowError):
        details = [{'symbol': symbol or 'UNKNOWN',
            'utc_date': datetime.fromtimestamp(int(frame.loc[index, 'open_time'])/1000, timezone.utc).date().isoformat(),
            'observed_return': float(frame.loc[index, 'close']/frame.loc[index-1, 'close']-1),
            'review_status': 'invalid_review_policy', 'review_id': None} for index in extreme_indices]
        raise AnomalyReviewError(details) from None
    by_date = {(r['symbol'], r['utc_date']): r for r in policy['reviews']}
    approved, rejected = [], []
    for index in extreme_indices:
        current, previous = frame.loc[index], frame.loc[index-1]
        date = datetime.fromtimestamp(int(current.open_time)/1000, timezone.utc).date().isoformat()
        observed = float(current.close / previous.close - 1)
        review = by_date.get((symbol, date))
        status = 'unreviewed'
        if int(current.open_time)-int(previous.open_time) != DAY_MS:
            status = 'nonconsecutive_previous_candle'
        elif review is not None:
            status = 'approved'
            for label, row in [('previous', previous), ('current', current)]:
                expected = review[label]
                if Decimal(str(row['close'])) != Decimal(expected['close']) or row_fingerprint(row) != expected['row_sha256']:
                    status = 'observed_values_mismatch'
                    break
                if not any(matches_source((sources or {}).get(int(row['open_time'])), policy['evidence'][key], symbol, int(row['open_time'])) for key in expected['evidence']):
                    status = 'source_evidence_mismatch'
                    break
        detail = {'symbol': symbol or 'UNKNOWN', 'utc_date': date, 'observed_return': observed,
                  'review_status': status, 'review_id': review['id'] if review else None}
        if status != 'approved':
            rejected.append(detail)
        else:
            approved.append(detail)
            log.info('%s UTC %s observed_return=%+.6f%% anomaly_review_status=approved review_id=%s', symbol, date, observed*100, review['id'])
    if rejected:
        raise AnomalyReviewError(rejected)
    return {'policy_version': policy['version'], 'policy_sha256': policy_hash, 'approved': approved}
