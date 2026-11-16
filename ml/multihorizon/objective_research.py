"""Fixed, resumable objective research within the existing multihorizon pipeline."""
from __future__ import annotations
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import psutil
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits
from .benchmark import ResourceMonitor
from .data import SYMBOLS, MINUTE, digest, load_symbol, save_json, sha256
from .features import HORIZONS, finite_ema
from .objective_features import OBJECTIVE_FEATURE_VERSION, objective_features, objective_targets, feature_columns
from .objective_models import (direction_model, export_direction, predict_direction, fit_volatility,
    export_volatility, predict_volatility, predict_volatility_model, garch_forecasts)
from .objective_statistics import (apply_temperature, calibrate_temperature, direction_metrics,
    volatility_metrics, conformal_radius, volatility_interval, paired_evidence, DAY)

PROTOCOL = Path(__file__).with_name('objective_study.json')


def research_code():
    names = ('objective_features.py', 'objective_models.py', 'objective_statistics.py', 'objective_research.py',
             'models.py', 'features.py', 'data.py', 'benchmark.py')
    return {name: sha256(Path(__file__).parent/name) for name in names}


def timestamp(value):
    return int(pd.Timestamp(value, tz='UTC').timestamp()*1000)


def trial_matrix(protocol):
    result = []
    for trial in protocol['direction']['trials']:
        for mode in trial['modes']:
            result.append({**trial, 'id': f'{mode}-{trial["id"]}', 'objective': 'direction', 'mode': mode})
    for removed in protocol['ablations']:
        result.append({'id': f'neutral-ablate-{removed}', 'objective': 'direction', 'mode': 'neutral',
            'algorithm': 'logistic', 'features': 'rich', 'removed': removed, 'rows': 36000, 'days': 90, 'C': .1})
    for trial in protocol['volatility']['trials']:
        result.append({**trial, 'objective': 'volatility'})
    # A fixed rich Ridge reference makes each volatility feature-group removal comparable.
    for removed in [None, *protocol['ablations']]:
        result.append({'id': f'rich-rv-{removed or "all"}', 'objective': 'volatility', 'algorithm': 'har_rv',
            'features': 'rich', 'removed': removed, 'rows': 36000, 'days': 90, 'alpha': 100, 'ablation': True})
    return result


def folds(target, valid, protocol, horizon):
    result = []
    for start, end in protocol['validationWindows']:
        first, stop = timestamp(start), timestamp(end)
        calibration_start = first-protocol['calibrationDays']*DAY
        eligible = np.flatnonzero(valid)
        validation = eligible[(target.source_time.iloc[eligible].to_numpy() >= first) &
            (target.target_time.iloc[eligible].to_numpy() < stop)]
        calibration = eligible[(target.source_time.iloc[eligible].to_numpy() >= calibration_start) &
            (target.target_time.iloc[eligible].to_numpy() < first-protocol['embargoMinutes']*MINUTE)]
        def sample(rows, cap):
            return rows[::max(horizon, int(np.ceil(len(rows)/cap)))]
        validation = sample(validation, protocol['maxEvaluationRows'])
        calibration = sample(calibration, protocol['maxCalibrationRows'])
        if len(validation) < 100 or len(calibration) < 100:
            raise ValueError('insufficient_objective_windows')
        result.append({'calibrationStart': calibration_start, 'validationStart': first,
                       'calibration': calibration, 'validation': validation})
    return result


def training_rows(target, valid, fold, trial, embargo=MINUTE):
    cutoff = fold['calibrationStart']-embargo
    mask = valid & (target.target_time < cutoff) & (target.source_time >= cutoff-trial['days']*DAY)
    rows = np.flatnonzero(mask)
    if trial['algorithm'] == 'garch':
        rows = rows[-trial['rows']:]
    elif len(rows) > trial['rows']:
        rows = rows[np.linspace(0, len(rows)-1, trial['rows'], dtype=int)]
    if len(rows) < 1000:
        raise ValueError('insufficient_training_rows')
    return rows


