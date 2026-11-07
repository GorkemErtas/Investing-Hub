"""Reproducible candidates; historical selection never activates a model."""
from __future__ import annotations

import platform

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from artifact import export_model, predict as numeric_predict
from common import DAY_MS, ROOT, canonical, day, digest, latest_open
from features import FEATURES, FEATURE_VERSION, prepare
from calibration import fit_interval


def metrics(target, predicted, close):
    target, predicted, close = (np.asarray(v, dtype=float) for v in (target, predicted, close))
    return {'return_mae': float(mean_absolute_error(target, predicted)),
            'return_rmse': float(np.sqrt(mean_squared_error(target, predicted))),
            'price_mae_usdt': float(mean_absolute_error(close * (1 + target), close * (1 + predicted))),
            'price_rmse_usdt': float(np.sqrt(mean_squared_error(close * (1 + target), close * (1 + predicted)))),
            'directional_accuracy': float(np.mean(np.sign(target) == np.sign(predicted))),
            'samples': len(target)}


def candidates(seed):
    return {'ridge': make_pipeline(StandardScaler(), Ridge(alpha=100.0)),
            'random_forest': make_pipeline(RandomForestRegressor(n_estimators=200, max_depth=4,
                 min_samples_leaf=20, random_state=seed, n_jobs=1)),
            'gradient_boosting': make_pipeline(GradientBoostingRegressor(n_estimators=100, max_depth=2,
                 min_samples_leaf=20, learning_rate=0.03, random_state=seed))}


def training_slice(data, evaluation_start, days, mode, anchor, minimum):
    # Strict target-time purging handles gaps and generalized horizon boundaries.
    result = data.loc[data.target_time < evaluation_start]
    if days is not None:
        lower = (evaluation_start if mode == 'rolling' else anchor) - days * DAY_MS
        result = result.loc[result.source_time >= lower]
    if len(result) < minimum:
        raise ValueError('Insufficient observations in requested training window')
    if result.target_time.max() >= evaluation_start:
        raise ValueError('Overlapping training targets and evaluation features')
    return result


def evaluation_splits(data, config):
    """Shared chronological origin plan for regression and research classifiers."""
    splitter = TimeSeriesSplit(n_splits=config['walk_forward_splits'], gap=1,
                              test_size=config['fold_days'] + 1)
    splits = list(splitter.split(data))
    anchor = int(data.iloc[splits[0][1][0]].source_time)
    return splits, anchor


def walk_forward(data, config, algorithm, days):
    splits, anchor = evaluation_splits(data, config)
    folds, residuals = [], []
    for number, (_, validation_idx) in enumerate(splits):
        # Reserve one feature origin between evaluation blocks as well, so
        # development labels cannot touch the first selection feature origin.
        validation = data.iloc[validation_idx[:-1]]
        evaluation_start = int(validation.source_time.iloc[0])
        training = training_slice(data, evaluation_start, days, config['window_mode'],
                                  anchor, config['min_train_samples'])
        model = candidates(config['seed'])[algorithm]
        model.fit(training[FEATURES], training.target)
        prediction = model.predict(validation[FEATURES])
        score = metrics(validation.target, prediction, validation.close)
        baseline = metrics(validation.target, np.zeros(len(validation)), validation.close)
        fold = {'fold': number + 1, 'role': 'selection' if number == len(splits) - 1 else 'development',
                      'train_samples': len(training), 'train_source_start': int(training.source_time.min()),
                      'train_target_end': int(training.target_time.max()),
                      'evaluation_source_start': evaluation_start,
                      'evaluation_target_end': int(validation.target_time.max()),
                      'metrics': score, 'no_change': baseline,
                      'historical_mean': metrics(validation.target,
                           np.full(len(validation), training.target.mean()), validation.close)}
        if number < len(splits) - 1:
            residuals.extend((validation.target.to_numpy() - prediction).tolist())
        else:
            fold['interval_calibration'] = fit_interval(residuals,
                folds[-1]['evaluation_target_end'], evaluation_start,
                validation.target.to_numpy(), prediction, int(validation.target_time.max()) + 1)
        folds.append(fold)
    return folds, anchor


def training_code_hash():
    return digest(b''.join((ROOT / name).read_bytes() for name in
                          ('train.py', 'features.py', 'artifact.py', 'common.py', 'calibration.py', 'anomaly_reviews.py', 'reviews/historical_price_movements.json')) +
                  (ROOT.parent / 'shared' / 'contracts.ts').read_bytes())


