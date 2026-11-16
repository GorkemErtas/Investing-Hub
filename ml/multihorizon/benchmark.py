"""Fixed-budget chronological study. Final holdout never participates in selection."""
from __future__ import annotations
import importlib.metadata
import json
import platform
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import psutil
from threadpoolctl import threadpool_limits
from .data import MINUTE, digest, load_symbol, save_json, sha256
from .features import FEATURES, FEATURE_VERSION, HORIZONS, LOOKBACK, prepare, sequences
from .models import ALGORITHMS, candidate, export_model, numeric_predict

DAY = 86_400_000
DEFAULT_CONFIG = {'seed': 42, 'maxTrainRows': 12000, 'maxEvaluationRows': 5000,
    'foldDays': 28, 'folds': 3, 'holdoutDays': 60, 'embargoMinutes': 1, 'lstmEpochs': 3,
    'minimumImprovement': .01, 'equivalenceTolerance': .002, 'threads': 1,
    'costPerTurnover': .0012, 'maxObservedRssMb': 2048}


def plan(data, horizon, config):
    end = int(data.source_time.iloc[-1])+1
    holdout = end-config['holdoutDays']*DAY
    windows = [(holdout-(config['folds']-i)*config['foldDays']*DAY,
                holdout-(config['folds']-i-1)*config['foldDays']*DAY) for i in range(config['folds'])]
    windows.append((holdout, end))
    result = []
    for start, stop in windows:
        test = np.flatnonzero((data.source_time >= start) & (data.source_time < stop))
        # Non-overlapping evaluation labels; all candidates use exactly these origins.
        step = max(HORIZONS[horizon], int(np.ceil(len(test)/config['maxEvaluationRows'])))
        test = test[::step]
        if not len(test):
            raise ValueError('empty_evaluation_window')
        train = np.flatnonzero(data.target_time < data.source_time.iloc[test[0]]-config['embargoMinutes']*MINUTE)
        if len(train) > config['maxTrainRows']:
            train = train[np.linspace(0, len(train)-1, config['maxTrainRows'], dtype=int)]
        if len(train) < 1000 or data.target_time.iloc[train].max() >= data.source_time.iloc[test[0]]:
            raise ValueError('insufficient_or_leaking_training_boundary')
        result.append((train, test))
    return result


def metrics(actual, predicted, prices, *, baseline=None, cost=.0012):
    actual, predicted, prices = map(np.asarray, (actual, predicted, prices))
    if not len(actual) or not np.isfinite(predicted).all() or np.max(np.abs(predicted)) > 2:
        raise ValueError('invalid_model_output')
    error = prices*(np.exp(predicted)-np.exp(actual))
    return_error = predicted-actual
    position = np.sign(predicted)
    turnover = np.abs(np.diff(np.r_[0, position]))
    # Charge final liquidation too; timestamps passed to this metric do not overlap.
    turnover[-1] += abs(position[-1])
    net = position*np.expm1(actual)-cost*turnover
    result = {'priceMae': float(np.mean(np.abs(error))), 'priceRmse': float(np.sqrt(np.mean(error**2))),
        'returnMae': float(np.mean(np.abs(return_error))), 'returnRmse': float(np.sqrt(np.mean(return_error**2))),
        'directionalAccuracy': float(np.mean(np.sign(predicted) == np.sign(actual))),
        'turnover': float(turnover.sum()), 'costPerTurnover': cost,
        'netReturnSum': float(net.sum()), 'netReturnMean': float(net.mean()),
        'netReturnStd': float(net.std()),
        'riskAdjustedMeanOverStd': float(net.mean()/net.std()) if net.std() else None}
    if baseline:
        result['baselineRelativeRmse'] = result['returnRmse']/baseline['returnRmse']
    return result


