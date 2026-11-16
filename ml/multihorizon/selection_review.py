"""Reproducible selection comparisons and bounded development-only stability review."""
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits
from .data import SYMBOLS, MINUTE, digest, load_symbol, save_json, sha256
from .features import HORIZONS
from .evidence_metrics import objective_evidence, relative_improvement
from .local_selection import POLICY, rank_objectives
from .objective_features import objective_features, objective_targets
from .objective_models import predict_direction, predict_volatility
from .objective_research import (folds, inputs, training_rows, direction_baselines, volatility_baselines)
from .objective_statistics import direction_metrics, volatility_metrics, volatility_interval

REVIEW = Path(__file__).with_suffix('.json')


def read_rows(directory):
    rows = []
    for path in sorted(Path(directory).glob('*.json')):
        if path.name.endswith('-artifact.json'):
            continue
        value = json.loads(path.read_text(encoding='utf-8'))
        if 'trial' in value:
            rows.append(value)
    return rows


def tail_diagnostics(actual_sigma, absolute_return, model_loss, baseline_loss):
    """Ex-post slices, not available-at-origin features or trading rules."""
    a, r, model, baseline = map(lambda x: np.asarray(x, dtype=float),
                               (actual_sigma, absolute_return, model_loss, baseline_loss))
    if a.ndim != 1 or not len(a) or not all(v.shape == a.shape and np.isfinite(v).all() for v in (a, r, model, baseline)):
        raise ValueError('invalid_tail_inputs')
    count = max(1, math.ceil(.01*len(a)))
    paired = baseline-model
    result = {'samples': len(a), 'tailSamples': count, 'meanPrimaryImprovement': float(paired.mean()), 'slices': {}}
    for name, axis in [('realizedVolatility', a), ('absoluteNetReturn', r), ('absolutePairedDifference', np.abs(paired))]:
        extreme = np.argsort(axis, kind='stable')[-count:]
        keep = np.ones(len(a), dtype=bool); keep[extreme] = False
        result['slices'][name] = {'tailModelLoss': float(model[extreme].mean()),
            'tailBaselineLoss': float(baseline[extreme].mean()),
            'remainingModelLoss': float(model[keep].mean()) if keep.any() else None,
            'remainingBaselineLoss': float(baseline[keep].mean()) if keep.any() else None,
            'remainingMeanImprovement': float(paired[keep].mean()) if keep.any() else None,
            'modelLossShare': float(model[extreme].sum()/model.sum()) if model.sum() > 0 else None,
            'absolutePairedShare': float(np.abs(paired[extreme]).sum()/np.abs(paired).sum()) if np.abs(paired).sum() > 0 else None}
    return result


def checked_window(row, target, validation):
    recorded = row['folds'][-1]
    origins = target.source_time.iloc[validation].astype('int64').tolist()
    if recorded['trainTargetEnd'] >= recorded['calibrationSourceStart'] or recorded['calibrationTargetEnd'] >= min(origins):
        raise ValueError('overlapping_train_calibration_validation')
    if digest(origins) != recorded['originFingerprint'] or len(origins) != recorded['evaluationRows']:
        raise ValueError('replay_origins_differ_from_original')
    return origins


