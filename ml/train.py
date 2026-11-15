"""Comparable chronological selection and separate final evaluation; no quality gates."""
from __future__ import annotations
import platform
import numpy as np
import pandas as pd
import sklearn
import torch
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from artifact import export_model, predict as numeric_predict
from common import ROOT, canonical, digest, latest_open
from features import FEATURES, FEATURE_VERSION, prepare
from lstm import LSTMRegressor
from evaluation import metrics
from selection import PIPELINE_VERSION, ALGORITHMS


def candidates(seed):
    return {'ridge': make_pipeline(StandardScaler(), Ridge(alpha=100.0)),
            'random_forest': make_pipeline(RandomForestRegressor(n_estimators=100, max_depth=4,
                 min_samples_leaf=20, random_state=seed, n_jobs=1)),
            'gradient_boosting': make_pipeline(GradientBoostingRegressor(n_estimators=60, max_depth=2,
                 min_samples_leaf=20, learning_rate=0.03, random_state=seed))}


def training_code_hash():
    names = ('train.py', 'lstm.py', 'lstm_inference.py', 'selection.py', 'evaluation.py',
             'features.py', 'artifact.py', 'common.py',
             'anomaly_reviews.py', 'reviews/historical_price_movements.json')
    return digest(b''.join((ROOT/name).read_bytes() for name in names))


def sequence_data(data, lookback):
    values = data[FEATURES].to_numpy(dtype=float)
    sequences = np.lib.stride_tricks.sliding_window_view(values, lookback, axis=0).transpose(0, 2, 1).copy()
    return data.iloc[lookback-1:].reset_index(drop=True), sequences


def evaluation_plan(data, config):
    holdout_start = len(data)-config['holdout_days']
    selection = data.iloc[:holdout_start-1]
    splitter = TimeSeriesSplit(n_splits=config['walk_forward_splits'], gap=1,
                              test_size=config['fold_days'] + 1)
    plan = []
    for _, indices in splitter.split(selection):
        evaluation = indices[:-1]
        training = np.flatnonzero(data.target_time.to_numpy() < data.source_time.iloc[evaluation[0]])
        plan.append(('selection', training, evaluation))
    evaluation = np.arange(holdout_start, len(data))
    training = np.flatnonzero(data.target_time.to_numpy() < data.source_time.iloc[evaluation[0]])
    plan.append(('final_evaluation', training, evaluation))
    for _, training, evaluation in plan:
        if len(training) < config['min_train_samples'] or data.target_time.iloc[training].max() >= data.source_time.iloc[evaluation].min():
            raise ValueError('Insufficient or overlapping chronological training/evaluation')
    return plan


def fit_candidate(algorithm, x, y, config):
    model = (LSTMRegressor(config['seed'], config['lstm_hidden'], config['lstm_epochs'],
              config['lstm_batch_size'], config['lstm_learning_rate']) if algorithm == 'lstm'
             else candidates(config['seed'])[algorithm])
    return model.fit(x, y)


def train_models(store, symbol, config, now):
    frame, dataset, quality = store.verified_frame(symbol, now)
    if quality['missing_days'] or int(frame.open_time.max()) != latest_open(now):
        raise ValueError('Sync current gap-free data before training')
    data, _ = prepare(frame, config['max_absolute_daily_return'], now, symbol=symbol, sources=store.candle_sources(symbol))
    data, sequences = sequence_data(data, config['lookback'])
    plan = evaluation_plan(data, config)
    environment = {'python': platform.python_version(), 'numpy': np.__version__,
                   'pandas': pd.__version__, 'sklearn': sklearn.__version__, 'torch': torch.__version__}
    comparison = {'pipeline_version': PIPELINE_VERSION, 'symbol': symbol,
        'dataset': dataset['fingerprint'], 'config': config, 'code': training_code_hash(), 'environment': environment}
    comparison_id = digest(canonical(comparison).encode())
    output = []
    for algorithm in ALGORITHMS:
        model_id = f'{symbol}-{algorithm}-{comparison_id[:20]}'
        if store.db.execute('SELECT 1 FROM models WHERE id=?', (model_id,)).fetchone():
            store.model(model_id)
            output.append({'model_id': model_id, 'result': 'already_registered'})
            continue
        x = sequences if algorithm == 'lstm' else data[FEATURES].to_numpy()
        y = data.target.to_numpy()
        folds, selection_actual, selection_predicted, selection_close = [], [], [], []
        final = None
        for number, (role, train, evaluation) in enumerate(plan):
            model = fit_candidate(algorithm, x[train], y[train], config)
            predicted = model.predict(x[evaluation])
            tested = data.iloc[evaluation]
            fold = {'fold': number+1, 'role': role, 'train_samples': len(train),
                'train_source_start': int(data.source_time.iloc[train].min()),
                'train_target_end': int(data.target_time.iloc[train].max()),
                'evaluation_source_start': int(tested.source_time.min()),
                'evaluation_target_end': int(tested.target_time.max()),
                'metrics': metrics(y[evaluation], predicted, tested.close),
                'no_change': metrics(y[evaluation], np.zeros(len(tested)), tested.close)}
            if role == 'selection':
                folds.append(fold)
                selection_actual.extend(y[evaluation]); selection_predicted.extend(predicted); selection_close.extend(tested.close)
            else:
                final = fold
        selection_score = metrics(selection_actual, selection_predicted, selection_close)
        baseline = metrics(selection_actual, np.zeros(len(selection_actual)), selection_close)
        model = fit_candidate(algorithm, x, y, config)
        artifact = model.artifact(FEATURES, FEATURE_VERSION) if algorithm == 'lstm' else export_model(model, algorithm)
        parity_x = x[-100:]
        delta = float(np.max(np.abs(model.predict(parity_x)-numeric_predict(artifact, parity_x))))
        if delta > 1e-12:
            raise ValueError('Numeric artifact inference parity failed')
        artifact_text = canonical(artifact)
        report = {**comparison, 'comparison_id': comparison_id, 'model_id': model_id, 'version': model_id,
            'algorithm': algorithm, 'window': 'full', 'trained_at': now,
            'dataset_fingerprint': dataset['fingerprint'], 'dataset_version': dataset,
            'feature_version': FEATURE_VERSION, 'feature_order': FEATURES, 'quality': quality,
            'training_range': {'source_start': int(data.source_time.min()), 'source_end': int(data.source_time.max()),
                               'target_end': int(data.target_time.max()), 'samples': len(data)},
            'walk_forward': folds, 'validation_metrics': selection_score, 'baseline_metrics': baseline,
            'final_evaluation': final, 'interval_calibration': None,
            'walk_forward_wins': sum(f['metrics']['return_rmse'] < f['no_change']['return_rmse'] for f in folds),
            'parity_max_absolute_error': delta, 'artifact_checksum': digest(artifact_text.encode()),
            'evaluation_policy': 'Selection uses common chronological folds; final period is excluded from ranking. Previously inspected history is not a pristine unseen benchmark.'}
        store.db.execute('INSERT INTO models VALUES(?,?,?,?,?,?)',
            (model_id, symbol, 'candidate', canonical(report), artifact_text, report['artifact_checksum']))
        store.event('trained', {'model_id': model_id, 'comparison_id': comparison_id}, now)
        output.append({'model_id': model_id, 'result': 'trained', 'selection': selection_score, 'final_evaluation': final['metrics']})
    return output
