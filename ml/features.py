"""Past-only feature contract, shared by training and offline inference."""
from __future__ import annotations

import numpy as np
import pandas as pd
import math

from common import COLUMNS, DAY_MS, utc_ms

FEATURES = ['return_1', 'return_2', 'return_3', 'return_7', 'return_14',
            'volatility_7', 'volatility_14', 'mean_return_7', 'mean_return_14',
            'close_to_mean_7', 'close_to_mean_14', 'daily_range', 'body_return', 'log_volume_change']
FEATURE_VERSION = 'daily-past-only-v2'


def validate_candles(raw: pd.DataFrame, max_return: float = 0.8,
                     now_ms: int | None = None, *, symbol=None, sources=None) -> tuple[pd.DataFrame, dict]:
    if not math.isfinite(max_return) or not 0 < max_return <= 0.8:
        raise ValueError('Daily-return threshold must be positive and at most 80%; use exact anomaly reviews')
    required = COLUMNS
    if not set(required).issubset(raw):
        raise ValueError('Missing OHLCV columns')
    frame = raw[required].apply(pd.to_numeric, errors='raise').copy()
    if not np.isfinite(frame.to_numpy()).all():
        raise ValueError('Nonfinite OHLCV value')
    if frame.empty:
        raise ValueError('Empty candle dataset')
    for column in ('open_time', 'close_time'):
        if ((frame[column] % 1 != 0) | (frame[column] < 1262304000000) |
                (frame[column] >= 10**14)).any():
            raise ValueError('Timestamps must be integral Unix milliseconds since 2010')
        frame[column] = frame[column].astype('int64')
    if frame.open_time.duplicated().any():
        raise ValueError('Duplicate open timestamps')
    frame = frame.sort_values('open_time').reset_index(drop=True)
    now = utc_ms() if now_ms is None else now_ms
    if (frame.open_time + DAY_MS > now).any():
        raise ValueError('Incomplete daily candle')
    if ((frame.open_time % DAY_MS != 0) | (frame.close_time != frame.open_time + DAY_MS - 1)).any():
        raise ValueError('Non-UTC or invalid daily interval')
    prices = frame[['open', 'high', 'low', 'close']]
    if (prices <= 0).any().any() or (frame.volume < 0).any():
        raise ValueError('Nonpositive price or negative volume')
    if ((frame.low > prices[['open', 'close']].min(axis=1)) | (frame.high < prices[['open', 'close']].max(axis=1))).any():
        raise ValueError('Invalid OHLC range')
    daily_return = frame.close.pct_change(fill_method=None)
    extremes = frame.index[daily_return.abs() > max_return].tolist()
    review = None
    if extremes:
        from anomaly_reviews import review_extremes
        review = review_extremes(frame, extremes, symbol, sources)
    gaps = int((frame.open_time.diff().dropna() != DAY_MS).sum())
    frame['segment'] = frame.open_time.diff().ne(DAY_MS).cumsum()
    missing = int(((frame.open_time.diff().dropna() // DAY_MS) - 1).clip(lower=0).sum())
    quality = {'rows': len(frame), 'gap_boundaries': gaps, 'missing_days': missing, 'duplicates': 0,
               'anomalies': len(extremes), 'policy': 'Reject unreviewed extremes; exact reviewed observations retain original prices; break windows at gaps.'}
    if review:
        quality['anomaly_reviews'] = review
    return frame, quality


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


def prepare(raw: pd.DataFrame, max_return: float = 0.8, now_ms: int | None = None, *, symbol=None, sources=None):
    frame, quality = validate_candles(raw, max_return, now_ms, symbol=symbol, sources=sources)
    data = feature_frame(frame).dropna(subset=FEATURES + ['target', 'target_time'])
    quality['usable_samples'] = len(data)
    quality['excluded_warmup_or_gap_samples'] = len(frame) - len(data)
    if len(data) < 500:
        raise ValueError('Need at least 500 usable daily samples')
    return data, quality
