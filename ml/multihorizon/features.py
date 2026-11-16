"""Finite-window features: identical values offline and from a bounded live tail."""
from __future__ import annotations
import calendar
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from .data import MINUTE

FEATURE_VERSION = 'minute-finite-v2.1'
FEATURES = ('return_1', 'return_5', 'return_15', 'return_60', 'range', 'body',
    'volatility_15', 'volatility_60', 'sma_20', 'sma_60', 'ema_12', 'macd',
    'rsi_14', 'bollinger_20', 'atr_14', 'relative_volume', 'volume_change',
    'quote_activity', 'trade_activity', 'taker_ratio', 'hour_sin', 'hour_cos', 'week_sin', 'week_cos')
HORIZONS = {'1m': 1, '15m': 15, '1h': 60, '1M': None}
LOOKBACK = 16
HISTORY = 256


def target_time(source_ms, horizon):
    if horizon not in HORIZONS:
        raise ValueError('unsupported_horizon')
    minutes = HORIZONS[horizon]
    if minutes is not None:
        return int(source_ms) + minutes*MINUTE
    # Calendar-month addition, clamped to last valid day; preserves UTC clock.
    date = datetime.fromtimestamp(source_ms/1000, timezone.utc)
    year, month = (date.year+1, 1) if date.month == 12 else (date.year, date.month+1)
    return int(date.replace(year=year, month=month,
        day=min(date.day, calendar.monthrange(year, month)[1])).timestamp()*1000)


def finite_ema(series, span):
    window = span*3
    weights = (1-2/(span+1)) ** np.arange(window-1, -1, -1)
    weights /= weights.sum()
    return series.rolling(window).apply(lambda x: np.dot(x, weights), raw=True)


def features(frame):
    if not len(frame) or not (np.diff(frame.open_time) == MINUTE).all():
        raise ValueError('feature_history_not_contiguous')
    close = frame.close.astype(float)
    log = np.log(close)
    returns = log.diff()
    out = pd.DataFrame(index=frame.index)
    for lag in (1, 5, 15, 60):
        out[f'return_{lag}'] = log.diff(lag)
    out['range'] = (frame.high-frame.low)/close
    out['body'] = (close-frame.open)/frame.open
    for window in (15, 60):
        out[f'volatility_{window}'] = returns.rolling(window).std(ddof=0)
    for window in (20, 60):
        out[f'sma_{window}'] = close/close.rolling(window).mean()-1
    ema12, ema26 = finite_ema(close, 12), finite_ema(close, 26)
    out['ema_12'] = close/ema12-1
    out['macd'] = (ema12-ema26)/close
    up, down = close.diff().clip(lower=0).rolling(14).mean(), (-close.diff().clip(upper=0)).rolling(14).mean()
    out['rsi_14'] = (up/(up+down)).where(up+down > 0, .5)
    width = close.rolling(20).std(ddof=0)
    out['bollinger_20'] = ((close-close.rolling(20).mean())/width.where(width > 0)).where(width > 0, 0)
    true_range = pd.concat([frame.high-frame.low, (frame.high-close.shift()).abs(),
                            (frame.low-close.shift()).abs()], axis=1).max(axis=1)
    out['atr_14'] = true_range.rolling(14).mean()/close
    mean_volume = frame.volume.rolling(20).mean()
    out['relative_volume'] = (frame.volume/mean_volume.where(mean_volume > 0)).where(mean_volume > 0, 0)
    out['volume_change'] = np.log1p(frame.volume).diff()
    out['quote_activity'] = np.log1p(frame.quote_volume)
    out['trade_activity'] = np.log1p(frame.trades)
    out['taker_ratio'] = (frame.taker_base/frame.volume.where(frame.volume > 0)).where(frame.volume > 0, .5)
    dates = pd.to_datetime(frame.close_time, unit='ms', utc=True)
    hour = dates.dt.hour+dates.dt.minute/60
    week = dates.dt.dayofweek+hour/24
    out['hour_sin'], out['hour_cos'] = np.sin(hour*2*np.pi/24), np.cos(hour*2*np.pi/24)
    out['week_sin'], out['week_cos'] = np.sin(week*2*np.pi/7), np.cos(week*2*np.pi/7)
    return out.loc[:, FEATURES].replace([np.inf, -np.inf], np.nan)


def prepare(frame, horizon):
    if horizon not in HORIZONS or HORIZONS[horizon] is None:
        raise ValueError('monthly_insufficient_independent_outcomes' if horizon == '1M' else 'unsupported_horizon')
    steps = HORIZONS[horizon]
    out = features(frame)
    out['reference_price'] = frame.close
    out['source_time'] = frame.close_time
    out['target_time'] = frame.close_time.shift(-steps)
    out['target'] = np.log(frame.close.shift(-steps)/frame.close)
    out = out.dropna().reset_index(drop=True)
    if not ((out.target_time-out.source_time) == steps*MINUTE).all():
        raise ValueError('misaligned_target')
    return out.iloc[LOOKBACK-1:].reset_index(drop=True), out


def sequences(feature_array):
    return np.lib.stride_tricks.sliding_window_view(feature_array, LOOKBACK, axis=0).transpose(0, 2, 1)
