"""Bounded CPU candidates and portable, data-only numeric inference artifacts."""
from __future__ import annotations
import numpy as np
from .features import FEATURES, FEATURE_VERSION, LOOKBACK

ALGORITHMS = ('naive', 'ridge', 'random_forest', 'hist_gradient_boosting', 'lightgbm', 'xgboost', 'lstm')


class SequenceRegressor:
    def __init__(self, seed=42, epochs=3):
        self.seed, self.epochs = seed, epochs

    def fit(self, x, y):
        import torch
        torch.set_num_threads(1)
        torch.manual_seed(self.seed)
        torch.use_deterministic_algorithms(True)
        self.mean = x.mean(axis=(0, 1))
        self.scale = np.maximum(x.std(axis=(0, 1)), 1e-8)
        self.y_mean, self.y_scale = float(y.mean()), max(float(y.std()), 1e-8)
        self.rnn = torch.nn.LSTM(len(FEATURES), 8, batch_first=True)
        self.head = torch.nn.Linear(8, 1)
        optimizer = torch.optim.Adam(list(self.rnn.parameters())+list(self.head.parameters()), lr=.003)
        inputs = torch.tensor((x-self.mean)/self.scale, dtype=torch.float32)
        labels = torch.tensor((y-self.y_mean)/self.y_scale, dtype=torch.float32)
        for _ in range(self.epochs):
            # Fixed chronological minibatches; no validation/holdout feedback.
            for start in range(0, len(x), 256):
                optimizer.zero_grad()
                output, _ = self.rnn(inputs[start:start+256])
                loss = torch.nn.functional.mse_loss(self.head(output[:, -1]).ravel(), labels[start:start+256])
                loss.backward()
                torch.nn.utils.clip_grad_norm_(list(self.rnn.parameters())+list(self.head.parameters()), 1.)
                optimizer.step()
        return self

    def predict(self, x):
        import torch
        self.rnn.eval()
        self.head.eval()
        output = []
        with torch.no_grad():
            for start in range(0, len(x), 1024):
                data = torch.tensor((x[start:start+1024]-self.mean)/self.scale, dtype=torch.float32)
                hidden, _ = self.rnn(data)
                output.extend((self.head(hidden[:, -1]).ravel().numpy()*self.y_scale+self.y_mean).tolist())
        return np.asarray(output)


def candidate(name, seed=42, epochs=3):
    from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    if name == 'ridge':
        return make_pipeline(StandardScaler(), Ridge(alpha=100.))
    if name == 'random_forest':
        return RandomForestRegressor(n_estimators=32, max_depth=4, min_samples_leaf=80, n_jobs=1, random_state=seed)
    if name == 'hist_gradient_boosting':
        # sklearn's default early stopping uses a random subset; explicitly disabled.
        return HistGradientBoostingRegressor(max_iter=40, max_leaf_nodes=7, max_depth=3,
            min_samples_leaf=80, learning_rate=.04, early_stopping=False, random_state=seed)
    if name == 'lightgbm':
        from lightgbm import LGBMRegressor
        return LGBMRegressor(n_estimators=40, num_leaves=7, max_depth=3, min_child_samples=80,
            learning_rate=.04, n_jobs=1, random_state=seed, deterministic=True, force_col_wise=True, verbosity=-1)
    if name == 'xgboost':
        from xgboost import XGBRegressor
        return XGBRegressor(n_estimators=40, max_depth=3, min_child_weight=80,
            learning_rate=.04, n_jobs=1, random_state=seed, tree_method='hist', objective='reg:squarederror')
    if name == 'lstm':
        return SequenceRegressor(seed, epochs)
    raise ValueError('unsupported_candidate')


def flatten_tree(root, algorithm):
    nodes = []
    def visit(node):
        index = len(nodes)
        nodes.append(None)
        leaf = ('leaf_value' in node) if algorithm == 'lightgbm' else ('leaf' in node)
        if leaf:
            nodes[index] = [-1, 0., -1, -1, float(node.get('leaf_value', node.get('leaf'))), False]
        else:
            if algorithm == 'lightgbm':
                if node['decision_type'] != '<=':
                    raise ValueError('unsupported_tree_split')
                feature, threshold, left, right, strict = node['split_feature'], node['threshold'], node['left_child'], node['right_child'], False
            else:
                feature, threshold, strict = int(node['split'].removeprefix('f')), node['split_condition'], True
                children = {c['nodeid']: c for c in node['children']}
                left, right = children[node['yes']], children[node['no']]
            li, ri = visit(left), visit(right)
            nodes[index] = [int(feature), float(threshold), li, ri, 0., strict]
        return index
    visit(root)
    return nodes


