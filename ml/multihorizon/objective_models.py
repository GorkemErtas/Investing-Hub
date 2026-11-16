"""Fitted objective models; portable artifacts reuse the existing numeric tree/LSTM kernel."""
import json
import numpy as np
from scipy.special import softmax, expit
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from .models import flatten_tree, numeric_predict
from .objective_features import OBJECTIVE_FEATURE_VERSION
from .objective_statistics import probabilities, apply_temperature


class DirectionLSTM:
    def __init__(self, classes, epochs=5):
        self.classes_, self.epochs = np.arange(classes), epochs

    def fit(self, x, y):
        import torch
        torch.set_num_threads(1)
        torch.manual_seed(42)
        torch.use_deterministic_algorithms(True)
        self.mean, self.scale = x.mean(axis=(0, 1)), np.maximum(x.std(axis=(0, 1)), 1e-8)
        self.rnn = torch.nn.LSTM(x.shape[-1], 8, batch_first=True)
        self.head = torch.nn.Linear(8, len(self.classes_))
        optimizer = torch.optim.Adam(list(self.rnn.parameters())+list(self.head.parameters()), lr=.003, weight_decay=.001)
        inputs = torch.tensor((x-self.mean)/self.scale, dtype=torch.float32)
        labels = torch.tensor(y, dtype=torch.long)
        for _ in range(self.epochs):
            for start in range(0, len(x), 256):
                optimizer.zero_grad()
                hidden, _ = self.rnn(inputs[start:start+256])
                loss = torch.nn.functional.cross_entropy(self.head(hidden[:, -1]), labels[start:start+256])
                loss.backward()
                torch.nn.utils.clip_grad_norm_(list(self.rnn.parameters())+list(self.head.parameters()), 1.)
                optimizer.step()
        return self

    def predict_proba(self, x):
        import torch
        values = []
        self.rnn.eval()
        self.head.eval()
        with torch.no_grad():
            for start in range(0, len(x), 512):
                hidden, _ = self.rnn(torch.tensor((x[start:start+512]-self.mean)/self.scale, dtype=torch.float32))
                values.append(torch.softmax(self.head(hidden[:, -1]), dim=1).numpy())
        return np.concatenate(values)


def direction_model(trial, classes):
    algorithm = trial['algorithm']
    if algorithm == 'logistic':
        return make_pipeline(StandardScaler(), LogisticRegression(C=trial.get('C', .1), max_iter=250, random_state=42))
    if algorithm == 'random_forest':
        from sklearn.ensemble import RandomForestClassifier
        return RandomForestClassifier(n_estimators=trial.get('trees', 32), max_depth=trial.get('depth', 5),
            max_features=.5, min_samples_leaf=100, n_jobs=1, random_state=42)
    if algorithm == 'lightgbm':
        from lightgbm import LGBMClassifier
        return LGBMClassifier(n_estimators=trial.get('trees', 80), num_leaves=trial.get('leaves', 7),
            min_child_samples=200, reg_lambda=trial.get('l2', 10), learning_rate=.04,
            n_jobs=1, deterministic=True, force_col_wise=True, verbosity=-1, random_state=42)
    if algorithm == 'xgboost':
        from xgboost import XGBClassifier
        return XGBClassifier(n_estimators=trial.get('trees', 80), max_depth=trial.get('depth', 3),
            min_child_weight=80, reg_lambda=trial.get('l2', 10), learning_rate=.04, n_jobs=1,
            tree_method='hist', objective='multi:softprob', num_class=classes, random_state=42)
    if algorithm == 'lstm':
        return DirectionLSTM(classes, trial.get('epochs', 5))
    raise ValueError('unsupported_direction_model')