def train_models(store, symbol, config, now):
    frame, dataset, quality = store.verified_frame(symbol, now)
    if quality['missing_days']:
        raise ValueError('Repair dataset gaps before training')
    if int(frame.open_time.max()) != latest_open(now):
        raise ValueError('Sync latest completed data before training')
    data, _ = prepare(frame, config['max_absolute_daily_return'], now, symbol=symbol, sources=store.candle_sources(symbol))
    development = data.loc[data.target_time < day(config['development_end_exclusive'])]
    code_hash = training_code_hash()
    config_hash = digest(canonical(config).encode())
    results = []
    for years in config['training_years']:
        days = None if years is None else int(years * 365.25)
        window = 'full' if years is None else f'{years}y'
        for algorithm in candidates(config['seed']):
            identity = {'symbol': symbol, 'algorithm': algorithm, 'window': window,
                        'dataset': dataset['fingerprint'], 'config': config_hash, 'code': code_hash,
                        'environment': {'python': platform.python_version(), 'numpy': np.__version__,
                                        'pandas': pd.__version__, 'sklearn': sklearn.__version__}}
            model_id = f'{symbol}-{algorithm}-{window}-{digest(canonical(identity).encode())[:20]}'
            existing = store.db.execute('SELECT id FROM models WHERE id=?', (model_id,)).fetchone()
            if existing:
                store.model(model_id)
                results.append({'model_id': model_id, 'result': 'already_registered'})
                continue
            folds, anchor = walk_forward(development, config, algorithm, days)
            final_training = training_slice(data, int(frame.close_time.max()) + 1,
                       days, config['window_mode'], anchor, config['min_train_samples'])
            model = candidates(config['seed'])[algorithm]
            model.fit(final_training[FEATURES], final_training.target)
            artifact = export_model(model, algorithm)
            parity_x = data[FEATURES].iloc[-100:]
            delta = float(np.max(np.abs(model.predict(parity_x) - numeric_predict(artifact, parity_x))))
            if delta > 1e-12:
                raise ValueError('Numeric artifact inference parity failed')
            artifact_text = canonical(artifact)
            parameters = {k: v for k, v in model.get_params().items()
                          if v is None or isinstance(v, (str, int, float, bool))}
            wins = sum(f['metrics']['return_rmse'] < f['no_change']['return_rmse'] for f in folds)
            selection = folds[-1]
            historical_pass = (selection['metrics']['return_rmse'] < selection['no_change']['return_rmse'] *
                               (1 - config['required_relative_rmse_improvement']) and
                               wins >= config['minimum_fold_wins'])
            report = {**identity, 'model_id': model_id, 'version': model_id,
                      'trained_at': now, 'dataset_fingerprint': dataset['fingerprint'],
                      'dataset_version': dataset, 'quality': quality, 'config': config,
                      'feature_version': FEATURE_VERSION, 'feature_order': FEATURES,
                      'training_range': {'source_start': int(final_training.source_time.min()),
                                         'source_end': int(final_training.source_time.max()),
                                         'target_end': int(final_training.target_time.max()),
                                         'samples': len(final_training)},
                      'window_days': days, 'window_mode': 'expanding' if days is None else config['window_mode'],
                      'hyperparameters': parameters, 'walk_forward': folds,
                      'interval_calibration': folds[-1]['interval_calibration'],
                      'validation_metrics': selection['metrics'], 'baseline_metrics': selection['no_change'],
                      'walk_forward_wins': wins, 'historical_pass': historical_pass,
                      'parity_max_absolute_error': delta, 'artifact_checksum': digest(artifact_text.encode()),
                      'evaluation_policy': 'Historical development/selection only; no untouched historical test. '
                                           'Promotion additionally requires prospective shadow observations.'}
            store.db.execute('INSERT INTO models VALUES(?,?,?,?,?,?)',
                             (model_id, symbol, 'candidate', canonical(report), artifact_text, digest(artifact_text.encode())))
            store.event('trained', {'model_id': model_id, 'historical_pass': historical_pass}, now)
            results.append({'model_id': model_id, 'historical_pass': historical_pass, 'result': 'candidate'})
    return results


if __name__ == '__main__':
    import sys
    from pipeline import main
    sys.exit(main(['train', *sys.argv[1:]]))
