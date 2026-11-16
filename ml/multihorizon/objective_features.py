"""Research extensions to the existing minute features; exact past-only alignment."""
import numpy as np
import pandas as pd
from .data import MINUTE
from .features import FEATURES, features

OBJECTIVE_FEATURE_VERSION = 'direction-volatility-finite-v1'
OBJECTIVE_HISTORY = 1536


def objective_features(frame, symbol, peers):
    out = features(frame)
    log = np.log(frame.close.astype(float))
    returns = log.diff()
    groups = {
        'multiscale': [f'return_{n}' for n in (1, 5, 15, 60)],
        'volatility': ['volatility_15', 'volatility_60', 'atr_14'],
        'activity': ['relative_volume', 'volume_change', 'quote_activity', 'trade_activity', 'taker_ratio'],
        'structure': ['range', 'body', 'bollinger_20'],
        'trend': ['sma_20', 'sma_60', 'ema_12', 'macd', 'rsi_14'],
        'cross_asset': [], 'clock': ['hour_sin', 'hour_cos', 'week_sin', 'week_cos'],
    }
    def add(group, name, value):
        out[name] = value
        groups[group].append(name)
    for window in (120, 240, 480):
        add('multiscale', f'momentum_{window}', log.diff(window))
    for window in (5, 15, 60, 240, 1440):
        variance = returns.pow(2).rolling(window).mean()
        add('volatility', f'log_variance_{window}', np.log(variance.clip(lower=1e-12)))
    for window in (15, 60):
        scale = np.sqrt(returns.pow(2).rolling(window).sum().clip(lower=1e-12))
        add('multiscale', f'normalized_momentum_{window}', log.diff(window)/scale)
    add('volatility', 'volatility_ratio', np.exp((out.log_variance_5-out.log_variance_60)/2))
    for name, values in [('quote', frame.quote_volume), ('trades', frame.trades), ('volume', frame.volume)]:
        add('activity', f'relative_{name}_60', (values/(values.rolling(60).mean()+1e-8)).clip(upper=100))
    imbalance = 2*frame.taker_base/(frame.volume+1e-8)-1
    for window in (5, 15, 60):
        add('activity', f'buy_imbalance_{window}', imbalance.rolling(window).mean())
    size = (frame.high-frame.low).clip(lower=1e-12)
    add('structure', 'upper_wick', (frame.high-frame[['open', 'close']].max(axis=1))/size)
    add('structure', 'lower_wick', (frame[['open', 'close']].min(axis=1)-frame.low)/size)
    add('structure', 'close_location', (frame.close-frame.low)/size)
    add('trend', 'efficiency_60', log.diff(60).abs()/(returns.abs().rolling(60).sum()+1e-12))
    add('trend', 'up_return_share_60', returns.clip(lower=0).rolling(60).sum()/(returns.abs().rolling(60).sum()+1e-12))
    for peer in ('BTCUSDT', 'ETHUSDT'):
        other = peers[peer]
        if other.close_time.duplicated().any() or not (np.diff(other.close_time) == MINUTE).all():
            raise ValueError('cross_asset_history_not_contiguous')
        peer_log = np.log(other.close.astype(float))
        for window in (1, 15, 60):
            # A peer candle becomes eligible one full minute later. No forward/asof joins.
            series = pd.Series(peer_log.diff(window).to_numpy(), index=other.close_time.to_numpy()+MINUTE)
            aligned = series.reindex(frame.close_time.to_numpy()).to_numpy()
            if peer == symbol:
                aligned = np.where(np.isfinite(aligned), 0., np.nan)
            add('cross_asset', f'{peer}_lagged_return_{window}', aligned)
    out = out.replace([np.inf, -np.inf], np.nan)
    return out, groups


def objective_targets(frame, horizon_minutes):
    if horizon_minutes not in (1, 15, 60):
        raise ValueError('unsupported_objective_horizon')
    log = np.log(frame.close.astype(float))
    minute_return = log.diff()
    future_return = log.shift(-horizon_minutes)-log
    variance = minute_return.pow(2).rolling(horizon_minutes).sum().shift(-horizon_minutes)
    scale = np.sqrt(minute_return.pow(2).rolling(60).mean().clip(lower=1e-12)*horizon_minutes)
    neutral = np.maximum(.0001, .5*scale)
    return pd.DataFrame({
        'source_time': frame.close_time, 'target_time': frame.close_time.shift(-horizon_minutes),
        'return': future_return, 'variance': variance, 'volatility': np.sqrt(variance),
        'neutral_threshold': neutral,
        'binary': np.where(future_return > 0, 1., np.where(future_return < 0, 0., np.nan)),
        'neutral': np.where(future_return > neutral, 2, np.where(future_return < -neutral, 0, 1)),
        'past_variance': scale.pow(2), 'minute_return': minute_return,
    })


def feature_columns(frame, groups, kind='rich', removed=None):
    if kind == 'legacy':
        return list(FEATURES)
    if kind == 'har':
        return ['log_variance_5', 'log_variance_60', 'log_variance_1440']
    drop = set(groups.get(removed, ()))
    return [name for name in frame.columns if name not in drop]