def tree_cores(model, algorithm, columns, classes=1):
    def core(trees, bias=0., weight=1.):
        return {'schema': OBJECTIVE_FEATURE_VERSION, 'features': list(columns), 'algorithm': algorithm,
                'trees': trees, 'bias': float(bias), 'weight': float(weight)}
    if algorithm == 'random_forest':
        result = []
        for label in range(classes):
            trees = []
            for estimator in model.estimators_:
                t = estimator.tree_
                trees.append([[int(t.feature[i]), float(t.threshold[i]), int(t.children_left[i]),
                    int(t.children_right[i]), float(t.value[i, 0, label]), False] for i in range(t.node_count)])
            result.append(core(trees, weight=1/len(trees)))
        return result
    if algorithm == 'lightgbm':
        dump = model.booster_.dump_model()
        trees = [flatten_tree(t['tree_structure'], algorithm) for t in dump['tree_info']]
        count = dump['num_tree_per_iteration']
        if classes == 2 and count == 1:
            return [core([], 0), core(trees)]
        return [core(trees[label::count]) for label in range(count)]
    if algorithm == 'xgboost':
        trees = [flatten_tree(json.loads(t), algorithm) for t in model.get_booster().get_dump(dump_format='json')]
        return [core(trees[label::classes]) for label in range(classes)]
    raise ValueError('unsupported_numeric_tree_family')


def core_predict(core, x):
    return numeric_predict(core, x, expected_features=core['features'], expected_schema=OBJECTIVE_FEATURE_VERSION)


def export_direction(model, trial, columns, parity_x, temperature):
    name = trial['algorithm']
    classes = len(model.classes_)
    if not np.array_equal(model.classes_, np.arange(classes)):
        raise ValueError('missing_training_direction_class')
    result = {'schema': OBJECTIVE_FEATURE_VERSION, 'objective': 'direction', 'algorithm': name,
              'features': list(columns), 'classes': classes, 'temperature': temperature}
    if name == 'logistic':
        scaler, logistic = model.steps[0][1], model.steps[1][1]
        result.update(mean=scaler.mean_.tolist(), scale=scaler.scale_.tolist(),
                      coef=logistic.coef_.tolist(), bias=logistic.intercept_.tolist())
    elif name == 'lstm':
        weights = {k: v.detach().numpy().tolist() for k, v in model.rnn.state_dict().items()}
        head = {k: v.detach().numpy().tolist() for k, v in model.head.state_dict().items()}
        result['cores'] = [{'schema': OBJECTIVE_FEATURE_VERSION, 'features': list(columns), 'algorithm': 'lstm',
            'mean': model.mean.tolist(), 'scale': model.scale.tolist(), 'rnn': weights,
            'head': {'weight': [head['weight'][i]], 'bias': [head['bias'][i]]}, 'yMean': 0., 'yScale': 1.}
            for i in range(classes)]
    else:
        result['cores'] = tree_cores(model, name, columns, classes)
        if name == 'xgboost':
            from xgboost import DMatrix
            margins = model.get_booster().predict(DMatrix(parity_x[:1]), output_margin=True).reshape(1, classes)
            for i, core in enumerate(result['cores']):
                core['bias'] = float(margins[0, i]-core_predict(core, parity_x[:1])[0])
    expected = apply_temperature(model.predict_proba(parity_x), temperature)
    delta = float(np.max(np.abs(expected-predict_direction(result, parity_x))))
    if delta > 2e-6 or not np.isfinite(delta):
        raise ValueError(f'objective_direction_parity_failed: {name}: {delta}')
    result['parityMaxAbsoluteError'] = delta
    return result


def predict_direction(artifact, x):
    if artifact['schema'] != OBJECTIVE_FEATURE_VERSION or artifact['objective'] != 'direction':
        raise ValueError('direction_artifact_schema')
    if artifact['algorithm'] == 'logistic':
        scores = ((x-np.asarray(artifact['mean']))/np.asarray(artifact['scale'])) @ np.asarray(artifact['coef']).T+artifact['bias']
        raw = np.c_[1-expit(scores[:, 0]), expit(scores[:, 0])] if artifact['classes'] == 2 else softmax(scores, axis=1)
    else:
        scores = np.column_stack([core_predict(c, x) for c in artifact['cores']])
        raw = probabilities(scores) if artifact['algorithm'] == 'random_forest' else softmax(scores, axis=1)
    return apply_temperature(raw, artifact['temperature'])


