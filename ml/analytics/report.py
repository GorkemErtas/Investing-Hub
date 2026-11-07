"""Compose bounded research from existing verified sources and frozen registry."""
import json
import platform
from pathlib import Path
import numpy as np
import pandas as pd
import scipy
import sklearn
from common import SYMBOLS, DAY_MS, ROOT, canonical, digest, latest_open
from features import FEATURES, FEATURE_VERSION, feature_frame
from forecast import forward_rows, score_rows, baseline_rows
from .statistics import descriptive, correlations, holm, stamp, summary
from .classification import research
from .anomalies import detect
from .sql import query

DEFAULT_CONFIG = {'seed': 42, 'period_days': 180, 'block_days': 14, 'bootstrap_resamples': 999,
    'walk_forward_splits': 3, 'fold_days': 60, 'min_train_samples': 180, 'threshold_days': 60,
    'event_quantile': .95, 'anomaly_train_days': 180, 'max_rows': 6000}


def code_hash():
    files = sorted(Path(__file__).parent.glob('*.py')) + [Path(__file__).with_name('queries.sql'), ROOT/'features.py', ROOT/'train.py', ROOT/'forecast.py', ROOT/'common.py', ROOT/'store.py', ROOT/'anomaly_reviews.py', ROOT/'reviews/historical_price_movements.json', ROOT.parent/'shared/contracts.ts']
    return digest(b''.join(path.name.encode() + path.read_bytes() for path in files))


def registry_models(store, symbol, features, now):
    regressions, monitoring, evaluated = [], [], []
    sql_ids = {r['id'] for r in query(store, 'evaluated', symbol=symbol, now=now)}
    # Read bounded metadata; store.model additionally verifies artifact integrity.
    for item in query(store, 'versions', symbol=symbol):
        model = store.model(item['id'])
        meta = model['metadata']
        folds = meta.get('walk_forward', [])
        validation = meta.get('validation_metrics')
        if validation and folds:
            regressions.append({'modelId': model['id'], 'model': meta.get('algorithm', 'unknown'), 'version': model['id'],
                'status': model['status'], 'phase': 'historical_selection', 'datasetFingerprint': meta['dataset_fingerprint'],
                'featureVersion': meta['feature_version'], 'trainedAt': stamp(meta['trained_at']),
                'trainStart': stamp(meta['training_range']['source_start']), 'trainEnd': stamp(meta['training_range']['target_end']),
                'evaluationStart': stamp(folds[-1]['evaluation_source_start']), 'evaluationEnd': stamp(folds[-1]['evaluation_target_end']),
                'samples': validation['samples'], 'returnMae': validation['return_mae'], 'returnRmse': validation['return_rmse'],
                'priceMaeUsdt': validation['price_mae_usdt'], 'priceRmseUsdt': validation['price_rmse_usdt'],
                'baselineRmse': meta['baseline_metrics']['return_rmse'], 'foldRmses': [f['metrics']['return_rmse'] for f in folds],
                'foldWins': meta.get('walk_forward_wins', sum(f['metrics']['return_rmse'] < f['no_change']['return_rmse'] for f in folds)),
                'historicalPass': bool(meta.get('historical_pass', False)), 'interval': meta.get('interval_calibration')})
        observations = forward_rows(store, model, now)
        # The canonical filter remains authoritative, even if SQL is broadened later.
        observations = [r for r in observations if r['id'] in sql_ids]
        evaluated.extend(observations)
        if not observations:
            continue
        for origin, phase in [('active', 'prospective_active'), ('shadow', 'prospective_shadow')]:
            rows = [r for r in observations if (json.loads(r['details']).get('model_status_at_generation') == 'active') == (origin == 'active')]
            if not rows:
                continue
            residuals = [r['predicted_return'] - r['actual_return'] for r in rows]
            intervals = [(r, json.loads(r['details']).get('calibration')) for r in rows]
            intervals = [(r, interval) for r, interval in intervals if interval]
            regimes = []
            # Thresholds are fixed from data strictly before the forecast source.
            source = features.set_index('source_time')
            medians = source.volatility_14.shift(1).rolling(90, min_periods=30).median()
            for regime in ('high_volatility', 'lower_volatility', 'unavailable'):
                selected = []
                for r in rows:
                    t = r['source_time']
                    known = t in medians.index and pd.notna(medians.loc[t]) and pd.notna(source.loc[t, 'volatility_14'])
                    label = ('high_volatility' if source.loc[t, 'volatility_14'] > medians.loc[t] else 'lower_volatility') if known else 'unavailable'
                    if label == regime:
                        selected.append(r)
                if selected:
                    regimes.append({'regime': regime, 'samples': len(selected), 'returnRmse': score_rows(selected)['return_rmse']})
            monitoring.append({'modelId': model['id'], 'phase': phase, 'samples': len(rows), 'returnRmse': score_rows(rows)['return_rmse'],
                'baselineRmse': baseline_rows(rows)['return_rmse'], 'residuals': summary(residuals), 'regimes': regimes,
                'intervalSamples': len(intervals), 'nominalCoverage': .9 if intervals else None,
                'intervalCoverage': float(np.mean([interval['lowerPrice'] <= r['actual_price'] <= interval['upperPrice'] for r, interval in intervals])) if intervals else None,
                'meanRelativeIntervalWidth': float(np.mean([(interval['upperPrice'] - interval['lowerPrice']) / r['reference_price'] for r, interval in intervals])) if intervals else None})
    return regressions, monitoring, evaluated


