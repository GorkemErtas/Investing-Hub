"""Comparable chronological selection and separate final evaluation; no quality gates."""
from __future__ import annotations
import platform
import numpy as np
import pandas as pd
import sklearn
import torch
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from artifact import export_model, predict as numeric_predict
from common import DAY_MS, ROOT, canonical, digest, latest_open
from features import FEATURES, FEATURE_VERSION, prepare
from lstm import LSTMRegressor

PIPELINE_VERSION = 'price-predictions-v1'
ALGORITHMS = ('ridge', 'gradient_boosting', 'random_forest', 'lstm')

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
            'random_forest': make_pipeline(RandomForestRegressor(n_estimators=100, max_depth=4,
                 min_samples_leaf=20, random_state=seed, n_jobs=1)),
            'gradient_boosting': make_pipeline(GradientBoostingRegressor(n_estimators=60, max_depth=2,
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



def training_code_hash():
    names = ('train.py', 'lstm.py', 'features.py', 'artifact.py', 'common.py',
             'anomaly_reviews.py', 'reviews/historical_price_movements.json')
    return digest(b''.join((ROOT/name).read_bytes() for name in names))


def sequence_data(data, lookback):
    values = data[FEATURES].to_numpy(dtype=float)
    sequences = np.lib.stride_tricks.sliding_window_view(values, lookback, axis=0).transpose(0, 2, 1).copy()
    return data.iloc[lookback-1:].reset_index(drop=True), sequences


def evaluation_plan(data, config):
    holdout_start = len(data)-config['holdout_days']
    selection = data.iloc[:holdout_start-1]
    splits, _ = evaluation_splits(selection, config)
    plan = []
    for _, indices in splits:
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


def select_best(store, symbol, config, now):
    dataset = store.dataset(symbol)
    models = [store.model(row[0]) for row in store.db.execute('SELECT id FROM models WHERE symbol=?', (symbol,)).fetchall()]
    models = [m for m in models if m['metadata'].get('pipeline_version') == PIPELINE_VERSION and
              m['metadata']['dataset_fingerprint'] == (dataset or {}).get('fingerprint') and m['metadata']['config'] == config]
    if not models:
        raise ValueError('Train current candidates before model selection')
    # Never mix versions, data, environments or evaluation windows.
    newest = max(models, key=lambda m: (m['metadata']['trained_at'], m['metadata']['comparison_id']))['metadata']['comparison_id']
    models = [m for m in models if m['metadata']['comparison_id'] == newest]
    if set(m['metadata']['algorithm'] for m in models) != set(ALGORITHMS):
        raise ValueError('Incomplete comparable candidate set')
    error = min(m['metadata']['validation_metrics']['price_rmse_usdt'] for m in models)
    equivalent = [m for m in models if m['metadata']['validation_metrics']['price_rmse_usdt'] <= error*(1+config['selection_tolerance'])]
    chosen = min(equivalent, key=lambda m: (ALGORITHMS.index(m['metadata']['algorithm']), m['id']))
    store.db.execute("UPDATE models SET status='archived' WHERE symbol=? AND status='active' AND id<>?", (symbol, chosen['id']))
    store.db.execute("UPDATE models SET status='active' WHERE id=?", (chosen['id'],))
    store.event('model_selected', {'symbol': symbol, 'model_id': chosen['id'],
        'rule': 'selection_price_rmse_with_relative_tolerance_then_simplicity_then_id',
        'tolerance': config['selection_tolerance']}, now)
    return {'symbol': symbol, 'model_id': chosen['id'], 'algorithm': chosen['metadata']['algorithm'],
            'selection': chosen['metadata']['validation_metrics'], 'final_evaluation': chosen['metadata']['final_evaluation']['metrics']}


if __name__ == '__main__':
    import sys
    from pipeline import main
    sys.exit(main(['train', *sys.argv[1:]]))