def replay_pair(study, dataset, symbol, horizon, destination):
    import psutil
    began = time.perf_counter()
    directory = Path(study)/symbol/horizon
    protocol = json.loads((Path(study)/'protocol.json').read_text(encoding='utf-8'))
    end = int(pd.Timestamp(protocol['validationWindows'][-1][1], tz='UTC').timestamp()*1000)
    frame, fingerprint = load_symbol(dataset, symbol)
    if fingerprint != json.loads((directory/'header.json').read_text(encoding='utf-8'))['datasetFingerprint']:
        raise ValueError('replay_dataset_differs_from_training_evidence')
    # Trim at the registered development boundary before constructing features/targets.
    frame = frame.loc[frame.close_time < end].reset_index(drop=True)
    peers = {}
    for peer in ('BTCUSDT', 'ETHUSDT'):
        value = frame if peer == symbol else load_symbol(dataset, peer)[0]
        peers[peer] = value.loc[value.close_time < end].reset_index(drop=True)
    rich, _ = objective_features(frame, symbol, peers)
    target = objective_targets(frame, HORIZONS[horizon])
    valid = (rich.notna().all(axis=1).rolling(16).sum().eq(16) &
        target[['target_time', 'variance', 'neutral_threshold']].notna().all(axis=1)).to_numpy()
    plan = folds(target, valid, protocol, HORIZONS[horizon])[-1]
    val, cal = plan['validation'], plan['calibration']
    rows = read_rows(directory)
    selected = [rank_objectives(rows, 'direction')[0], rank_objectives(rows, 'volatility')[0]]
    previous = rank_objectives(rows, 'volatility', volatility_primary='qlike')[0]
    if previous['trial']['id'] != selected[-1]['trial']['id']:
        selected.append(previous)
    base_train = training_rows(target, valid, plan, {'algorithm': 'logistic', 'rows': 36000, 'days': 180})
    probability_baselines, _ = direction_baselines(rich[['return_15']].to_numpy(), target, base_train, cal, val, 'neutral')
    variance_baselines = volatility_baselines(target, base_train, HORIZONS[horizon])
    result = {'symbol': symbol, 'horizon': horizon, 'datasetFingerprint': fingerprint,
        'scope': 'last development fold only; no candidate refit; original fixed momentum baseline reconstructed',
        'featureInputEndMs': int(frame.close_time.iloc[-1]), 'developmentEndExclusiveMs': end,
        'models': {}, 'utcMinutePhases': sorted(set((target.source_time.iloc[val]//MINUTE % 60).astype(int).tolist())),
        'minimumOriginSpacingMinutes': float(np.diff(target.source_time.iloc[val]).min()/MINUTE)}
    arrays = {'sourceMs': target.source_time.iloc[val].to_numpy(), 'variance': target.variance.iloc[val].to_numpy()}
    with threadpool_limits(limits=1):
        for row in selected:
            name, objective = row['trial']['id'], row['trial']['objective']
            origins = checked_window(row, target, val)
            info = row['artifact']; path = directory/info['file']
            if sha256(path) != info['sha256']:
                raise ValueError('review_artifact_checksum')
            artifact = json.loads(path.read_text(encoding='utf-8'))
            x = inputs(rich[artifact['features']].to_numpy(dtype=np.float32), val, row['trial'].get('lookback', 1))
            chosen = row['folds'][-1]['selectedBaseline']
            if objective == 'direction':
                actual = target.neutral.iloc[val].to_numpy(dtype=int)
                prediction = predict_direction(artifact, x)
                baseline = probability_baselines[chosen]
                score, losses = direction_metrics(actual, prediction)
                base_score, baseline_loss = direction_metrics(actual, baseline)
                metric_name = 'logLoss'
                extra = {'maximumProbabilitySumError': float(np.max(np.abs(prediction.sum(axis=1)-1)))}
            else:
                actual = target.variance.iloc[val].to_numpy()
                prediction = predict_volatility(artifact, x)
                baseline = variance_baselines[chosen][val]
                lower, upper = volatility_interval(prediction, row['folds'][-1]['calibration']['radius'])
                score, _ = volatility_metrics(actual, prediction, (lower, upper))
                base_score, _ = volatility_metrics(actual, baseline)
                losses, baseline_loss = np.abs(np.sqrt(prediction)-np.sqrt(actual)), np.abs(np.sqrt(baseline)-np.sqrt(actual))
                metric_name = 'mae'
                ratio = float(np.median((upper-lower)/np.maximum(np.sqrt(prediction), 1e-12)))
                extra = {'interval': {'nominalCoverage': .9, 'measuredCoverage': score['intervalCoverage'],
                    'meanWidth': score['meanIntervalWidth'], 'medianWidth': float(np.median(upper-lower)),
                    'p90Width': float(np.quantile(upper-lower, .9)), 'maximumWidth': float(np.max(upper-lower)),
                    'medianWidthToForecastRatio': ratio, 'wideDiagnostic': ratio > 10,
                    'coverageDiagnostic': abs(score['intervalCoverage']-.9) > .05,
                    'calibrationMatchesArtifact': True, 'diagnosticsAreActivationGates': False}}
            if not np.isclose(score[metric_name], row['folds'][-1]['metrics'][metric_name], rtol=1e-5, atol=1e-8):
                raise ValueError('replay_score_differs_from_recorded_fold')
            if not np.isclose(base_score[metric_name], row['folds'][-1]['baselines'][chosen][metric_name], rtol=1e-5, atol=1e-8):
                raise ValueError('reconstructed_baseline_differs_from_recorded_fold')
            train = training_rows(target, valid, plan, row['trial'])
            thresholds = np.quantile(target.past_variance.iloc[train], [.33, .67])
            labels = np.digitize(target.past_variance.iloc[val], thresholds)
            regimes = {}
            for label in range(3):
                mask = labels == label
                if mask.sum() < 10:
                    regimes[('low', 'medium', 'high')[label]] = {'samples': int(mask.sum()),
                        'model': None, 'baseline': None, 'reason': 'too_few_regime_observations'}
                    continue
                scorer = direction_metrics if objective == 'direction' else volatility_metrics
                model_scores, _ = scorer(actual[mask], prediction[mask]); baseline_scores, _ = scorer(actual[mask], baseline[mask])
                model_scores.pop('reliability', None); baseline_scores.pop('reliability', None)
                regimes[('low', 'medium', 'high')[label]] = {'samples': int(mask.sum()), 'model': model_scores,
                    'baseline': baseline_scores, 'relativePrimaryImprovement': relative_improvement(model_scores[metric_name], baseline_scores[metric_name])}
            result['models'][name] = {'objective': objective, 'artifactSha256': info['sha256'],
                'samples': len(origins), 'originFingerprint': digest(origins), 'model': score, 'baseline': base_score,
                'regimes': regimes, 'tails': tail_diagnostics(np.sqrt(target.variance.iloc[val]),
                    np.abs(target['return'].iloc[val]), losses, baseline_loss), **extra}
            arrays[name] = prediction; arrays[name+'-baseline'] = baseline
    result['seconds'] = time.perf_counter()-began
    result['processRssMiB'] = psutil.Process().memory_info().rss/1024**2
    if result['processRssMiB'] > 2048:
        raise MemoryError('review_memory_budget')
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(destination.with_suffix('.npz'), **arrays)
    result['predictionsSha256'] = sha256(destination.with_suffix('.npz'))
    save_json(destination, result)
    return result


def run_replays(study, dataset, output):
    config = json.loads(REVIEW.read_text(encoding='utf-8'))
    started, execution = time.perf_counter(), []
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    pilot = output/'BTCUSDT-1m-pilot.json'
    pilot_seconds = json.loads(pilot.read_text(encoding='utf-8'))['seconds'] if pilot.exists() else 0
    for symbol in SYMBOLS:
        for horizon in ('1m', '15m', '1h'):
            remaining = config['resourceBudget']['maxSeconds']-pilot_seconds-(time.perf_counter()-started)
            path = output/f'{symbol}-{horizon}.json'
            record = {'symbol': symbol, 'horizon': horizon}
            if remaining < 1:
                record.update(status='unexecuted', reason='review_wall_budget')
            else:
                args = [sys.executable, 'ml/forecast_v2.py', 'selection-review', '--pair-process', '--symbol', symbol,
                    '--horizon', horizon, '--study', str(study), '--dataset', str(dataset), '--replay-output', str(output)]
                began = time.perf_counter()
                try:
                    process = subprocess.run(args, timeout=min(remaining, config['resourceBudget']['pairTimeoutSeconds']),
                        capture_output=True, text=True, env={**os.environ, 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'})
                    record.update(status='completed' if process.returncode == 0 else 'failed', seconds=time.perf_counter()-began)
                    if process.returncode:
                        record['reason'] = process.stderr[-1600:]
                except subprocess.TimeoutExpired:
                    record.update(status='failed', reason='pair_time_budget', seconds=time.perf_counter()-began)
            execution.append(record)
            save_json(output/'execution.json', execution)
            print(json.dumps(record), flush=True)
    return execution


def stability_summary(entries):
    result = {}
    for objective in ('direction', 'volatility'):
        values = [e for e in entries if e['objective'] == objective and e.get('replay')]
        folds, regimes, tail_reversals = {}, {}, []
        shares = []
        for entry in values:
            evidence, replay = entry['comparison'], entry['replay']
            metric = evidence['primaryMetric']
            wins = sum(f['metrics'][metric] < f['baselines'][f['selectedBaseline']][metric] for f in evidence['folds'])
            folds[str(wins)] = folds.get(str(wins), 0)+1
            for name, group in replay['regimes'].items():
                improvement = group.get('relativePrimaryImprovement')
                if improvement is not None:
                    label = name+('Win' if improvement > 0 else 'Loss')
                    regimes[label] = regimes.get(label, 0)+1
            tail = replay['tails']['slices']['realizedVolatility']
            shares.append(tail['modelLossShare'])
            if replay['tails']['meanPrimaryImprovement'] > 0 and tail['remainingMeanImprovement'] < 0:
                tail_reversals.append(f'{entry["symbol"]}/{entry["horizon"]}')
        result[objective] = {'replayedPairs': len(values), 'foldWinHistogram': folds, 'regimeWinsAndLosses': regimes,
            'baselineWinReversedAfterRemovingLargestRealizedVolatilityOnePercent': tail_reversals,
            'topRealizedVolatilityOnePercentModelLossShareRange': [min(shares), max(shares)] if shares else None}
    intervals = {}
    for horizon in ('1m', '15m', '1h'):
        rows = [e['replay']['interval'] for e in entries if e['objective'] == 'volatility' and e['horizon'] == horizon and e.get('replay')]
        intervals[horizon] = {'widePairs': sum(r['wideDiagnostic'] for r in rows),
            'coverageDeviationPairs': sum(r['coverageDiagnostic'] for r in rows),
            'coverageRange': [min(r['measuredCoverage'] for r in rows), max(r['measuredCoverage'] for r in rows)] if rows else None,
            'widthToForecastRatioRange': [min(r['medianWidthToForecastRatio'] for r in rows), max(r['medianWidthToForecastRatio'] for r in rows)] if rows else None}
    result['volatilityIntervals'] = intervals
    return result


def matching_replay(row, replay, completed, dataset_fingerprint=None):
    if not completed or not replay:
        return None
    if dataset_fingerprint is not None and replay.get('datasetFingerprint') != dataset_fingerprint:
        return None
    value = replay.get('models', {}).get(row['trial']['id'])
    if not value or value.get('artifactSha256') != row['artifact']['sha256']:
        return None
    if value.get('originFingerprint') != row['folds'][-1]['originFingerprint']:
        return None
    return value


def export_review(study, price_study, previous, replay_output, output):
    study, replay_output, output = Path(study), Path(replay_output), Path(output)
    manifest = json.loads(Path('ml/artifacts/local/selection.json').read_text(encoding='utf-8'))
    if manifest['policy'] != POLICY:
        raise ValueError('run_local_prepare_before_review')
    old = json.loads(Path(previous).read_text(encoding='utf-8'))
    execution_path = replay_output/'execution.json'
    execution = json.loads(execution_path.read_text(encoding='utf-8')) if execution_path.exists() else []
    completed = {(e['symbol'], e['horizon']) for e in execution if e['status'] == 'completed'}
    old_by_pair = {(r['symbol'], r['horizon'], r['objective']): r for r in old['objectives']}
    entries, changes, replay_metadata = [], [], {}
    for entry in manifest['objectives']:
        if entry['horizon'] == '1M':
            continue
        symbol, horizon, objective = entry['symbol'], entry['horizon'], entry['objective']
        if entry['status'] != 'experimental':
            entries.append({'symbol': symbol, 'horizon': horizon, 'objective': objective, 'status': 'unavailable'})
            continue
        directory = study/symbol/horizon
        dataset_fingerprint = json.loads((directory/'header.json').read_text(encoding='utf-8'))['datasetFingerprint']
        rows = {r['trial']['id']: r for r in read_rows(directory)}
        candidate = entry['evaluation']['candidate']; row = rows[candidate]
        evidence = objective_evidence(row)
        prior_id = old_by_pair[symbol, horizon, objective]['evaluation']['candidate']
        prior = rows[prior_id]
        replay_file = replay_output/f'{symbol}-{horizon}.json'
        replay = json.loads(replay_file.read_text(encoding='utf-8')) if replay_file.exists() else None
        if replay:
            replay_metadata[f'{symbol}/{horizon}'] = {k: v for k, v in replay.items() if k != 'models'}
        value = {'symbol': symbol, 'horizon': horizon, 'objective': objective, 'status': 'best_available_experimental',
            'independentlyFutureValidated': False, 'selectedAlgorithm': row['trial']['algorithm'], 'candidateId': candidate,
            'artifactSha256': row['artifact']['sha256'], 'sourceEvidenceSha256': sha256(directory/f'{candidate}.json'),
            'datasetFingerprint': dataset_fingerprint,
            'selectionReason': f'lowest development {evidence["primaryMetric"]}; secondary metric, simplicity and ID resolve 12-decimal ties; no performance activation gate',
            'previousCandidate': prior_id, 'changedFromPreviousPolicy': candidate != prior_id,
            'comparison': evidence,
            'historicalStatisticalEvidence': {'metric': 'logLoss' if objective == 'direction' else 'qlike',
                'evidence': row['evidence'], 'note': 'original approximate repeated-comparison evidence; not a new MAE confidence assessment'},
            'replay': matching_replay(row, replay, (symbol, horizon) in completed, dataset_fingerprint)}
        entries.append(value)
        if objective == 'volatility':
            previous_evidence = objective_evidence(prior)
            change = {'symbol': symbol, 'horizon': horizon, 'previousCandidate': prior_id, 'selectedCandidate': candidate,
                'previousAlgorithm': prior['trial']['algorithm'], 'selectedAlgorithm': row['trial']['algorithm'],
                'changed': candidate != prior_id, 'previous': previous_evidence, 'selected': evidence,
                'maeImprovementVsPrevious': relative_improvement(row['metrics']['mae'], prior['metrics']['mae']),
                'qlikeChangeVsPrevious': row['metrics']['qlike']-prior['metrics']['qlike'],
                'lastFoldPreviousReplay': matching_replay(prior, replay, (symbol, horizon) in completed, dataset_fingerprint)}
            changes.append(change)
    prices = json.loads(Path(price_study).read_text(encoding='utf-8'))
    by_pair = {(r['symbol'], r['horizon']): r for r in prices}
    for entry in manifest['prices']:
        if entry['horizon'] == '1M' or entry['status'] != 'experimental':
            continue
        report = by_pair[entry['symbol'], entry['horizon']]
        candidate = report['candidates'][entry['algorithm']]
        baseline = report['candidates']['naive']['validation']
        comparison = {'primaryMetric': 'returnRmse', 'model': candidate['validation'], 'baseline': baseline,
            'relativePrimaryImprovement': relative_improvement(candidate['validation']['returnRmse'], baseline['returnRmse']),
            'beatsBaseline': candidate['validation']['returnRmse'] < baseline['returnRmse'],
            'folds': candidate['walkForward'], 'samples': sum(f['evaluationSamples'] for f in candidate['walkForward']),
            'startMs': min(f['evaluationSourceStart'] for f in candidate['walkForward']),
            'endMs': max(f['evaluationTargetEnd'] for f in candidate['walkForward'])}
        entries.append({'symbol': entry['symbol'], 'horizon': entry['horizon'], 'objective': 'price',
            'candidateId': entry['algorithm'], 'selectedAlgorithm': entry['algorithm'], 'artifactSha256': entry['artifactSha256'],
            'status': 'best_available_experimental', 'independentlyFutureValidated': False, 'changedFromPreviousPolicy': False,
            'selectionReason': 'lowest development return RMSE; holdout excluded', 'comparison': comparison,
            'replay': None, 'replayLimitation': 'deployment refit can include development dates; never rescore it on those dates'})
    pilot_path = replay_output/'BTCUSDT-1m-pilot.json'
    pilot_seconds = json.loads(pilot_path.read_text(encoding='utf-8'))['seconds'] if pilot_path.exists() else 0
    summary = {'volatilityPairs': len(changes), 'changedVolatilityModels': sum(c['changed'] for c in changes),
        'meanRelativeMaeImprovementVsPrevious': float(np.mean([c['maeImprovementVsPrevious'] for c in changes])),
        'medianRelativeMaeImprovementVsPrevious': float(np.median([c['maeImprovementVsPrevious'] for c in changes])),
        'qlikeWorsePairs': sum(c['qlikeChangeVsPrevious'] > 1e-10 for c in changes),
        'selectedVolatilityBeatsBaselineMae': sum(c['selected']['beatsBaseline'] is True for c in changes),
        'previousVolatilityBeatsBaselineMae': sum(c['previous']['beatsBaseline'] is True for c in changes),
        'replaysCompleted': sum(r['status'] == 'completed' for r in execution),
        'replaysIncomplete': [r for r in execution if r['status'] != 'completed'],
        'measuredReplaySeconds': sum(r.get('seconds', 0) for r in execution), 'pilotSeconds': pilot_seconds,
        'sampledPeakReplayRssMiB': max((r.get('sampledPeakRssMiB', 0) for r in replay_metadata.values()), default=None),
        'newCandidateFits': 0, 'holdoutUsedForSelectionOrReplay': False}
    stability = stability_summary(entries)
    result = {'version': 'selection-quality-v1', 'policy': POLICY, 'protocol': json.loads(REVIEW.read_text(encoding='utf-8')),
        'sourceFingerprints': {'previousManifest': sha256(previous), 'currentManifest': sha256('ml/artifacts/local/selection.json'),
            'currentManifestCanonical': digest(manifest), 'previousManifestCanonical': digest(old),
            'researchProtocol': sha256(study/'protocol.json'), 'reviewCode': sha256(Path(__file__)),
            'metricsCode': sha256(Path(__file__).with_name('evidence_metrics.py'))},
        'summary': summary, 'stability': stability, 'volatilityComparison': changes, 'objectives': entries,
        'replayMetadata': replay_metadata, 'replayExecution': execution,
        'leakageAudit': {'features': 'past-only finite windows; future/peer mutation and tail-parity regression tests',
            'targets': 'strictly future returns and squared minute returns; target boundary tests retained',
            'scaling': 'training-only learned preprocessing stored in checksum-verified artifacts',
            'folds': 'purged train/calibration/validation; nonoverlapping evaluation origins; replay checks original origin hashes',
            'crossAsset': 'exact UTC joins with full one-minute peer lag; no forward/asof join',
            'candleIntegrity': 'original manifest SHA checks, duplicate/gap/nonfinite and incomplete-candle guards retained',
            'coverageBugFixed': 'last-fold interval radius now uses matching last-fold coverage, not pooled coverage',
            'priceReplayForbidden': True,
            'limits': 'thinned UTC phase grid, calibration/market drift, inspected history; no independent future validation'}}
    output.mkdir(parents=True, exist_ok=True)
    # Reviewable report bytes are independent of Windows newline translation.
    (output/'evidence.json').write_bytes(json.dumps(result, sort_keys=True, indent=2, allow_nan=False).encode('utf-8'))
    lines = ['# MAE-first selection and stability review', '',
        'Existing trained artifacts, chronological development evidence only. No candidate refitting or new activation gates.',
        '[Machine-readable metrics, baselines, folds, uncertainty, regimes and tails](evidence.json).', '',
        f'Volatility selections changed: {summary["changedVolatilityModels"]}/24. Mean pairwise MAE reduction: {summary["meanRelativeMaeImprovementVsPrevious"]:.2%}; median: {summary["medianRelativeMaeImprovementVsPrevious"]:.2%}.',
        f'QLIKE worsened in {summary["qlikeWorsePairs"]}/24 pairs. MAE baseline wins: {summary["previousVolatilityBeatsBaselineMae"]} → {summary["selectedVolatilityBeatsBaselineMae"]}/24.', '',
        'Positive MAE improvement means lower error. Positive QLIKE change means worse QLIKE; negative absolute QLIKE values are not converted into percentage improvements.',
        'Baseline is the same original calibration-selected comparator for before/after; its volatility choice used QLIKE. Every other baseline and fold is also reported. It is not an MAE-optimized comparator.', '',
        '| Coin | Horizon | Previous QLIKE-first | New MAE-first | Old MAE | New MAE | Baseline MAE | MAE reduction vs old | New vs baseline | Old QLIKE | New QLIKE | Baseline QLIKE |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|']
    for c in changes:
        a, b = c['previous'], c['selected']
        lines.append(f'| {c["symbol"]} | {c["horizon"]} | {c["previousCandidate"]} | {c["selectedCandidate"]} | {a["model"]["mae"]:.7f} | {b["model"]["mae"]:.7f} | {b["baseline"]["mae"]:.7f} | {c["maeImprovementVsPrevious"]:.2%} | {b["relativePrimaryImprovement"]:.2%} | {a["model"]["qlike"]:.5f} | {b["model"]["qlike"]:.5f} | {b["baseline"]["qlike"]:.5f} |')
    lines += ['', '## Scope and limitations', '',
        'All three original folds provide baseline-relative aggregate and fold diagnostics. Nonlinear metrics such as MCC/ECE are never synthesized by averaging folds. RMSE is pooled through squared loss.',
        'Regime thresholds come only from fitting data. Event-tail slices are ex-post descriptive diagnostics, never origin-known features or new gates.',
        'Only the original last development fold can be replayed with saved direction/volatility weights. Earlier fold weights/predictions were not saved. Price deployment refits can contain development dates, so only recorded price walk-forward scores are used.',
        'The fixed original momentum baseline is reconstructed on its original training/calibration rows; candidate models are never refitted. Native replay scores and origin hashes are checked against the original evidence.',
        f'Replays completed: {summary["replaysCompleted"]}/24; incomplete attempts remain in JSON. Measured subprocess time {summary["measuredReplaySeconds"]:.1f}s plus pilot {pilot_seconds:.1f}s against a 600s budget.',
        'The last-fold interval uses its matching measured last-fold coverage. Aggregate cross-fold coverage/width are separate historical diagnostics. Wide/coverage flags do not block forecasts.',
        'MAE improvements reuse development evidence and are not independent confirmation. No claim of future profitability follows. Source data, original reports, weights, daily operations and local startup are preserved.']
    (output/'COMPARISON.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    text = ['# Development stability and leakage review', '',
        '[All per-model scores, regimes, event tails and reliability bins](evidence.json).', '',
        'These are descriptive development diagnostics. They do not establish independent validation, trading profit or a new activation gate.', '',
        '## Fold and regime consistency', '',
        '| Objective | Wins in all three folds | Last-fold low-volatility wins | Medium wins | High wins |',
        '|---|---|---|---|---|']
    for objective in ('direction', 'volatility'):
        s = stability[objective]; g = s['regimeWinsAndLosses']
        text.append(f'| {objective} | {s["foldWinHistogram"].get("3", 0)}/24 | {g.get("lowWin", 0)}/24 | {g.get("mediumWin", 0)}/24 | {g.get("highWin", 0)}/24 |')
    text += ['', 'Regime cuts use each fitted model’s training-only past-variance quantiles. Model/baseline comparisons share the same regime mask; regime cuts can differ between models/windows, so regime counts are not a direct old/new causal comparison.', '',
        '## Sensitivity to large moves', '']
    for objective in ('direction', 'volatility'):
        s = stability[objective]; share = s['topRealizedVolatilityOnePercentModelLossShareRange']
        if share:
            text.append(f'- {objective}: the largest realized-volatility 1% of observations account for {share[0]:.2%}–{share[1]:.2%} of primary loss. Removing them reverses a last-fold baseline win in: {", ".join(s["baselineWinReversedAfterRemovingLargestRealizedVolatilityOnePercent"]) or "none"}.')
    text += ['', 'The JSON also slices absolute net returns and the largest absolute paired-loss contributions. Exact top ceil(n/100) counts and stable sorting avoid ambiguous quantile ties. These ex-post event labels are never used as prediction features.', '',
        '## Uncertainty', '', '| Horizon | Very wide volatility intervals | Coverage >5 percentage points from 90% | Observed last-fold coverage range |', '|---|---|---|---|']
    for h, interval in stability['volatilityIntervals'].items():
        bounds = interval['coverageRange']
        if bounds:
            text.append(f'| {h} | {interval["widePairs"]}/8 | {interval["coverageDeviationPairs"]}/8 | {bounds[0]:.1%}–{bounds[1]:.1%} |')
    text += ['', 'Very wide means median interval width exceeds ten times forecast volatility, a descriptive flag. Minute zero-return observations combined with the log-sigma floor can create enormous bands with plausible coverage but little precision. Widths remain volatility units, never price ranges.',
        'Direction reports preserve pooled classwise reliability/ECE, calibrated Log Loss/Brier/BA/MCC, fold calibration scores and normalization checks. Historical calibration does not guarantee current accuracy.', '',
        'In original fold records, calibration temperature/sample count describe the preceding calibration fit; rawEce/calibratedEce under that object describe validation quality, not fit-window accuracy. The separate rawMetrics field also refers to validation.', '',
        '## Leakage audit and limits', '',
        '- Target alignment, past-only feature mutation, exact one-minute peer lag, bounded history parity, scaler isolation, completed candles and duplicate/gap/nonfinite rejection remain covered by regression tests.',
        '- Replay uses original origin fingerprints, purged training/calibration boundaries and nonoverlapping horizon returns. Adjacent return intervals can share an endpoint without sharing an increment.',
        '- Feature construction for this replay stops before 2026-09-02 UTC. Selection and additional scoring do not use final holdout performance.',
        '- Price deployment refits can contain development observations. Replaying those artifacts on development dates would leak training information; recorded walk-forward scores are retained instead.',
        '- Fixed UTC phase thinning, only 84 development days, post-selection optimism, drift and unavailable earlier-fold weights limit inference. Last-fold event diagnostics have only 28 days.',
        '- The genuine interval-reporting mismatch is fixed: last-fold radius pairs with last-fold coverage; aggregate cross-fold coverage is separate.', '',
        '## Further experiments', '',
        'Existing feature ablations select different groups by asset/horizon; they do not justify a universal indicator removal. Prior small regularization gains and unstable regime/event results do not justify another broad search. No new candidate fitting was run. Next research should pre-register zero-aware volatility calibration and prospective regime/phase coverage, with fresh evaluation data and a fixed budget.', '',
        'Primary references: [loss metrics](https://scikit-learn.org/stable/modules/model_evaluation.html#mean-absolute-error), [probability calibration](https://scikit-learn.org/stable/modules/calibration.html).']
    (output/'STABILITY.md').write_text('\n'.join(text)+'\n', encoding='utf-8')
    return result
