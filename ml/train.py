"""Chronological candidate selection; final test opened once after selection.

Exports complete sklearn pipelines for offline inference only. Nothing here
enables the web forecast API or executes simulated market orders.
"""
from __future__ import annotations

import hashlib
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.base import clone
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURES, prepare

ROOT = Path(__file__).resolve().parent


def metrics(target: np.ndarray, predicted: np.ndarray, close: np.ndarray):
    actual_price = close * (1 + target)
    predicted_price = close * (1 + predicted)
    return {'return_mae': float(mean_absolute_error(target, predicted)),
            'return_rmse': float(np.sqrt(mean_squared_error(target, predicted))),
            'price_mae_usdt': float(mean_absolute_error(actual_price, predicted_price)),
            'price_rmse_usdt': float(np.sqrt(mean_squared_error(actual_price, predicted_price))),
            'directional_accuracy': float(np.mean(np.sign(target) == np.sign(predicted))),
            'samples': len(target)}


def candidates(seed):
    return {'ridge': make_pipeline(StandardScaler(), Ridge(alpha=100.0)),
            'random_forest': make_pipeline(RandomForestRegressor(n_estimators=200, max_depth=4, min_samples_leaf=20, random_state=seed, n_jobs=1)),
            'gradient_boosting': make_pipeline(GradientBoostingRegressor(n_estimators=100, max_depth=2, min_samples_leaf=20, learning_rate=0.03, random_state=seed))}


def experiment(raw, config, symbol, provenance):
    data, quality = prepare(raw, config['max_absolute_daily_return'])
    train_end = int(len(data) * config['train_fraction'])
    validation_end = int(len(data) * (config['train_fraction'] + config['validation_fraction']))
    # Drop one horizon at each boundary: training labels cannot touch validation features.
    train, validation, test = data.iloc[:train_end - 1], data.iloc[train_end:validation_end - 1], data.iloc[validation_end:]
    x_train, y_train = train[FEATURES], train.target.to_numpy()
    x_val, y_val = validation[FEATURES], validation.target.to_numpy()
    baseline = metrics(y_val, np.zeros(len(validation)), validation.close.to_numpy())
    validation_metrics = {'no_change': baseline, 'historical_mean': metrics(y_val, np.full(len(validation), y_train.mean()), validation.close.to_numpy())}
    models = candidates(config['seed'])
    for name, model in models.items():
        model.fit(x_train, y_train)
        validation_metrics[name] = metrics(y_val, model.predict(x_val), validation.close.to_numpy())
    best = min(models, key=lambda name: validation_metrics[name]['return_rmse'])
    eligible = validation_metrics[best]['return_rmse'] < baseline['return_rmse'] * (1 - config['required_relative_rmse_improvement'])
    pretest = data.iloc[:validation_end - 1]
    folds = []
    for fold, (train_idx, val_idx) in enumerate(TimeSeriesSplit(n_splits=config['walk_forward_splits'], gap=1).split(pretest)):
        fold_train, fold_val = pretest.iloc[train_idx], pretest.iloc[val_idx]
        scores = {}
        y_fold, close = fold_val.target.to_numpy(), fold_val.close.to_numpy()
        scores['no_change'] = metrics(y_fold, np.zeros(len(fold_val)), close)
        scores['historical_mean'] = metrics(y_fold, np.full(len(fold_val), fold_train.target.mean()), close)
        for name, model in candidates(config['seed']).items():
            model.fit(fold_train[FEATURES], fold_train.target)
            scores[name] = metrics(y_fold, model.predict(fold_val[FEATURES]), close)
        folds.append({'fold': fold + 1, 'train_samples': len(train_idx), 'evaluation_start': int(fold_val.source_time.iloc[0]), 'metrics': scores})
    wins = sum(f['metrics'][best]['return_rmse'] < f['metrics']['no_change']['return_rmse'] for f in folds)
    eligible = eligible and wins >= 3
    selected = best if eligible else 'no_change'
    final_metrics = {'no_change': metrics(test.target.to_numpy(), np.zeros(len(test)), test.close.to_numpy())}
    artifact = None
    parity = None
    if eligible:
        final_model = clone(models[best]).fit(pretest[FEATURES], pretest.target)
        predicted = final_model.predict(test[FEATURES])
        final_metrics[best] = metrics(test.target.to_numpy(), predicted, test.close.to_numpy())
        artifact = final_model
    report = {'symbol': symbol, 'target': 'next_daily_return', 'price_target': 'next_daily_close', 'horizon': '1d',
              'feature_order': FEATURES, 'quality': quality, 'config': config, 'provenance': provenance,
              'split': {'train': len(train), 'validation': len(validation), 'test': len(test), 'gap_samples': 1,
                        'train_start': int(train.source_time.iloc[0]), 'train_end': int(train.target_time.iloc[-1]),
                        'validation_start': int(validation.source_time.iloc[0]), 'validation_end': int(validation.target_time.iloc[-1]),
                        'test_start': int(test.source_time.iloc[0]), 'test_end': int(test.target_time.iloc[-1])},
              'validation': validation_metrics, 'walk_forward': folds,
              'best_validation_candidate': best, 'walk_forward_wins': wins, 'selected': selected,
              'test': final_metrics, 'deployment_status': 'disabled_pending_manual_review' if eligible else 'disabled_no_validated_improvement',
              'inference_parity_max_absolute_error': parity,
              'limits': ['No trading strategy evaluated; no costs-adjusted performance claim.',
                         'Returns available only after candle close; do not assume execution at that same close.',
                         'Directional accuracy uses sign equality; zero-return baseline predicts neutral.',
                         'Single historical test regime; repeated research on it invalidates holdout independence.',
                         'No ONNX export; joblib pipeline is for trusted local offline use only.']}
    return report, artifact, test[FEATURES]