def select(results, actual, predictions, times, config):
    """No test metrics accepted here. Family-wise conservative daily-block evidence."""
    baseline = results['naive']['validation']['returnRmse']
    eligible = []
    complete = set(results) == set(ALGORITHMS) and all(r.get('status') == 'ok' for r in results.values())
    for name, report in results.items():
        if name == 'naive' or report.get('status') != 'ok':
            continue
        difference = actual**2-(predictions[name]-actual)**2
        grouped = np.unique(times//DAY)
        daily = np.asarray([difference[times//DAY == day].mean() for day in grouped])
        rng = np.random.default_rng(config['seed'])
        bootstrap = daily[rng.integers(0, len(daily), size=(4096, len(daily)))].mean(axis=1)
        # Bonferroni family size: six non-naive families * eight symbols * three horizons.
        lower = float(np.quantile(bootstrap, .05/(6*8*3)))
        improvement = 1-report['validation']['returnRmse']/baseline
        stable = all(f['metrics']['returnRmse'] < f['baseline']['returnRmse'] for f in report['walkForward'])
        report['selectionEvidence'] = {'relativeImprovement': improvement, 'dailyBlocks': len(daily),
            'simultaneousLowerMseImprovement': lower, 'allFoldsBeatBaseline': stable,
            'method': '4096 paired daily-block bootstrap; Bonferroni 144 comparisons; assumes daily block independence'}
        if complete and improvement >= config['minimumImprovement'] and stable and lower > 0:
            eligible.append(name)
    if not eligible:
        return {'algorithm': None, 'status': 'unavailable', 'reason': 'no_meaningful_validation_advantage' if complete else 'incomplete_required_benchmark'}
    best = min(results[n]['validation']['returnRmse'] for n in eligible)
    equivalent = [n for n in eligible if results[n]['validation']['returnRmse'] <= best*(1+config['equivalenceTolerance'])]
    chosen = min(equivalent, key=ALGORITHMS.index)
    return {'algorithm': chosen, 'status': 'experimental', 'reason': 'validation_advantage_observed_not_profitability_evidence'}


class ResourceMonitor:
    def __enter__(self):
        self.stop = threading.Event()
        self.peak = psutil.Process().memory_info().rss
        def sample():
            while not self.stop.wait(.05):
                self.peak = max(self.peak, psutil.Process().memory_info().rss)
        self.thread = threading.Thread(target=sample, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.peak = max(self.peak, psutil.Process().memory_info().rss)
        self.stop.set()
        self.thread.join()


def feature_ablation(x, y, train, validation):
    groups = {'returns': [0, 1, 2, 3], 'range_volatility': [4, 5, 6, 7],
        'indicators': list(range(8, 15)), 'activity': list(range(15, 20)), 'clock': list(range(20, 24))}
    result = {}
    for group, removed in {'none': [], **groups}.items():
        keep = [i for i in range(len(FEATURES)) if i not in removed]
        model = candidate('ridge').fit(x[train][:, keep], y[train])
        result[group] = float(np.sqrt(np.mean((model.predict(x[validation][:, keep])-y[validation])**2)))
    return {'method': 'fixed Ridge group removal on last validation fold only; no test feedback', 'returnRmse': result}


def benchmark(dataset, output, symbol, horizon, config=None):
    if horizon not in HORIZONS or HORIZONS[horizon] is None:
        raise ValueError('monthly_insufficient_independent_outcomes')
    config = {**DEFAULT_CONFIG, **(config or {})}
    if not (1000 <= config['maxTrainRows'] <= 100000 and 1 <= config['lstmEpochs'] <= 20 and
            2 <= config['folds'] <= 5 and 100 <= config['maxEvaluationRows'] <= 100000 and
            config['threads'] == 1):
        raise ValueError('resource_budget_out_of_bounds')
    start = time.perf_counter()
    frame, fingerprint = load_symbol(dataset, symbol)
    data, history = prepare(frame, horizon)
    x = data.loc[:, FEATURES].to_numpy(dtype=float)
    seq = sequences(history.loc[:, FEATURES].to_numpy(dtype=float))
    y = data.target.to_numpy(dtype=float)
    windows = plan(data, horizon, config)
    environment = {'python': platform.python_version(), 'platform': platform.platform(),
        'packages': {p: importlib.metadata.version(p) for p in
                     ('numpy', 'pandas', 'scikit-learn', 'torch', 'lightgbm', 'xgboost', 'pyarrow', 'psutil')}}
    code = {name: sha256(Path(__file__).parent/name) for name in ('data.py', 'features.py', 'models.py', 'benchmark.py')}
    identity = {'symbol': symbol, 'horizon': horizon, 'datasetFingerprint': fingerprint,
                'featureSchema': FEATURE_VERSION, 'config': config, 'code': code, 'environment': environment}
    run_id = digest(identity)
    directory = Path(output) / symbol / horizon / run_id
    if (directory/'report.json').is_file():
        return json.loads((directory/'report.json').read_text(encoding='utf-8'))
    report = {**identity, 'runId': run_id, 'generatedAt': datetime.now(timezone.utc).isoformat(),
        'evaluationPolicy': 'Fixed study; common origins; purged labels plus one-minute embargo. Selection frozen before final holdout. No random splits or validation-fitted preprocessing.',
        'samplingPolicy': 'Evenly spaced capped fitting origins across expanding past; capped nonoverlapping evaluation origins across entire windows. CPU pilot; not an exhaustive hyperparameter study.',
        'candidates': {}, 'artifacts': {}, 'selection': None}
    common = np.concatenate([test for _, test in windows[:-1]])
    actual, prices, times = y[common], data.reference_price.to_numpy()[common], data.source_time.to_numpy()[common].astype(np.int64)
    baseline = metrics(actual, np.zeros(len(actual)), prices, cost=config['costPerTurnover'])
    predictions = {}
    with threadpool_limits(limits=1):
        for name in ALGORITHMS:
            began = time.perf_counter()
            try:
                folds, predicted_all, fits = [], [], []
                inputs = seq if name == 'lstm' else x
                with ResourceMonitor() as monitor:
                    for train, test in windows[:-1]:
                        fit_start = time.perf_counter()
                        model = None if name == 'naive' else candidate(name, config['seed'], config['lstmEpochs']).fit(inputs[train], y[train])
                        fits.append(time.perf_counter()-fit_start)
                        predicted = np.zeros(len(test)) if model is None else model.predict(inputs[test])
                        predicted_all.append(predicted)
                        base = metrics(y[test], np.zeros(len(test)), data.reference_price.iloc[test], cost=config['costPerTurnover'])
                        fold = {'trainSamples': len(train), 'evaluationSamples': len(test),
                            'trainSourceStart': int(data.source_time.iloc[train[0]]), 'trainTargetEnd': int(data.target_time.iloc[train[-1]]),
                            'evaluationSourceStart': int(data.source_time.iloc[test[0]]), 'evaluationTargetEnd': int(data.target_time.iloc[test[-1]]),
                            'originFingerprint': digest(data.source_time.iloc[test].astype('int64').tolist()),
                            'baseline': base, 'metrics': metrics(y[test], predicted, data.reference_price.iloc[test], baseline=base, cost=config['costPerTurnover'])}
                        folds.append(fold)
                if monitor.peak/1024**2 > config['maxObservedRssMb']:
                    raise MemoryError('observed_process_rss_budget_exceeded')
                predictions[name] = np.concatenate(predicted_all)
                report['candidates'][name] = {'status': 'ok', 'walkForward': folds,
                    'validation': metrics(actual, predictions[name], prices, baseline=baseline, cost=config['costPerTurnover']),
                    'validationFitSeconds': sum(fits), 'validationDurationSeconds': time.perf_counter()-began,
                    'processPeakRssMb': monitor.peak/1024**2}
            except Exception as error:
                report['candidates'][name] = {'status': 'failed', 'error': f'{type(error).__name__}: {error}'}
            print(json.dumps({'event': 'validation_candidate', 'symbol': symbol, 'horizon': horizon,
                              'algorithm': name, 'status': report['candidates'][name]['status']}), flush=True)
        report['selection'] = select(report['candidates'], actual, predictions, times, config)
        # Persist the selection before any final holdout scores exist.
        save_json(directory/'selection-before-holdout.json', report['selection'])
        report['featureAblation'] = feature_ablation(x, y, *windows[-2])
        train, test = windows[-1]
        for name in ALGORITHMS:
            row = report['candidates'][name]
            if row['status'] != 'ok':
                continue
            began = time.perf_counter()
            try:
                inputs = seq if name == 'lstm' else x
                model = None if name == 'naive' else candidate(name, config['seed'], config['lstmEpochs']).fit(inputs[train], y[train])
                predicted = np.zeros(len(test)) if model is None else model.predict(inputs[test])
                base = metrics(y[test], np.zeros(len(test)), data.reference_price.iloc[test], cost=config['costPerTurnover'])
                row['holdout'] = {'trainSamples': len(train), 'samples': len(test),
                    'trainTargetEnd': int(data.target_time.iloc[train[-1]]),
                    'sourceStart': int(data.source_time.iloc[test[0]]), 'targetEnd': int(data.target_time.iloc[test[-1]]),
                    'metrics': metrics(y[test], predicted, data.reference_price.iloc[test], baseline=base, cost=config['costPerTurnover']),
                    'baseline': base}
                # Stability diagnostics with thresholds fitted exclusively on pre-holdout training.
                volatility = x[:, FEATURES.index('volatility_60')]
                threshold = np.quantile(volatility[train], [.33, .67])
                regimes = np.digitize(volatility[test], threshold)
                row['holdout']['regimes'] = {str(i): metrics(y[test][regimes == i], predicted[regimes == i],
                    data.reference_price.iloc[test].to_numpy()[regimes == i], cost=config['costPerTurnover'])
                    for i in range(3) if (regimes == i).any()}
                row['holdoutDurationSeconds'] = time.perf_counter()-began
                if model is not None:
                    # Frozen deploy fit uses all labels, after evaluation and selection are complete.
                    all_train = np.linspace(0, len(data)-1, min(config['maxTrainRows'], len(data)), dtype=int)
                    began = time.perf_counter()
                    final = candidate(name, config['seed'], config['lstmEpochs']).fit(inputs[all_train], y[all_train])
                    artifact = export_model(final, name, inputs[test[:128]])
                    path = directory/f'{name}.json'
                    save_json(path, artifact)
                    latency = []
                    for _ in range(30):
                        clock = time.perf_counter()
                        numeric_predict(artifact, inputs[-1:])
                        latency.append((time.perf_counter()-clock)*1000)
                    row['deployFitSeconds'] = time.perf_counter()-began
                    row['numericInferenceMedianMs'] = float(np.median(latency))
                    row['artifactBytes'] = path.stat().st_size
                    row['parityMaxAbsoluteError'] = artifact['parityMaxAbsoluteError']
                    report['artifacts'][name] = {'path': str(path.resolve()), 'sha256': sha256(path),
                        'trainingPeriod': {'start': int(data.source_time.iloc[0]), 'lastTarget': int(data.target_time.iloc[-1])},
                        'runtimeRequirements': ['numpy'], 'modelVersion': f'{symbol}-{horizon}-{name}-{run_id[:16]}'}
            except Exception as error:
                row['status'] = 'failed'
                row['error'] = f'{type(error).__name__}: {error}'
                if report['selection']['algorithm'] == name:
                    report['selection'] = {'algorithm': None, 'status': 'unavailable', 'reason': 'selected_artifact_failed'}
    report['totalSeconds'] = time.perf_counter()-start
    # Atomic end marker: cached runs are reused only after all work/evidence was saved.
    save_json(directory/'report.json', report)
    return report