def inputs(x, rows, lookback=1):
    if lookback == 1:
        return x[rows]
    positions = rows[:, None]-np.arange(lookback-1, -1, -1)
    return x[positions]


def prepare_pair(dataset, symbol, horizon):
    frame, fingerprint = load_symbol(dataset, symbol)
    peers = {s: frame if s == symbol else load_symbol(dataset, s)[0] for s in ('BTCUSDT', 'ETHUSDT')}
    rich, groups = objective_features(frame, symbol, peers)
    target = objective_targets(frame, HORIZONS[horizon])
    valid = rich.notna().all(axis=1).rolling(16).sum().eq(16) & target[['target_time', 'variance', 'neutral_threshold']].notna().all(axis=1)
    return frame, rich, groups, target, valid.to_numpy(), fingerprint


def direction_baselines(x, target, train, calibration, validation, mode):
    classes = 2 if mode == 'binary' else 3
    y = target[mode].to_numpy()
    prior = (np.bincount(y[train].astype(int), minlength=classes)+1)/(len(train)+classes)
    majority = np.full(classes, 1e-6)
    majority[prior.argmax()] = 1
    majority /= majority.sum()
    momentum = make_pipeline(StandardScaler(), LogisticRegression(C=.1, max_iter=150, random_state=42))
    momentum.fit(x[train], y[train].astype(int))
    temperature = calibrate_temperature(momentum.predict_proba(x[calibration]), y[calibration].astype(int))
    probabilities_by_name = {
        'uniform': np.full((len(validation), classes), 1/classes),
        'training_class_prior': np.tile(prior, (len(validation), 1)),
        'majority': np.tile(majority, (len(validation), 1)),
        'calibrated_simple_momentum': apply_temperature(momentum.predict_proba(x[validation]), temperature),
    }
    calibration_prior_loss = -np.log(prior[y[calibration].astype(int)]).mean()
    calibration_momentum, _ = direction_metrics(y[calibration].astype(int), apply_temperature(momentum.predict_proba(x[calibration]), temperature))
    chosen = 'training_class_prior' if calibration_prior_loss <= calibration_momentum['logLoss'] else 'calibrated_simple_momentum'
    return probabilities_by_name, chosen


def volatility_baselines(target, train, horizon):
    sq = target.minute_return.pow(2)
    return {'training_mean_variance': np.full(len(target), max(float(target.variance.iloc[train].mean()), 1e-12)),
            'rolling_horizon': np.maximum(sq.rolling(horizon).sum().to_numpy(), 1e-12),
            'ewma_60': np.maximum(finite_ema(sq, 60).to_numpy()*horizon, 1e-12),
            'ewma_240': np.maximum(finite_ema(sq, 240).to_numpy()*horizon, 1e-12)}


def regime_metrics(target, train, validation, prediction, objective):
    thresholds = np.quantile(target.past_variance.iloc[train], [.33, .67])
    regime = np.digitize(target.past_variance.iloc[validation], thresholds)
    result = {}
    for label in range(3):
        chosen = regime == label
        if chosen.sum() < 10:
            continue
        if objective == 'volatility':
            score, _ = volatility_metrics(target.variance.iloc[validation].to_numpy()[chosen], prediction[chosen])
        else:
            score, _ = direction_metrics(target.neutral.iloc[validation].to_numpy()[chosen], prediction[chosen])
        score.pop('reliability', None)
        result[str(label)] = {'samples': int(chosen.sum()), **score}
    return result


