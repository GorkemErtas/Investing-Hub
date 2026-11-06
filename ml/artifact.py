"""Data-only inference artifacts: no pickle, joblib, imports or executable code.

Only the three fixed sklearn candidates can be exported. Tree traversal and
linear inference operate on bounded, validated numeric JSON arrays.
"""
from __future__ import annotations

import json

import numpy as np

from features import FEATURES, FEATURE_VERSION


def export_tree(tree):
    t = tree.tree_
    return {'left': t.children_left.tolist(), 'right': t.children_right.tolist(),
            'feature': t.feature.tolist(), 'threshold': t.threshold.tolist(),
            'value': t.value[:, 0, 0].tolist()}


def export_model(pipeline, algorithm: str) -> dict:
    estimator = pipeline.steps[-1][1]
    artifact = {'format': 'numeric-sklearn-v1', 'feature_version': FEATURE_VERSION,
                'features': FEATURES, 'algorithm': algorithm}
    if algorithm == 'ridge':
        scaler = pipeline.steps[0][1]
        artifact.update({'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist(),
                         'coef': estimator.coef_.tolist(), 'intercept': float(estimator.intercept_)})
    elif algorithm == 'random_forest':
        artifact['trees'] = [export_tree(t) for t in estimator.estimators_]
    elif algorithm == 'gradient_boosting':
        artifact.update({'trees': [export_tree(t) for t in estimator.estimators_[:, 0]],
                         'initial': float(estimator.init_.constant_[0, 0]),
                         'learning_rate': float(estimator.learning_rate)})
    else:
        raise ValueError('Unsupported algorithm')
    return artifact


def vector(value, size):
    result = np.asarray(value, dtype=float)
    if result.shape != (size,) or not np.isfinite(result).all():
        raise ValueError('Invalid numeric artifact vector')
    return result


def tree_predict(tree, x):
    size = len(tree['left'])
    if not 1 <= size <= 100_000:
        raise ValueError('Invalid tree size')
    left, right, feature = (vector(tree[key], size) for key in ('left', 'right', 'feature'))
    threshold, value = (vector(tree[key], size) for key in ('threshold', 'value'))
    if any((v % 1 != 0).any() for v in (left, right, feature)):
        raise ValueError('Tree indices must be integral')
    left, right, feature = (v.astype(int) for v in (left, right, feature))
    leaf = left == -1
    branch = ~leaf
    if (right[leaf] != -1).any() or ((left[branch] <= np.flatnonzero(branch)) |
            (right[branch] <= np.flatnonzero(branch)) | (left[branch] >= size) |
            (right[branch] >= size)).any():
        raise ValueError('Invalid or cyclic tree links')
    if ((feature[branch] < 0) | (feature[branch] >= len(FEATURES))).any():
        raise ValueError('Invalid tree feature')
    indices = np.zeros(len(x), dtype=int)
    # sklearn trees compare against float32 inputs, including threshold ties.
    inputs = x.astype(np.float32)
    for _ in range(size):
        active = np.flatnonzero(left[indices] != -1)
        if not len(active):
            return value[indices]
        nodes = indices[active]
        indices[active] = np.where(inputs[active, feature[nodes]] <= threshold[nodes],
                                   left[nodes], right[nodes])
    raise ValueError('Tree traversal did not terminate')


def predict(artifact: dict | str, x) -> np.ndarray:
    if isinstance(artifact, str):
        if len(artifact) > 32 * 1024 * 1024:
            raise ValueError('Oversized numeric artifact')
        artifact = json.loads(artifact)
    if (artifact['format'] != 'numeric-sklearn-v1' or artifact['features'] != FEATURES or
            artifact['feature_version'] != FEATURE_VERSION):
        raise ValueError('Feature/artifact contract mismatch')
    x = np.asarray(x, dtype=float)
    if x.ndim != 2 or x.shape[1] != len(FEATURES) or not np.isfinite(x).all():
        raise ValueError('Invalid inference features')
    algorithm = artifact['algorithm']
    if algorithm == 'ridge':
        mean, scale, coef = (vector(artifact[key], len(FEATURES)) for key in ('mean', 'scale', 'coef'))
        if (scale <= 0).any():
            raise ValueError('Invalid scaler')
        result = ((x - mean) / scale) @ coef + float(artifact['intercept'])
    elif algorithm in ('random_forest', 'gradient_boosting'):
        trees = artifact['trees']
        if not 1 <= len(trees) <= 2000:
            raise ValueError('Invalid tree count')
        total = sum(tree_predict(t, x) for t in trees)
        result = (total / len(trees) if algorithm == 'random_forest' else
                  float(artifact['initial']) + float(artifact['learning_rate']) * total)
    else:
        raise ValueError('Unsupported numeric model')
    if not np.isfinite(result).all():
        raise ValueError('Nonfinite model output')
    return result
