"""Objective extension of the existing frozen worker/provider, with separate safe states."""
import json
import time
import numpy as np
from .data import SYMBOLS
from .features import HORIZONS, target_time
from .live import iso, LOG
from .objective_features import objective_features
from .objective_models import predict_direction, predict_volatility
from .objective_statistics import volatility_interval


def empty_objective(objective, reason, evaluation=None):
    result = {'status': 'unavailable', 'reason': reason, 'generatedAt': None, 'modelVersion': None,
              'algorithm': None, 'evaluation': evaluation}
    if objective == 'direction':
        result.update(direction=None, probabilities=None, calibrated=False)
    else:
        result.update(expectedVolatility=None, riskCategory=None, interval=None,
                      units='horizon_log_return_std')
    return result


def empty_bundle(symbol, horizon, now, reason, stale=False):
    return {'version': 'forecast-objectives-v3', 'symbol': symbol, 'horizon': horizon, 'stale': stale,
        'generatedAt': iso(now), 'marketUpdatedAt': None, 'sourceCandleTime': None,
        'targetTime': None, 'expiresAt': None,
        **{name: empty_objective(name, reason) for name in ('direction', 'volatility')}}


class ObjectiveEngine:
    def __init__(self, registry, provider, clock=lambda: int(time.time()*1000)):
        self.registry, self.provider, self.clock = registry, provider, clock
        self.cache = {}

    def cycle(self):
        results = []
        for symbol in SYMBOLS:
            for horizon in HORIZONS:
                now = self.clock()
                bundle = empty_bundle(symbol, horizon, now, 'objective_registry_unavailable')
                try:
                    entries = {name: self.registry.get(symbol, horizon, name) for name in ('direction', 'volatility')}
                    for name, (item, _) in entries.items():
                        bundle[name] = empty_objective(name, item['reason'], item.get('evaluation'))
                    if horizon == '1M':
                        for name in entries:
                            bundle[name] = empty_objective(name, 'monthly_insufficient_independent_outcomes')
                        results.append(bundle)
                        continue
                    if not any(item['status'] == 'validated' and model is not None for item, model in entries.values()):
                        results.append(bundle)
                        continue
                    frame, updated = self.provider.candles(symbol)
                    peers = {peer: frame if peer == symbol else self.provider.candles(peer)[0] for peer in ('BTCUSDT', 'ETHUSDT')}
                    rich, _ = objective_features(frame, symbol, peers)
                    source = int(frame.close_time.iloc[-1])
                    target = target_time(source, horizon)
                    now = self.clock()
                    if not source < now < target or now-source > 90000 or rich.iloc[-16:].isna().any().any():
                        results.append(empty_bundle(symbol, horizon, now, 'objective_input_or_target_expired', True))
                        continue
                    expires = min(target, source+90000)
                    bundle.update(marketUpdatedAt=iso(updated), sourceCandleTime=iso(source),
                                  targetTime=iso(target), expiresAt=iso(expires))
                    for name, (item, model) in entries.items():
                        if item['status'] != 'validated' or model is None:
                            continue
                        key = symbol, horizon, name
                        identity = self.registry.key, item['modelVersion'], source
                        cached = self.cache.get(key)
                        if cached and cached[0] == identity:
                            bundle[name] = dict(cached[1])
                            continue
                        try:
                            columns = model['features']
                            x = rich.loc[:, columns].iloc[-16:].to_numpy(dtype=float)
                            x = x[None] if model['algorithm'] == 'lstm' else x[-1:]
                            started = time.perf_counter()
                            result = {'status': 'validated', 'reason': 'future_confirmed_objective', 'generatedAt': iso(self.clock()),
                                'modelVersion': item['modelVersion'], 'algorithm': item['algorithm'], 'evaluation': item['evaluation']}
                            if name == 'direction':
                                p = predict_direction(model, x)[0]
                                if len(p) != 3 or not np.isfinite(p).all():
                                    raise ValueError('invalid_direction_probability')
                                result.update(direction=('down', 'neutral', 'up')[int(np.argmax(p))],
                                    probabilities=dict(zip(('down', 'neutral', 'up'), map(float, p))), calibrated=True)
                            else:
                                variance = float(predict_volatility(model, x)[0])
                                sigma = float(np.sqrt(variance))
                                if not np.isfinite(sigma) or sigma <= 0:
                                    raise ValueError('invalid_volatility_output')
                                cuts = item['riskThresholds']
                                category = ('low', 'medium', 'high')[int(np.digitize(sigma, cuts))]
                                interval = None
                                calibration = item.get('intervalCalibration')
                                if calibration and .85 <= calibration['measuredCoverage'] <= .97:
                                    low, high = volatility_interval(np.asarray([variance]), calibration['radius'])
                                    interval = {'lower': float(low[0]), 'upper': float(high[0]), 'nominalCoverage': .9,
                                        'measuredCoverage': calibration['measuredCoverage'], 'method': 'past_split_conformal'}
                                result.update(expectedVolatility=sigma, riskCategory=category, interval=interval, units='horizon_log_return_std')
                            if self.clock() >= expires:
                                raise ValueError('objective_expired_during_inference')
                            self.cache[key] = identity, result
                            bundle[name] = dict(result)
                            LOG.info(json.dumps({'event': 'objective_generated', 'symbol': symbol, 'horizon': horizon,
                                'objective': name, 'latencyMs': (time.perf_counter()-started)*1000}))
                        except Exception:
                            bundle[name] = empty_objective(name, 'objective_inference_unavailable', item.get('evaluation'))
                    bundle['generatedAt'] = iso(self.clock())
                    if self.clock() >= expires:
                        bundle = empty_bundle(symbol, horizon, self.clock(), 'objective_expired_during_inference', True)
                except Exception:
                    bundle = empty_bundle(symbol, horizon, self.clock(), 'objective_registry_or_provider_unavailable')
                results.append(bundle)
        return {'version': 'objective-publication-v3', 'generatedAt': iso(self.clock()), 'forecasts': results}
