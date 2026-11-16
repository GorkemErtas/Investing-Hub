"""Bounded completed-candle polling and frozen inference, outside HTTP handlers."""
from __future__ import annotations
import json
import logging
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from json_store import atomic_json
from .data import COLUMNS, SYMBOLS, validate_candles
from .features import FEATURES, HISTORY, HORIZONS, LOOKBACK, features, target_time
from .models import numeric_predict

LOG = logging.getLogger('forecast.v2')


def iso(ms):
    return datetime.fromtimestamp(ms/1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def unavailable(symbol, horizon, now, reason, *, stale=False):
    return {'version': 'forecast-v2', 'symbol': symbol, 'horizon': horizon, 'status': 'unavailable',
        'reason': reason, 'stale': stale, 'referencePrice': None, 'predictedPrice': None,
        'predictedLogReturn': None, 'marketUpdatedAt': None, 'sourceCandleTime': None,
        'generatedAt': iso(now), 'targetTime': None, 'modelVersion': None, 'algorithm': None,
        'featureSchema': None, 'datasetFingerprint': None, 'evaluationMetrics': None}


class BinanceMinutes:
    def __init__(self, *, request=urllib.request.urlopen, clock=lambda: int(time.time()*1000), pause=time.sleep):
        self.request, self.clock, self.pause = request, clock, pause
        self.blocked_until = 0
        self.history = {symbol: deque(maxlen=HISTORY) for symbol in SYMBOLS}

    def candles(self, symbol):
        if symbol not in SYMBOLS:
            raise ValueError('unsupported_symbol')
        if self.clock() < self.blocked_until:
            raise ValueError('provider_rate_limited')
        history = self.history[symbol]
        params = urllib.parse.urlencode({'symbol': symbol, 'interval': '1m', 'limit': HISTORY+1, 'timeZone': '0'})
        # One bounded tail request avoids persisted-history recovery and gap backfills.
        url = 'https://data-api.binance.vision/api/v3/klines?'+params
        for attempt in range(2):
            try:
                with self.request(url, timeout=5) as response:
                    raw = response.read(1024*1024+1)
                if len(raw) > 1024*1024:
                    raise ValueError('provider_response_too_large')
                rows = json.loads(raw)
                if not isinstance(rows, list) or not 1 <= len(rows) <= HISTORY+1 or any(len(r) != 12 for r in rows):
                    raise ValueError('provider_schema')
                frame = pd.DataFrame(rows, columns=COLUMNS).apply(pd.to_numeric, errors='raise')
                now = self.clock()
                if (frame.open_time > now).any() or (np.diff(frame.open_time) <= 0).any():
                    raise ValueError('provider_chronology')
                # Only the final current candle may be incomplete.
                if (frame.close_time.iloc[:-1] >= now).any():
                    raise ValueError('provider_incomplete_history')
                frame = frame[frame.close_time < now]
                validated = validate_candles(frame, unit='ms', now_ms=now)
                if len(validated) < HISTORY or now-int(validated.close_time.iloc[-1]) > 90_000:
                    raise ValueError('provider_history_stale_or_short')
                history.clear()
                history.extend(validated.iloc[-HISTORY:].to_dict('records'))
                return pd.DataFrame(history), now
            except urllib.error.HTTPError as error:
                if error.code in (418, 429):
                    retry = error.headers.get('Retry-After', '60')
                    try:
                        delay = max(60, min(86400, float(retry)))
                    except ValueError:
                        delay = 60
                    self.blocked_until = self.clock()+delay*1000
                    raise ValueError('provider_rate_limited') from error
                if error.code < 500 or attempt:
                    raise ValueError('provider_http_failure') from error
            except (TimeoutError, OSError):
                if attempt:
                    raise ValueError('provider_timeout_or_network')
            self.pause(.25*2**attempt)
        raise ValueError('provider_unavailable')


class Engine:
    def __init__(self, registry, provider, clock=lambda: int(time.time()*1000)):
        self.registry, self.provider, self.clock = registry, provider, clock
        self.cache = {}  # At most 24 symbol/horizon/origin records.

    def cycle(self):
        results = []
        for symbol in SYMBOLS:
            entries = {}
            try:
                for horizon in HORIZONS:
                    entries[horizon] = self.registry.get(symbol, horizon)
            except Exception:
                results.extend(unavailable(symbol, h, self.clock(), 'model_registry_unavailable') for h in HORIZONS)
                LOG.warning(json.dumps({'event': 'registry_unavailable', 'symbol': symbol}))
                continue
            usable = any(item['status'] == 'experimental' and model is not None for item, model in entries.values())
            frame = updated = feature_rows = None
            error = None
            if usable:
                try:
                    frame, updated = self.provider.candles(symbol)
                    feature_rows = features(frame).loc[:, FEATURES].dropna().to_numpy(dtype=float)
                    if len(feature_rows) < LOOKBACK:
                        raise ValueError('insufficient_feature_history')
                except Exception:
                    error = 'live_market_data_unavailable'
                    LOG.warning(json.dumps({'event': 'provider_unavailable', 'symbol': symbol}))
            for horizon, (item, model) in entries.items():
                now = self.clock()
                reason = item['reason'] if item['status'] != 'experimental' else error
                if reason and (item['status'] != 'experimental' or error):
                    results.append(unavailable(symbol, horizon, now, reason))
                    continue
                try:
                    if model is None or horizon == '1M':
                        raise ValueError('missing_model')
                    source = int(frame.close_time.iloc[-1])
                    target = target_time(source, horizon)
                    if not source < now < target or now-source > 90_000:
                        results.append(unavailable(symbol, horizon, now, 'input_or_forecast_expired', stale=True))
                        continue
                    key = (symbol, horizon)
                    identity = (self.registry.key, item['modelVersion'], source)
                    cached = self.cache.get(key)
                    if cached and cached[0] == identity:
                        results.append(dict(cached[1]))
                        continue
                    x = feature_rows[-LOOKBACK:][None] if item['algorithm'] == 'lstm' else feature_rows[-1:]
                    started = time.perf_counter()
                    prediction = float(numeric_predict(model, x)[0])
                    price = float(frame.close.iloc[-1])
                    if not math.isfinite(prediction) or abs(prediction) > 2:
                        raise ValueError('invalid_predicted_return')
                    value = {'version': 'forecast-v2', 'symbol': symbol, 'horizon': horizon,
                        'status': 'experimental', 'reason': item['reason'], 'stale': False,
                        'referencePrice': price, 'predictedPrice': price*math.exp(prediction),
                        'predictedLogReturn': prediction, 'marketUpdatedAt': iso(updated),
                        'sourceCandleTime': iso(source), 'generatedAt': iso(self.clock()), 'targetTime': iso(target),
                        'modelVersion': item['modelVersion'], 'algorithm': item['algorithm'],
                        'featureSchema': item['featureSchema'], 'datasetFingerprint': item['datasetFingerprint'],
                        'evaluationMetrics': item['evaluationMetrics']}
                    # Crossing the target while inferring cannot create a live forecast.
                    if self.clock() >= target:
                        results.append(unavailable(symbol, horizon, self.clock(), 'inference_finished_after_target', stale=True))
                        continue
                    self.cache[key] = identity, value
                    results.append(dict(value))
                    LOG.info(json.dumps({'event': 'forecast_generated', 'symbol': symbol, 'horizon': horizon,
                                         'latencyMs': (time.perf_counter()-started)*1000}))
                except Exception:
                    results.append(unavailable(symbol, horizon, now, 'model_inference_unavailable'))
        return {'version': 'forecast-publication-v2', 'generatedAt': iso(self.clock()), 'forecasts': results}


def run_worker(registry, output, *, once=False, stop=None):
    from threading import Event
    from job_lock import job_lock
    stop = stop or Event()
    engine = Engine(registry, BinanceMinutes())
    with job_lock(output):
        while not stop.is_set():
            began = time.perf_counter()
            atomic_json(output, engine.cycle())
            LOG.info(json.dumps({'event': 'forecast_cycle_published', 'seconds': time.perf_counter()-began}))
            if once:
                return
            # Align shortly after each UTC minute closes; freshness is checked again on read.
            delay = 60-time.time()%60+2
            stop.wait(min(60, delay))
