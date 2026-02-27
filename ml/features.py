"""Past-only feature contract, shared by training and offline inference."""
from __future__ import annotations

import numpy as np
import pandas as pd

FEATURES = ['return_1', 'return_2', 'return_3', 'return_7', 'return_14',
            'volatility_7', 'volatility_14', 'mean_return_7', 'mean_return_14',
            'close_to_mean_7', 'close_to_mean_14', 'daily_range', 'body_return', 'log_volume_change']
DAY_MS = 86_400_000


def validate_candles(raw: pd.DataFrame, max_return: float = 0.8) -> tuple[pd.DataFrame, dict]:
    required = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time']
    if not set(required).issubset(raw):
        raise ValueError('Missing OHLCV columns')
    frame = raw[required].apply(pd.to_numeric, errors='raise').copy()
    if not np.isfinite(frame.to_numpy()).all():
        raise ValueError('Nonfinite OHLCV value')
    if frame.open_time.duplicated().any():
        raise ValueError('Duplicate open timestamps')
    frame = frame.sort_values('open_time').reset_index(drop=True)
    now = pd.Timestamp.now(tz='UTC').value // 1_000_000
    if (frame.close_time >= now).any():
        raise ValueError('Incomplete daily candle')
    if ((frame.open_time % DAY_MS != 0) | (frame.close_time != frame.open_time + DAY_MS - 1)).any():
        raise ValueError('Non-UTC or invalid daily interval')
    prices = frame[['open', 'high', 'low', 'close']]
    if (prices <= 0).any().any() or (frame.volume < 0).any():
        raise ValueError('Nonpositive price or negative volume')
    if ((frame.low > prices[['open', 'close']].min(axis=1)) | (frame.high < prices[['open', 'close']].max(axis=1))).any():
        raise ValueError('Invalid OHLC range')
    daily_return = frame.close.pct_change(fill_method=None)
    if (daily_return.abs() > max_return).any():
        raise ValueError('Extreme daily return requires manual source review; no silent clipping')
    gaps = int((frame.open_time.diff().dropna() != DAY_MS).sum())
    frame['segment'] = frame.open_time.diff().ne(DAY_MS).cumsum()
    return frame, {'rows': len(frame), 'gap_boundaries': gaps, 'duplicates': 0,
                   'anomalies': 0, 'policy': 'Reject malformed/anomalous data; break windows at gaps, never fill prices.'}


def feature_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Features at close t predict return close[t+1]/close[t]-1.

    Every rolling transform ends at t. Gaps start new independent windows.
    This function also produces the final row for future offline inference.
    """
    parts = []
    for _, segment in frame.groupby('segment', sort=False):
        close = segment.close
        output = pd.DataFrame(index=segment.index)
        for lag in [1, 2, 3, 7, 14]:
            output[f'return_{lag}'] = close.pct_change(lag, fill_method=None)
        returns = close.pct_change(fill_method=None)
        for window in [7, 14]:
            output[f'volatility_{window}'] = returns.rolling(window).std()
            output[f'mean_return_{window}'] = returns.rolling(window).mean()
            output[f'close_to_mean_{window}'] = close / close.rolling(window).mean() - 1
        output['daily_range'] = (segment.high - segment.low) / close
        output['body_return'] = close / segment.open - 1
        output['log_volume_change'] = np.log1p(segment.volume).diff()
        output['close'] = close
        output['source_time'] = segment.close_time
        output['target'] = close.shift(-1) / close - 1
        output['target_time'] = segment.close_time.shift(-1)
        parts.append(output)
    return pd.concat(parts).sort_index().replace([np.inf, -np.inf], np.nan)


def prepare(raw: pd.DataFrame, max_return: float = 0.8):
    frame, quality = validate_candles(raw, max_return)
    data = feature_frame(frame).dropna(subset=FEATURES + ['target', 'target_time'])
    quality['usable_samples'] = len(data)
    quality['excluded_warmup_or_gap_samples'] = len(frame) - len(data)
    if len(data) < 500:
        raise ValueError('Need at least 500 usable daily samples')
    return data, quality