def volatility_model(trial):
    if trial['algorithm'] == 'har_rv':
        return make_pipeline(StandardScaler(), Ridge(alpha=trial.get('alpha', 100)))
    if trial['algorithm'] == 'lightgbm':
        from lightgbm import LGBMRegressor
        return LGBMRegressor(n_estimators=trial.get('trees', 80), num_leaves=trial.get('leaves', 7),
            min_child_samples=200, reg_lambda=trial.get('l2', 10), learning_rate=.04,
            n_jobs=1, deterministic=True, force_col_wise=True, verbosity=-1, random_state=42)
    if trial['algorithm'] == 'xgboost':
        from xgboost import XGBRegressor
        return XGBRegressor(n_estimators=trial.get('trees', 80), max_depth=trial.get('depth', 3),
            min_child_weight=80, reg_lambda=trial.get('l2', 10), learning_rate=.04, n_jobs=1, tree_method='hist', random_state=42)
    raise ValueError('unsupported_volatility_model')


def fit_volatility(trial, x, y):
    log_y = np.log(np.maximum(y, 1e-12))
    model = volatility_model(trial).fit(x, log_y)
    smear = float(np.mean(np.exp(np.clip(log_y-model.predict(x), -20, 20))))
    return model, smear


def predict_volatility_model(model, smear, x):
    return np.maximum(np.exp(np.clip(model.predict(x), -30, 5))*smear, 1e-12)


def export_volatility(model, trial, columns, parity_x, smear):
    algorithm = trial['algorithm']
    if algorithm == 'har_rv':
        scaler, ridge = model.steps[0][1], model.steps[1][1]
        core = {'schema': OBJECTIVE_FEATURE_VERSION, 'features': list(columns), 'algorithm': 'ridge',
            'mean': scaler.mean_.tolist(), 'scale': scaler.scale_.tolist(), 'coef': ridge.coef_.tolist(), 'bias': float(ridge.intercept_)}
    else:
        core = tree_cores(model, algorithm, columns)[0]
        if algorithm == 'xgboost':
            core['bias'] = float(model.predict(parity_x[:1])[0]-core_predict(core, parity_x[:1])[0])
    result = {'schema': OBJECTIVE_FEATURE_VERSION, 'objective': 'volatility', 'algorithm': algorithm,
              'features': list(columns), 'core': core, 'smear': smear}
    delta = float(np.max(np.abs(predict_volatility(result, parity_x)-predict_volatility_model(model, smear, parity_x))))
    if delta > 1e-7 or not np.isfinite(delta):
        raise ValueError(f'objective_volatility_parity_failed: {delta}')
    result['parityMaxAbsoluteError'] = delta
    return result


def predict_volatility(artifact, x):
    if artifact['schema'] != OBJECTIVE_FEATURE_VERSION or artifact['objective'] != 'volatility':
        raise ValueError('volatility_artifact_schema')
    return np.maximum(np.exp(np.clip(core_predict(artifact['core'], x), -30, 5))*artifact['smear'], 1e-12)


def garch_forecasts(minute_returns, train, origins, horizon, max_iterations=100):
    from arch import arch_model
    from scipy.signal import lfilter
    returns = np.asarray(minute_returns, dtype=float)*100
    fit_indices = np.arange(max(1, train[-1]-9999), train[-1]+1)
    result = arch_model(returns[fit_indices], mean='Zero', vol='GARCH', p=1, q=1,
                        rescale=False).fit(disp='off', show_warning=False, options={'maxiter': max_iterations})
    if result.convergence_flag != 0:
        raise ValueError('garch_nonconvergence')
    omega, alpha, beta = [float(result.params[k]) for k in ('omega', 'alpha[1]', 'beta[1]')]
    start, stop = train[-1]+1, int(np.max(origins))+1
    previous_variance = float(np.asarray(result.conditional_volatility)[-1]**2)
    conditional, _ = lfilter([1.], [1., -beta], omega+alpha*returns[start-1:stop-1]**2,
                            zi=[beta*previous_variance])
    next_variance = omega+alpha*returns[start:stop]**2+beta*conditional
    selected = next_variance[np.asarray(origins)-start]
    total, step = np.zeros(len(selected)), selected.copy()
    for _ in range(horizon):
        total += step
        step = omega+(alpha+beta)*step
    return np.maximum(total/10000, 1e-12), {'omega': omega, 'alpha': alpha, 'beta': beta,
        'fitMinuteRows': len(fit_indices), 'runtimeRestriction': 'needs verified ongoing variance state; research-only'}