def run_trial(trial, frame, rich, groups, target, valid, protocol, output, baseline_cache=None):
    baseline_cache = baseline_cache if baseline_cache is not None else {}
    columns = feature_columns(rich, groups, trial['features'], trial.get('removed')) if trial['algorithm'] != 'garch' else ['return_1']
    x = rich.loc[:, columns].to_numpy(dtype=np.float32)
    objective, mode = trial['objective'], trial.get('mode', 'neutral')
    eligible = valid & (np.isfinite(target.binary.to_numpy()) if mode == 'binary' and objective == 'direction' else True)
    plan = folds(target, eligible, protocol, HORIZONS[output['horizon']])
    results, losses, baseline_losses, origins, all_actual, all_predicted = [], [], [], [], [], []
    baseline_summary = {}
    start = time.perf_counter()
    with ResourceMonitor() as memory, threadpool_limits(limits=1):
        for number, fold in enumerate(plan):
            train = training_rows(target, eligible, fold, trial)
            base_train = training_rows(target, eligible, fold, {'algorithm': 'logistic', 'rows': 36000, 'days': 180})
            cal, val = fold['calibration'], fold['validation']
            lookback = trial.get('lookback', 1)
            fit_start = time.perf_counter()
            if objective == 'direction':
                labels = target[mode].to_numpy()
                classes = 2 if mode == 'binary' else 3
                if len(np.unique(labels[train])) != classes:
                    raise ValueError('missing_training_direction_class')
                model = direction_model(trial, classes).fit(inputs(x, train, lookback), labels[train].astype(int))
                fit_seconds = time.perf_counter()-fit_start
                raw_cal, raw_val = model.predict_proba(inputs(x, cal, lookback)), model.predict_proba(inputs(x, val, lookback))
                temperature = calibrate_temperature(raw_cal, labels[cal].astype(int))
                predicted = apply_temperature(raw_val, temperature)
                score, loss = direction_metrics(labels[val].astype(int), predicted, target['return'].iloc[val].to_numpy())
                raw_score, _ = direction_metrics(labels[val].astype(int), raw_val)
                train_score, _ = direction_metrics(labels[train[-2048:]].astype(int), model.predict_proba(inputs(x, train[-2048:], lookback)))
                baseline_key = ('direction', mode, number)
                if baseline_key not in baseline_cache:
                    baseline_cache[baseline_key] = direction_baselines(rich[['return_15']].to_numpy(), target, base_train, cal, val, mode)
                baseline_p, selected = baseline_cache[baseline_key]
                baselines = {}
                for name, probability in baseline_p.items():
                    metric, base_loss = direction_metrics(labels[val].astype(int), probability)
                    metric.pop('reliability', None)
                    baselines[name] = metric
                    if name == selected:
                        baseline_loss = base_loss
                calibration = {'temperature': temperature, 'samples': len(cal), 'method': 'chronological_temperature',
                    'rawLogLoss': raw_score['logLoss'], 'rawEce': raw_score['ece'], 'calibratedEce': score['ece']}
                actual = labels[val].astype(int)
                if number == len(plan)-1:
                    artifact = export_direction(model, trial, columns, inputs(x, val[:128], lookback), temperature)
            else:
                if trial['algorithm'] == 'garch':
                    combined = np.r_[cal, val]
                    values, parameters = garch_forecasts(target.minute_return.to_numpy(), train, combined,
                        HORIZONS[output['horizon']], trial.get('maxIterations', 100))
                    predicted_cal, predicted = values[:len(cal)], values[len(cal):]
                    train_score = {'note': 'GARCH likelihood fit; no comparable in-sample volatility score'}
                    artifact = None
                else:
                    model, smear = fit_volatility(trial, x[train], target.variance.iloc[train].to_numpy())
                    predicted_cal = predict_volatility_model(model, smear, x[cal])
                    predicted = predict_volatility_model(model, smear, x[val])
                    train_score, _ = volatility_metrics(target.variance.iloc[train[-2048:]], predict_volatility_model(model, smear, x[train[-2048:]]))
                    parameters = None
                    if number == len(plan)-1:
                        artifact = export_volatility(model, trial, columns, x[val[:128]], smear)
                fit_seconds = time.perf_counter()-fit_start
                radius = conformal_radius(target.variance.iloc[cal], predicted_cal)
                interval = volatility_interval(predicted, radius)
                score, loss = volatility_metrics(target.variance.iloc[val], predicted, interval)
                raw_score = score
                baseline_key = ('volatility', number)
                if baseline_key not in baseline_cache:
                    baseline_cache[baseline_key] = volatility_baselines(target, base_train, HORIZONS[output['horizon']])
                baseline_vectors = baseline_cache[baseline_key]
                # Strong baseline choice uses only the separate calibration segment.
                selected = min(baseline_vectors, key=lambda n: volatility_metrics(target.variance.iloc[cal], baseline_vectors[n][cal])[0]['qlike'])
                baselines = {}
                for name, values in baseline_vectors.items():
                    metric, base_loss = volatility_metrics(target.variance.iloc[val], values[val])
                    baselines[name] = metric
                    if name == selected:
                        baseline_loss = base_loss
                calibration = {'radius': radius, 'samples': len(cal), 'method': 'past_split_conformal_log_sigma',
                               'nominalCoverage': .9, 'parameters': parameters}
                actual = target.variance.iloc[val].to_numpy()
            for name, metric in baselines.items():
                baseline_summary.setdefault(name, []).append(metric)
            entry = {'fold': number+1, 'trainRows': len(train), 'calibrationRows': len(cal), 'evaluationRows': len(val),
                'trainSourceStart': int(target.source_time.iloc[train[0]]), 'trainTargetEnd': int(target.target_time.iloc[train[-1]]),
                'calibrationSourceStart': int(target.source_time.iloc[cal[0]]), 'calibrationTargetEnd': int(target.target_time.iloc[cal[-1]]),
                'validationSourceStart': int(target.source_time.iloc[val[0]]), 'validationTargetEnd': int(target.target_time.iloc[val[-1]]),
                'originFingerprint': digest(target.source_time.iloc[val].astype('int64').tolist()),
                'metrics': score, 'rawMetrics': {k: v for k, v in raw_score.items() if k != 'reliability'},
                'trainingDiagnostic': {k: v for k, v in train_score.items() if k != 'reliability'},
                'calibration': calibration, 'baselines': baselines, 'selectedBaseline': selected,
                'fitSeconds': fit_seconds}
            if objective == 'volatility' or mode == 'neutral':
                entry['volatilityRegimes'] = regime_metrics(target, train, val, predicted, objective)
            results.append(entry)
            losses.extend(loss.tolist()); baseline_losses.extend(baseline_loss.tolist())
            origins.extend(target.source_time.iloc[val].astype('int64').tolist())
            all_actual.extend(actual.tolist()); all_predicted.extend(predicted.tolist())
    family_size = protocol['selection']['priorPhaseComparisons']+len(trial_matrix(protocol))*len(SYMBOLS)*len(protocol['horizons'])
    evidence = paired_evidence(origins, baseline_losses, losses, family_size)
    if objective == 'direction':
        metrics, _ = direction_metrics(np.asarray(all_actual), np.asarray(all_predicted))
        base = float(np.mean(baseline_losses))
        improvement = 1-metrics['logLoss']/base
        wins = all(f['metrics']['logLoss'] < f['baselines'][f['selectedBaseline']]['logLoss'] for f in results)
        calibrated = metrics['ece'] <= protocol['selection']['maximumDirectionEce']
        eligible_for_research = mode == 'neutral' and not trial.get('removed')
    else:
        metrics, _ = volatility_metrics(np.asarray(all_actual), np.asarray(all_predicted))
        base_mae = sum(f['baselines'][f['selectedBaseline']]['mae']*f['evaluationRows'] for f in results)/sum(f['evaluationRows'] for f in results)
        improvement = 1-metrics['mae']/base_mae
        wins = all(f['metrics']['mae'] < f['baselines'][f['selectedBaseline']]['mae'] and f['metrics']['qlike'] < f['baselines'][f['selectedBaseline']]['qlike'] for f in results)
        coverage = sum(f['metrics']['intervalCoverage']*f['evaluationRows'] for f in results)/sum(f['evaluationRows'] for f in results)
        metrics['intervalCoverage'] = coverage
        calibrated = protocol['selection']['minimumVolatilityCoverage'] <= coverage <= protocol['selection']['maximumVolatilityCoverage']
        eligible_for_research = not trial.get('ablation')
    development_eligible = eligible_for_research and improvement >= .01 and wins and calibrated and evidence['simultaneousLowerImprovement'] > 0
    artifact_info = None
    if artifact is not None:
        path = output['directory']/f'{trial["id"]}-artifact.json'
        save_json(path, artifact)
        latencies = []
        parity_x = inputs(x, plan[-1]['validation'][-1:], trial.get('lookback', 1))
        for _ in range(20):
            clock = time.perf_counter()
            predict_direction(artifact, parity_x) if objective == 'direction' else predict_volatility(artifact, parity_x)
            latencies.append((time.perf_counter()-clock)*1000)
        artifact_info = {'file': path.name, 'sha256': sha256(path), 'bytes': path.stat().st_size,
            'numericInferenceMedianMs': float(np.median(latencies)), 'parityMaxAbsoluteError': artifact['parityMaxAbsoluteError'],
            'note': 'last development fold fit, not a production model or future-confirmed artifact'}
    return {'trial': trial, 'status': 'completed', 'folds': results, 'metrics': metrics,
        'baselineRelativeImprovement': improvement, 'allFoldsWin': wins, 'calibrationPass': calibrated,
        'evidence': evidence, 'developmentEligible': bool(development_eligible), 'productionAccepted': False,
        'reason': 'future_confirmation_required' if development_eligible else 'no_robust_development_advantage',
        'durationSeconds': time.perf_counter()-start, 'processPeakRssMiB': memory.peak/1024**2,
        'artifact': artifact_info,
        'dailyLossImprovement': {str(int(day)): float(np.mean((np.asarray(baseline_losses)-losses)[np.asarray(origins)//DAY == day])) for day in np.unique(np.asarray(origins)//DAY)}}


def run_pair(dataset, directory, symbol, horizon, protocol):
    directory = Path(directory)
    frame, rich, groups, target, valid, fingerprint = prepare_pair(dataset, symbol, horizon)
    code = research_code()
    matrix = trial_matrix(protocol)
    header = {'version': protocol['version'], 'symbol': symbol, 'horizon': horizon, 'datasetFingerprint': fingerprint,
        'protocolFingerprint': digest(protocol), 'featureSchema': OBJECTIVE_FEATURE_VERSION, 'featureOrder': list(rich.columns),
        'featureGroups': groups, 'code': code, 'createdAt': datetime.now(timezone.utc).isoformat(),
        'futureConfirmation': protocol['futureConfirmation'], 'productionAccepted': False,
        'targetDiagnostics': {'zeroReturnFraction': float((target['return'][valid] == 0).mean()),
            'costNeutralFraction24bp': float((target['return'][valid].abs() <= .0024).mean())},
        'environment': {'python': platform.python_version(), 'platform': platform.platform(),
            'packages': {n: importlib.metadata.version(n) for n in ('numpy', 'pandas', 'scikit-learn', 'lightgbm', 'xgboost', 'torch', 'arch')}}}
    directory.mkdir(parents=True, exist_ok=True)
    if (directory/'header.json').exists():
        previous = json.loads((directory/'header.json').read_text(encoding='utf-8'))
        if previous.get('code') != code or previous.get('protocolFingerprint') != digest(protocol):
            raise ValueError('evidence_directory_immutable_use_new_output_for_changed_source')
    save_json(directory/'header.json', header)
    baseline_cache = {}
    for trial in matrix:
        path = directory/f'{trial["id"]}.json'
        if path.is_file():
            old = json.loads(path.read_text(encoding='utf-8'))
            if old.get('protocolFingerprint') == digest(protocol) and old.get('code') == code:
                continue
        started = time.perf_counter()
        try:
            row = run_trial(trial, frame, rich, groups, target, valid, protocol, {'directory': directory, 'horizon': horizon}, baseline_cache)
        except Exception as error:
            row = {'trial': trial, 'status': 'failed', 'error': f'{type(error).__name__}: {error}', 'durationSeconds': time.perf_counter()-started}
        row.update(protocolFingerprint=digest(protocol), code=code)
        save_json(path, row)
        print(json.dumps({'symbol': symbol, 'horizon': horizon, 'trial': trial['id'], 'status': row['status'],
                          'seconds': row['durationSeconds'], 'error': row.get('error')}), flush=True)
    save_json(directory/'complete.json', {'protocolFingerprint': digest(protocol), 'trials': len(matrix), 'code': code})


def run_study(dataset, output, *, symbol=None, horizon=None, protocol_path=PROTOCOL):
    protocol = json.loads(Path(protocol_path).read_text(encoding='utf-8'))
    if protocol['futureConfirmation']['start'] <= protocol['registeredOn']:
        raise ValueError('genuinely_future_confirmation_required')
    if not Path(dataset).is_dir():
        raise FileNotFoundError('historical_data_missing_no_synthetic_substitution')
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    save_json(output/'protocol.json', protocol)
    began = time.monotonic()
    outcomes = []
    for coin in [symbol] if symbol else SYMBOLS:
        for period in [horizon] if horizon else protocol['horizons']:
            if coin not in SYMBOLS or period not in protocol['horizons']:
                raise ValueError('unsupported_research_pair')
            directory = output/coin/period
            marker = directory/'complete.json'
            if marker.is_file() and json.loads(marker.read_text(encoding='utf-8')).get('code') == research_code():
                outcomes.append({'symbol': coin, 'horizon': period, 'status': 'cached'})
                continue
            remaining = protocol['resourceBudget']['maxWallSeconds']-(time.monotonic()-began)
            if remaining <= 0:
                outcomes.append({'symbol': coin, 'horizon': period, 'status': 'unexecuted_total_budget'})
                continue
            log = output/f'{coin}-{period}.log'
            with log.open('w', encoding='utf-8') as stream:
                process = subprocess.Popen([sys.executable, str(Path(__file__).parents[1]/'forecast_v2.py'), 'objective-research',
                    '--dataset', str(dataset), '--output', str(output), '--symbol', coin, '--horizon', period,
                    '--protocol', str(protocol_path), '--pair-process'], stdout=stream, stderr=subprocess.STDOUT,
                    env={**os.environ, 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'})
                reason = None
                start = time.monotonic()
                while process.poll() is None:
                    try:
                        rss = psutil.Process(process.pid).memory_info().rss/1024**2
                        if rss > protocol['resourceBudget']['maxProcessRssMiB']:
                            reason = 'pair_memory_budget'
                    except psutil.NoSuchProcess:
                        break
                    if time.monotonic()-start > min(remaining, protocol['resourceBudget']['pairTimeoutSeconds']):
                        reason = 'pair_time_budget'
                    if reason:
                        process.terminate()
                        process.wait(timeout=10)
                        break
                    time.sleep(.25)
                process.wait()
            outcomes.append({'symbol': coin, 'horizon': period, 'status': reason or ('completed' if process.returncode == 0 else 'failed'),
                             'exitCode': process.returncode, 'seconds': time.monotonic()-start})
            save_json(output/'execution.json', outcomes)
            print(json.dumps(outcomes[-1]), flush=True)
    save_json(output/'execution.json', outcomes)
    return outcomes
