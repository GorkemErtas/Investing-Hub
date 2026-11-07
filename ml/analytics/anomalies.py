"""Observed-at-t alerts, not t+1 predictions or fraud labels."""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from .statistics import stamp

INDICATORS = ['return_1', 'log_volume_change', 'volatility_14', 'daily_range']


def detect(features, cfg):
    data = features.dropna(subset=INDICATORS).copy()
    # A gap starts an independent reference history. Never make adjacent rows
    # stand in for absent calendar observations.
    events, eligible = [], {method: 0 for method in ('rolling_z', 'rolling_iqr', 'rolling_mad', 'isolation_forest')}
    for _, group in data.groupby('segment'):
        x = group[INDICATORS]
        previous = x.shift(1)
        mean, std = previous.rolling(60, min_periods=30).mean(), previous.rolling(60, min_periods=30).std()
        q1, q3 = previous.rolling(90, min_periods=30).quantile(.25), previous.rolling(90, min_periods=30).quantile(.75)
        median = previous.rolling(90, min_periods=30).median()
        mad = previous.rolling(90, min_periods=30).apply(lambda a: np.median(np.abs(a - np.median(a))), raw=True)
        iqr = (q3 - q1).replace(0, np.nan)
        scores = {'rolling_z': ((x - mean).abs() / std.replace(0, np.nan), 3., 60),
            'rolling_iqr': (pd.DataFrame(np.maximum((q1 - x) / iqr, (x - q3) / iqr), index=x.index, columns=x.columns), 1.5, 90),
            'rolling_mad': ((x - median).abs() / (1.4826 * mad.replace(0, np.nan)), 6., 90)}
        for method, (values, threshold, window) in scores.items():
            for offset, (index, row) in enumerate(values.iterrows()):
                finite = row.replace([np.inf, -np.inf], np.nan).dropna()
                if finite.empty:
                    continue
                eligible[method] += 1
                indicator = finite.idxmax()
                score = float(finite[indicator])
                if score <= threshold:
                    continue
                events.append({'time': stamp(group.loc[index, 'source_time']), 'method': method, 'indicator': indicator,
                    'score': score, 'threshold': threshold, 'referenceStart': stamp(group.source_time.iloc[max(0, offset-window)]),
                    'referenceEnd': stamp(group.source_time.iloc[offset-1]), 'severity': 'high' if score >= 2 * threshold else 'moderate'})
        # Monthly refits on at most one year of strictly earlier features.
        for start in range(cfg['anomaly_train_days'], len(group), 30):
            training, observed = group.iloc[max(0, start-365):start], group.iloc[start:start+30]
            detector = IsolationForest(n_estimators=80, contamination=.02, random_state=cfg['seed'], n_jobs=1)
            detector.fit(training[INDICATORS])
            values = -detector.decision_function(observed[INDICATORS])
            eligible['isolation_forest'] += len(observed)
            for index, score in zip(observed.index, values):
                if score <= 0:
                    continue
                events.append({'time': stamp(group.loc[index, 'source_time']), 'method': 'isolation_forest', 'indicator': 'joint_price_volume_volatility',
                    'score': float(score), 'threshold': 0., 'referenceStart': stamp(training.source_time.min()),
                    'referenceEnd': stamp(training.source_time.max()), 'severity': 'high' if score > .1 else 'moderate'})
    events.sort(key=lambda event: (event['time'], event['method']))
    return {'observations': len(data), 'labelsAvailable': False,
            'totals': [{'method': method, 'eligible': count, 'flagged': sum(e['method'] == method for e in events)} for method, count in eligible.items()],
            'events': events[-200:], 'eventsTruncated': len(events) > 200}, events