def export_model(model, name, parity_x):
    import json
    result = {'schema': FEATURE_VERSION, 'features': list(FEATURES), 'algorithm': name, 'lookback': LOOKBACK}
    if name == 'ridge':
        scaler, ridge = model.steps[0][1], model.steps[1][1]
        result.update(mean=scaler.mean_.tolist(), scale=scaler.scale_.tolist(), coef=ridge.coef_.tolist(), bias=float(ridge.intercept_))
    elif name == 'lstm':
        result.update(mean=model.mean.tolist(), scale=model.scale.tolist(), yMean=model.y_mean, yScale=model.y_scale,
            rnn={k: v.detach().numpy().tolist() for k, v in model.rnn.state_dict().items()},
            head={k: v.detach().numpy().tolist() for k, v in model.head.state_dict().items()})
    else:
        if name == 'random_forest':
            trees = []
            for estimator in model.estimators_:
                tree = estimator.tree_
                trees.append([[int(tree.feature[i]), float(tree.threshold[i]), int(tree.children_left[i]),
                    int(tree.children_right[i]), float(tree.value[i, 0, 0]), False] for i in range(tree.node_count)])
            weight, bias = 1/len(trees), 0.
        elif name == 'hist_gradient_boosting':
            trees = []
            for stage in model._predictors:
                nodes = stage[0].nodes
                trees.append([[-1 if n['is_leaf'] else int(n['feature_idx']), float(n['num_threshold']),
                    int(n['left']), int(n['right']), float(n['value']), False] for n in nodes])
            weight, bias = 1., float(model._baseline_prediction.ravel()[0])
        elif name == 'lightgbm':
            dump = model.booster_.dump_model()
            trees = [flatten_tree(t['tree_structure'], name) for t in dump['tree_info']]
            weight, bias = 1., 0.
        elif name == 'xgboost':
            trees = [flatten_tree(json.loads(t), name) for t in model.get_booster().get_dump(dump_format='json')]
            weight, bias = 1., 0.
        else:
            raise ValueError('unsupported_artifact')
        result.update(trees=trees, weight=weight, bias=bias)
        if name == 'xgboost':
            # Includes the fitted base score, independent of XGBoost config encoding.
            result['bias'] = float(model.predict(parity_x[:1])[0] - numeric_predict(result, parity_x[:1])[0])
    expected = model.predict(parity_x)
    delta = float(np.max(np.abs(expected-numeric_predict(result, parity_x))))
    if not np.isfinite(delta) or delta > 1e-7:
        raise ValueError(f'artifact_inference_parity_failed: {name}: {delta}')
    result['parityMaxAbsoluteError'] = delta
    return result


def numeric_predict(artifact, x):
    """NumPy only; no pickle, sklearn, boosting libraries or Torch in live inference."""
    if artifact['schema'] != FEATURE_VERSION or artifact['features'] != list(FEATURES):
        raise ValueError('artifact_feature_schema_mismatch')
    x = np.asarray(x, dtype=float)
    name = artifact['algorithm']
    if not np.isfinite(x).all() or x.shape[-1] != len(FEATURES):
        raise ValueError('invalid_inference_features')
    if name == 'ridge':
        return (x-np.asarray(artifact['mean']))/np.asarray(artifact['scale']) @ np.asarray(artifact['coef'])+artifact['bias']
    if name == 'lstm':
        if x.ndim != 3 or x.shape[1] != LOOKBACK:
            raise ValueError('invalid_sequence_shape')
        weights = {k: np.asarray(v) for k, v in artifact['rnn'].items()}
        x = (x-np.asarray(artifact['mean']))/np.asarray(artifact['scale'])
        h, c = np.zeros((len(x), 8)), np.zeros((len(x), 8))
        sigmoid = lambda z: 1/(1+np.exp(-np.clip(z, -500, 500)))
        for step in range(LOOKBACK):
            gates = x[:, step] @ weights['weight_ih_l0'].T+h @ weights['weight_hh_l0'].T+weights['bias_ih_l0']+weights['bias_hh_l0']
            i, f, g, o = np.split(gates, 4, axis=1)
            c = sigmoid(f)*c+sigmoid(i)*np.tanh(g)
            h = sigmoid(o)*np.tanh(c)
        return ((h @ np.asarray(artifact['head']['weight']).T+artifact['head']['bias']).ravel()*artifact['yScale']+artifact['yMean'])
    if x.ndim != 2 or len(artifact['trees']) > 256:
        raise ValueError('invalid_tree_artifact')
    # XGBoost quantizes input and split thresholds to float32 before comparison.
    # Comparing original float64 indicators with rounded JSON thresholds can route
    # exact-boundary rows to a different leaf even though the tree is unchanged.
    if name in ('xgboost', 'random_forest'):
        x = x.astype(np.float32).astype(float)
    result = np.full(len(x), artifact['bias'], dtype=float)
    for tree in artifact['trees']:
        if not 1 <= len(tree) <= 1024:
            raise ValueError('oversized_tree')
        nodes = np.asarray(tree, dtype=float)
        if name == 'xgboost':
            nodes[:, 1] = nodes[:, 1].astype(np.float32).astype(float)
        positions = np.zeros(len(x), dtype=int)
        for _ in range(32):
            current = nodes[positions]
            live = current[:, 0] >= 0
            if not live.any():
                break
            rows = np.flatnonzero(live)
            thresholds = current[live, 1]
            values = x[rows, current[live, 0].astype(int)]
            left = np.where(current[live, 5].astype(bool), values < thresholds, values <= thresholds)
            positions[rows] = np.where(left, current[live, 2], current[live, 3]).astype(int)
        else:
            raise ValueError('cyclic_or_excessively_deep_tree')
        result += artifact['weight']*nodes[positions, 4]
    return result
