"""Independent research labels and models; reuse the lifecycle's features/folds."""
import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (accuracy_score, balanced_accuracy_score, confusion_matrix,
    precision_score, recall_score, f1_score, roc_auc_score, average_precision_score, brier_score_loss)
from common import canonical, digest
from features import FEATURES
from train import evaluation_splits, training_slice
from .statistics import stamp


def classification_metrics(y, probabilities, threshold=.5):
    y, probabilities = np.asarray(y, int), np.asarray(probabilities, float)
    if not len(y) or len(y) != len(probabilities) or not np.isin(y, [0, 1]).all() or not np.isfinite(probabilities).all() or ((probabilities < 0) | (probabilities > 1)).any():
        raise ValueError('Invalid binary evaluation inputs')
    predicted = probabilities >= threshold
    tn, fp, fn, tp = confusion_matrix(y, predicted, labels=[0, 1]).ravel()
    both = len(np.unique(y)) == 2
    return {'samples': len(y), 'positives': int(y.sum()), 'prevalence': float(y.mean()),
        'accuracy': float(accuracy_score(y, predicted)), 'balancedAccuracy': float(balanced_accuracy_score(y, predicted)) if both else None,
        'precision': float(precision_score(y, predicted, zero_division=0)), 'recall': float(recall_score(y, predicted, zero_division=0)),
        'f1': float(f1_score(y, predicted, zero_division=0)), 'rocAuc': float(roc_auc_score(y, probabilities)) if both else None,
        'averagePrecision': float(average_precision_score(y, probabilities)) if both else None,
        'brier': float(brier_score_loss(y, probabilities)), 'falsePositiveRate': float(fp / (fp + tn)) if fp + tn else None,
        'confusion': [int(tn), int(fp), int(fn), int(tp)]}


def tune_threshold(y, probabilities):
    # Validation only; ties choose the higher threshold to reduce alert volume.
    if len(np.unique(y)) < 2:
        return .5, 'single_class_validation_default'
    threshold = max((float(t) for t in np.arange(.1, .91, .1)), key=lambda t: (f1_score(y, probabilities >= t, zero_division=0), t))
    return threshold, 'validation_f1'


def probability(model, x):
    values = model.predict_proba(x)
    classes = list(model.classes_)
    return values[:, classes.index(1)] if 1 in classes else np.zeros(len(x))


def research(data, cfg, fingerprint, code_hash):
    if len(data) < 500:
        return []
    splits, anchor = evaluation_splits(data, cfg)
    rows = []
    for number, (_, indices) in enumerate(splits):
        evaluation = data.iloc[indices[:-1]]
        training = training_slice(data, int(evaluation.source_time.min()), None, 'expanding', anchor, cfg['min_train_samples'])
        validation = training.iloc[-cfg['threshold_days']:]
        core = training.loc[training.target_time < validation.source_time.min()]
        if len(core) < cfg['min_train_samples']:
            continue
        event_threshold = float(np.quantile(np.abs(core.target), cfg['event_quantile']))
        for task in ('direction', 'extreme_event'):
            label = (lambda frame: (frame.target > 0).astype(int)) if task == 'direction' else (lambda frame: (frame.target.abs() > event_threshold).astype(int))
            y, y_val, y_eval = label(core), label(validation), label(evaluation)
            factories = {'majority_baseline': lambda: DummyClassifier(strategy='prior'),
                'logistic': lambda: make_pipeline(StandardScaler(), LogisticRegression(C=1., max_iter=500, random_state=cfg['seed'])),
                'random_forest': lambda: RandomForestClassifier(n_estimators=100, max_depth=4, min_samples_leaf=10, random_state=cfg['seed'], n_jobs=1),
                'gradient_boosting': lambda: GradientBoostingClassifier(n_estimators=60, max_depth=2, min_samples_leaf=10, random_state=cfg['seed'])}
            if task == 'extreme_event':
                factories = {k: v for k, v in factories.items() if k != 'gradient_boosting'}
                factories['logistic_balanced'] = lambda: make_pipeline(StandardScaler(), LogisticRegression(C=1., class_weight='balanced', max_iter=500, random_state=cfg['seed']))
                factories['forest_balanced'] = lambda: RandomForestClassifier(n_estimators=100, max_depth=4, min_samples_leaf=10, class_weight='balanced_subsample', random_state=cfg['seed'], n_jobs=1)
            factories['naive_current_move'] = None
            for name, factory in factories.items():
                row = {'task': task, 'model': name, 'fold': number + 1, 'phase': 'historical_development',
                    'version': digest(canonical([task, name, number, cfg, fingerprint, code_hash]).encode()),
                    'datasetFingerprint': fingerprint, 'trainStart': stamp(core.source_time.min()),
                    'trainEnd': stamp(core.target_time.max()), 'validationStart': stamp(validation.source_time.min()),
                    'validationEnd': stamp(validation.target_time.max()), 'evaluationStart': stamp(evaluation.source_time.min()),
                    'evaluationEnd': stamp(evaluation.target_time.max()), 'eventThreshold': event_threshold if task == 'extreme_event' else 0.,
                    'trainingPrevalence': float(y.mean()), 'threshold': .5, 'thresholdPolicy': 'fixed', 'status': 'available', 'metrics': None}
                if factory is None:
                    probabilities = (evaluation.return_1 > 0).astype(float).to_numpy() if task == 'direction' else (evaluation.return_1.abs() > event_threshold).astype(float).to_numpy()
                elif y.nunique() < 2 and name != 'majority_baseline':
                    row['status'] = 'single_class_training'
                    rows.append(row)
                    continue
                else:
                    model = factory()
                    # Freeze this fit before threshold validation; do not refit on
                    # validation and then pretend the tuned threshold is independent.
                    model.fit(core[FEATURES], y)
                    if task == 'extreme_event' and name != 'majority_baseline':
                        row['threshold'], row['thresholdPolicy'] = tune_threshold(y_val, probability(model, validation[FEATURES]))
                    probabilities = probability(model, evaluation[FEATURES])
                row['metrics'] = classification_metrics(y_eval, probabilities, row['threshold'])
                rows.append(row)
    return rows
