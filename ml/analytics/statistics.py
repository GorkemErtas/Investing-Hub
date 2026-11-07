"""Descriptive research and approximate dependence-aware inference."""
import numpy as np
import pandas as pd
from scipy import stats
from common import DAY_MS, iso


def stamp(value):
    return iso(int(value)).replace('+00:00', 'Z')


def summary(values):
    x = np.asarray(values, dtype=float)
    x = x[np.isfinite(x)]
    if not len(x):
        return None
    varying = len(x) > 3 and np.ptp(x) > 1e-12
    return {'samples': len(x), 'mean': float(x.mean()), 'median': float(np.median(x)),
            'variance': float(x.var(ddof=1)) if len(x) > 1 else None,
            'std': float(x.std(ddof=1)) if len(x) > 1 else None,
            'q05': float(np.quantile(x, .05)), 'q25': float(np.quantile(x, .25)),
            'q75': float(np.quantile(x, .75)), 'q95': float(np.quantile(x, .95)),
            'skewness': float(stats.skew(x, bias=False)) if varying else None,
            'excessKurtosis': float(stats.kurtosis(x, fisher=True, bias=False)) if varying else None}


def block_indices(n, length, rng):
    # Circular blocks avoid under-sampling the edges. Wraps are a bootstrap
    # device, never a training feature or a manufactured market observation.
    starts = rng.integers(0, n, size=int(np.ceil(n / length)))
    return ((starts[:, None] + np.arange(length)) % n).ravel()[:n]


def block_test(a, b, length=14, resamples=999, seed=42):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if min(len(a), len(b)) < max(60, 4 * length) or not np.isfinite([*a, *b]).all():
        raise ValueError('Insufficient finite observations for block inference')
    rng = np.random.default_rng(seed)
    observed = float(b.mean() - a.mean())
    draws = np.array([b[block_indices(len(b), length, rng)].mean() -
                      a[block_indices(len(a), length, rng)].mean() for _ in range(resamples)])
    centered = draws - observed
    quantiles = np.quantile(centered, [.025, .975])
    return {'effect': observed, 'ciLow': float(observed - quantiles[1]),
            'ciHigh': float(observed - quantiles[0]),
            'pValue': float((1 + (np.abs(centered) >= abs(observed)).sum()) / (resamples + 1)),
            'adjustedP': None, 'samplesA': len(a), 'samplesB': len(b), 'blockDays': length}


def holm(tests):
    valid = [test for test in tests if test.get('pValue') is not None]
    ordered = sorted(valid, key=lambda item: item['pValue'])
    previous = 0.
    for i, test in enumerate(ordered):
        previous = min(1., max(previous, (len(ordered) - i) * test['pValue']))
        test['adjustedP'] = previous
    return len(valid)


def descriptive(frame, cfg):
    returns = frame.groupby('segment', sort=False).close.pct_change(fill_method=None)
    volume = frame.groupby('segment', sort=False).volume.transform(lambda x: np.log1p(x).diff())
    vol = returns.groupby(frame.segment).transform(lambda x: x.rolling(14).std())
    clean = returns.dropna()
    counts, edges = np.histogram(clean, bins=21) if len(clean) else ([], [])
    paired = pd.concat([returns, volume], axis=1).dropna()
    coefficient = float(stats.spearmanr(paired.iloc[:, 0], paired.iloc[:, 1]).statistic) if len(paired) >= 30 and (paired.nunique() > 1).all() else None
    end = int(frame.close_time.max())
    days = cfg['period_days']
    first = returns.loc[(frame.close_time > end - 2 * days * DAY_MS) & (frame.close_time <= end - days * DAY_MS)]
    second = returns.loc[frame.close_time > end - days * DAY_MS]
    tests = []
    # Whole contiguous prespecified calendar periods only; never join across gaps.
    for name, transform in [('mean_return_difference', lambda x: x), ('mean_absolute_return_difference', np.abs)]:
        if len(first.dropna()) == days and len(second.dropna()) == days:
            result = block_test(transform(first), transform(second), cfg['block_days'], cfg['bootstrap_resamples'], cfg['seed'])
            result['sensitivity'] = [{'blockDays': length, **{k: v for k, v in block_test(transform(first), transform(second), length,
                cfg['bootstrap_resamples'], cfg['seed']).items() if k in ('ciLow', 'ciHigh')}} for length in (7, 28)]
            result.update({'name': name, 'status': 'available', 'periodAStart': stamp(end - 2 * days * DAY_MS + 1),
                           'periodAEnd': stamp(end - days * DAY_MS), 'periodBStart': stamp(end - days * DAY_MS + 1),
                           'periodBEnd': stamp(end)})
        else:
            result = {'name': name, 'status': 'insufficient_data', 'reason': 'Require two complete contiguous prespecified periods'}
        tests.append(result)
    by_time = pd.DataFrame({'dailyReturn': returns.to_numpy(), 'volatility14': vol.to_numpy()}, index=frame.close_time.to_numpy())
    calendar = by_time.reindex(np.arange(int(frame.close_time.min()), end + 1, DAY_MS))
    series = [{'time': stamp(t), 'dailyReturn': float(row.dailyReturn) if pd.notna(row.dailyReturn) else None,
               'volatility14': float(row.volatility14) if pd.notna(row.volatility14) else None} for t, row in calendar.iloc[-180::7].iterrows()]
    return {'returns': summary(clean), 'priceVolumeSpearman': coefficient,
            'returnAutocorrelation1': float(returns.corr(returns.shift(1))) if len(clean) > 30 and clean.std() > 1e-12 else None,
            'absoluteReturnAutocorrelation1': float(returns.abs().corr(returns.abs().shift(1))) if len(clean) > 30 and clean.abs().std() > 1e-12 else None,
            'histogram': [{'low': float(edges[i]), 'high': float(edges[i+1]), 'count': int(count)} for i, count in enumerate(counts)],
            'series': series, 'tests': tests}, pd.Series(returns.to_numpy(), index=frame.close_time.to_numpy())


def correlations(all_returns):
    result = {symbol: [] for symbol in all_returns}
    if len(all_returns) < 2:
        return result
    aligned = pd.DataFrame(all_returns).sort_index()
    aligned = aligned.reindex(np.arange(aligned.index.min(), aligned.index.max() + 1, DAY_MS))
    for symbol in aligned:
        for other in aligned:
            if other == symbol:
                continue
            pair = aligned[[symbol, other]]
            rolling = pair[symbol].rolling(30, min_periods=30).corr(pair[other]).replace([np.inf, -np.inf], np.nan)
            latest = rolling.iloc[-1]
            result[symbol].append({'otherSymbol': other, 'windowDays': 30, 'samples': int(pair.tail(30).dropna().shape[0]),
                'value': float(np.clip(latest, -1, 1)) if pd.notna(latest) else None,
                'points': [{'time': stamp(t), 'value': float(np.clip(v, -1, 1)) if pd.notna(v) else None} for t, v in rolling.iloc[-180::7].items()]})
    return result