def main():
    config = json.loads((ROOT / 'config.json').read_text())
    config_hash = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    source_hash = hashlib.sha256((ROOT / 'features.py').read_bytes() + (ROOT / 'train.py').read_bytes()).hexdigest()
    provenance = json.loads((ROOT / 'data/provenance.json').read_text())
    reports = []
    for symbol in config['symbols']:
        path = ROOT / 'data' / f'{symbol}.csv'
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        if checksum != provenance['assets'][symbol]['sha256']:
            raise ValueError('Dataset checksum no longer matches provenance')
        version = f"{config['version']}-{symbol}-{checksum[:10]}-{config_hash[:8]}-{source_hash[:8]}"
        report, model, test_x = experiment(pd.read_csv(path), config, symbol, provenance['assets'][symbol])
        report.update({'model_version': version, 'dataset_sha256': checksum, 'config_sha256': config_hash, 'training_source_sha256': source_hash,
                       'candidate_parameters': {name: {key: value for key, value in model.get_params().items() if value is None or isinstance(value, (str, int, float, bool))} for name, model in candidates(config['seed']).items()},
                       'created_at': datetime.now(timezone.utc).isoformat(),
                       'environment': {'python': platform.python_version(), 'numpy': np.__version__, 'pandas': pd.__version__, 'scikit_learn': sklearn.__version__, 'joblib': joblib.__version__}})
        target = ROOT / 'artifacts' / version
        target.mkdir(parents=True, exist_ok=True)
        if model is not None:
            path = target / 'pipeline.joblib'
            joblib.dump({'pipeline': model, 'feature_order': FEATURES, 'version': version}, path)
            reloaded = joblib.load(path)['pipeline']  # Only load our own freshly-created artifact.
            delta = float(np.max(np.abs(model.predict(test_x) - reloaded.predict(test_x))))
            if delta > 1e-12:
                raise ValueError('Saved pipeline inference parity failed')
            report['inference_parity_max_absolute_error'] = delta
            report['artifact_sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        (target / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
        reports.append(report)
        print(f"{symbol}: selected={report['selected']}; status={report['deployment_status']}", flush=True)
    # Generated research summaries are reviewable, small text; raw data/models remain ignored.
    (ROOT / 'reports').mkdir(exist_ok=True)
    (ROOT / 'reports/latest.json').write_text(json.dumps(reports, indent=2) + '\n')
    lines = ['# Offline daily forecasting experiment', '', 'Binance Vision historical data; noncommercial research. Derived results licensed CC BY-NC-SA 4.0.', '',
             '| Pair | Best validation candidate | Validation return RMSE | No-change RMSE | Walk-forward wins | Selected | Test price RMSE (USDT) | Status |',
             '| --- | --- | --- | --- | --- | --- | --- | --- |']
    for r in reports:
        best = r['best_validation_candidate']
        lines.append(f"| {r['symbol']} | {best} | {r['validation'][best]['return_rmse']:.6f} | {r['validation']['no_change']['return_rmse']:.6f} | {r['walk_forward_wins']}/4 | {r['selected']} | {r['test'][r['selected']]['price_rmse_usdt']:.2f} | {r['deployment_status']} |")
    lines += ['', 'The final chronological test is evaluated only for the selected approach and the no-change baseline. No forecast is deployed. Full metrics, split boundaries, seeds, archive hashes and environment versions are in latest.json.', '', 'Candidate selection requires 2% validation return-RMSE improvement and at least 3 of 4 walk-forward wins. An eligible candidate still requires manual held-out review. No simulated trading returns are claimed.', '']
    (ROOT / 'reports/RESULTS.md').write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