def build_report(store, database, now, config=None):
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    if cfg['period_days'] < 112 or cfg['bootstrap_resamples'] < 99 or cfg['max_rows'] > 6000 or cfg['block_days'] != 14:
        raise ValueError('Unsupported bounded analytics configuration')
    code = code_hash()
    results, returns, all_evaluated, all_events = [], {}, [], []
    coverage = {r['symbol']: r for r in query(store, 'assets')}
    for symbol in SYMBOLS:
        result = {'symbol': symbol, 'status': 'unavailable', 'reason': 'no_verified_dataset', 'dataset': None,
            'statistics': None, 'correlations': [], 'classifiers': [], 'regressions': [], 'monitoring': [],
            'deterioration': [], 'anomalies': None, 'anomalyFrequency': [], 'findings': []}
        results.append(result)
        if symbol not in coverage:
            continue
        if coverage[symbol]['rows'] > cfg['max_rows']:
            result['reason'] = 'dataset_exceeds_research_bound'
            continue
        try:
            frame, dataset, quality = store.verified_frame(symbol, now)
            stats, returns[symbol] = descriptive(frame, cfg)
            features = feature_frame(frame)
            features['segment'] = frame.segment
            labeled = features.dropna(subset=FEATURES + ['target', 'target_time'])
            result.update({'status': 'available' if len(labeled) >= 500 and not quality['missing_days'] else 'insufficient_data',
                'reason': None if len(labeled) >= 500 and not quality['missing_days'] else 'insufficient_contiguous_training_history',
                'dataset': {'fingerprint': dataset['fingerprint'], 'rows': len(frame), 'missingDays': quality['missing_days'],
                    'firstClose': stamp(frame.close_time.min()), 'lastClose': stamp(frame.close_time.max()),
                    'usableSamples': len(labeled), 'freshness': 'current' if int(frame.open_time.max()) == latest_open(now) else 'stale'},
                'statistics': stats})
            # Sparse/gapped histories still support descriptions and segmented
            # observed alerts, but never equally-spaced classifier evaluation.
            if result['status'] == 'available':
                result['classifiers'] = research(labeled, cfg, dataset['fingerprint'], code)
            result['anomalies'], events = detect(features, cfg)
            result['anomalyFrequency'] = query(store, 'anomaly_frequency', anomalies=canonical(events))
            result['regressions'], result['monitoring'], evaluated = registry_models(store, symbol, features, now)
            result['deterioration'] = query(store, 'deterioration', evaluated=canonical(evaluated))
            result['findings'] = [f"{len(frame)} verified daily candles; {quality['missing_days']} missing observations; data is {result['dataset']['freshness']}.",
                f"{len(labeled)} labeled past-only feature rows; classifiers are historical research, never approved forecasts.",
                f"{len(events)} method alerts (a date can trigger several methods); no verified anomaly labels exist.",
                'No prospective evaluation is available.' if not evaluated else f'{len(evaluated)} genuine evaluated ledger forecasts; shadow and active origins remain separate.',
                'Correlation is association, not causation. Empirical interval coverage does not guarantee future coverage.']
            all_events.extend({'symbol': symbol, **event} for event in events)
            all_evaluated.extend(evaluated)
        except (ValueError, KeyError, TypeError, OverflowError):
            returns.pop(symbol, None)
            # Fail closed for the affected asset; never expose a partially
            # verified dataset or raw exception details in an analytical export.
            result.update({'status': 'unavailable', 'reason': 'verification_or_analysis_failed', 'dataset': None,
                'statistics': None, 'correlations': [], 'classifiers': [], 'regressions': [], 'monitoring': [],
                'deterioration': [], 'anomalies': None, 'anomalyFrequency': [], 'findings': []})
    count = holm([test for result in results if result['statistics'] for test in result['statistics']['tests']])
    related = correlations(returns)
    for result in results:
        result['correlations'] = related.get(result['symbol'], [])
    metadata = Path(database).stat()
    report = {'version': 'analytics-lab-v1', 'generatedAt': stamp(now),
        'runId': digest(canonical([now, code, cfg, [r['dataset'] for r in results]]).encode()),
        'provenance': {'codeHash': code, 'configHash': digest(canonical(cfg).encode()), 'featureVersion': FEATURE_VERSION,
            'seed': cfg['seed'], 'registry': {'size': metadata.st_size, 'mtimeNs': str(metadata.st_mtime_ns)},
            'environment': {'python': platform.python_version(), 'numpy': np.__version__, 'pandas': pd.__version__, 'scipy': scipy.__version__, 'sklearn': sklearn.__version__}},
        'config': cfg, 'hypothesisFamilySize': count, 'scope': 'local_research_only', 'assets': results,
        'limitations': ['All periods are historical development/research; no unseen/prospective classifier performance is claimed.',
            'Block inference assumes approximately stationary, short-memory processes within each prespecified window; nonstationarity and long memory can invalidate it.',
            'Circular block boundaries are synthetic resampling devices. Pointwise confidence intervals are not multiplicity-adjusted; Holm applies to the primary p-value family.',
            'Model output scores are uncalibrated; Brier assesses probability error, not proof of calibration. AP is average precision, not trapezoidal PR-AUC.',
            'Outliers are retained. Alerts are observed at t, not forecasts of t+1, fraud, electricity theft or technical losses.',
            'Research does not alter registry state, approve models, reconcile outcomes, publish forecasts or call Gemini.']}
    canonical(report)  # Reject every remaining NaN/Infinity before persistence.
    return report, all_evaluated, all_events
