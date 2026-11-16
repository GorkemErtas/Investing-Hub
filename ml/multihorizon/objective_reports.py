"""Portable research evidence and bounded explanations; never publishes accepted predictions."""
import json
import time
from pathlib import Path
import numpy as np
from threadpoolctl import threadpool_limits
from .data import SYMBOLS, digest, save_json, sha256
from .features import HORIZONS
from .objective_registry import research_candidate, catalog_from_study
from .objective_research import (PROTOCOL, trial_matrix, prepare_pair, folds, training_rows,
                                inputs, direction_baselines, volatility_baselines)
from .objective_models import predict_direction, predict_volatility
from .objective_statistics import direction_metrics, volatility_metrics


def brief_metrics(value):
    fields = ('logLoss', 'brier', 'balancedAccuracy', 'mcc', 'accuracy', 'ece', 'classCounts',
              'mae', 'rmse', 'qlike', 'zeroVarianceFraction', 'intervalCoverage', 'meanIntervalWidth')
    return {k: value[k] for k in fields if k in value}


def save_portable_evidence(path, value):
    """Byte-stable JSON for Git-reviewed checksums, independent of host newlines."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json.dumps(value, sort_keys=True, indent=2, allow_nan=False).encode('utf-8'))


def explain_pair(study, symbol, horizon, protocol, maximum_seconds):
    started = time.perf_counter()
    pair = Path(study)/symbol/horizon
    frame, rich, groups, target, valid, _ = prepare_pair('ml/data/normalized-v2', symbol, horizon)
    rows = [json.loads(p.read_text(encoding='utf-8')) for p in pair.glob('*.json')
            if not p.name.endswith('-artifact.json') and p.name not in ('header.json', 'complete.json', 'explanation.json')]
    ids = {'neutral-logistic_rich', 'rich-rv-all'}
    for objective in ('direction', 'volatility'):
        candidate = research_candidate(rows, objective)
        if candidate and candidate.get('developmentEligible') and candidate.get('artifact'):
            ids.add(candidate['trial']['id'])
    plan = folds(target, valid, protocol, HORIZONS[horizon])
    val, cal = plan[-1]['validation'], plan[-1]['calibration']
    result = {'method': 'last development fold, one/three/seven-day circular group shifts; descriptive model reliance, correlated-feature caveat', 'models': {}}
    for row in rows:
        if row.get('status') != 'completed' or row['trial']['id'] not in ids or not row.get('artifact'):
            continue
        if time.perf_counter()-started > maximum_seconds:
            result['unexecuted'] = 'explanation_resource_budget'
            break
        artifact_path = pair/row['artifact']['file']
        if sha256(artifact_path) != row['artifact']['sha256']:
            raise ValueError('explanation_artifact_checksum')
        artifact = json.loads(artifact_path.read_text(encoding='utf-8'))
        columns = artifact['features']
        x = rich[columns].to_numpy(dtype=np.float32)
        lookback = row['trial'].get('lookback', 1)
        values = inputs(x, val, lookback)
        objective = row['trial']['objective']
        predict = predict_direction if objective == 'direction' else predict_volatility
        actual = target.neutral.iloc[val].to_numpy() if objective == 'direction' else target.variance.iloc[val].to_numpy()
        metric = direction_metrics if objective == 'direction' else volatility_metrics
        predicted = predict(artifact, values)
        score, loss = metric(actual, predicted)
        score.pop('reliability', None)
        model_result = {'metrics': score, 'permutation': {}}
        observations_per_day = max(1, int(round(86400000/np.median(np.diff(target.source_time.iloc[val])))))
        for group, names in groups.items():
            indices = [columns.index(n) for n in names if n in columns]
            if not indices:
                continue
            differences = []
            for days in (1, 3, 7):
                changed = values.copy()
                changed[..., indices] = np.roll(values[..., indices], observations_per_day*days, axis=0)
                _, altered_loss = metric(actual, predict(artifact, changed))
                differences.append(float(np.mean(altered_loss-loss)))
            model_result['permutation'][group] = {'lossIncrease': differences,
                'meanIncrease': float(np.mean(differences)), 'stdIncrease': float(np.std(differences))}
        train = training_rows(target, valid, plan[-1], row['trial'])
        base_train = training_rows(target, valid, plan[-1], {'algorithm': 'logistic', 'rows': 36000, 'days': 180})
        selected = row['folds'][-1]['selectedBaseline']
        if objective == 'direction':
            baseline, _ = direction_baselines(rich[['return_15']].to_numpy(), target, base_train, cal, val, 'neutral')
            base_predicted = baseline[selected]
            model_result['stability'] = {'classFlipRate': float(np.mean(np.diff(np.argmax(predicted, axis=1)) != 0)),
                'meanProbabilityChange': float(np.abs(np.diff(predicted, axis=0)).mean()),
                'meanNeutralProbability': float(predicted[:, 1].mean())}
            signed = actual != 1
            if signed.sum() > 100:
                conditional = predicted[signed][:, [0, 2]]
                conditional /= conditional.sum(axis=1, keepdims=True)
                signed_score, _ = direction_metrics((actual[signed] == 2).astype(int), conditional)
                signed_score.pop('reliability', None)
                model_result['signedNonneutralDiagnostic'] = signed_score
        else:
            base_predicted = volatility_baselines(target, base_train, HORIZONS[horizon])[selected][val]
            model_result['stability'] = {'forecastSigmaMean': float(np.sqrt(predicted).mean()),
                'meanAbsoluteSigmaChange': float(np.abs(np.diff(np.sqrt(predicted))).mean())}
        cutoffs = np.quantile(target.past_variance.iloc[train], [.33, .67])
        regimes = np.digitize(target.past_variance.iloc[val], cutoffs)
        model_result['regimes'] = {}
        for label in range(3):
            chosen = regimes == label
            if chosen.sum() < 10:
                continue
            measured, local_loss = metric(actual[chosen], predicted[chosen])
            baseline_score, baseline_loss = metric(actual[chosen], base_predicted[chosen])
            measured.pop('reliability', None); baseline_score.pop('reliability', None)
            model_result['regimes'][str(label)] = {'samples': int(chosen.sum()), 'model': measured, 'baseline': baseline_score,
                'meanLossImprovement': float(np.mean(baseline_loss-local_loss))}
        result['models'][row['trial']['id']] = model_result
    result['seconds'] = time.perf_counter()-started
    save_json(pair/'explanation.json', result)
    return result


def export_objective_report(study, output, *, explain=False):
    study, output = Path(study), Path(output)
    protocol = json.loads((study/'protocol.json').read_text(encoding='utf-8'))
    matrix = trial_matrix(protocol)
    execution = json.loads((study/'execution.json').read_text(encoding='utf-8'))
    spent = sum(x.get('seconds', 0) for x in execution)
    pilot_path = Path('ml/artifacts/objectives-v1/execution.json')
    pilot = json.loads(pilot_path.read_text(encoding='utf-8')) if pilot_path.exists() and pilot_path.parent != study else []
    pilot_seconds = sum(x.get('seconds', 0) for x in pilot)
    pilot_trials = []
    for entry in pilot:
        for trial in matrix:
            path = pilot_path.parent/entry['symbol']/entry['horizon']/f'{trial["id"]}.json'
            row = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
            pilot_trials.append({'symbol': entry['symbol'], 'horizon': entry['horizon'], 'trial': trial['id'],
                'status': row['status'] if row else 'unexecuted_pair_budget',
                'evidenceSha256': sha256(path) if row else None,
                'source': row.get('code') if row else None, 'error': row.get('error') if row else None})
    explanations = 0.
    pairs, trial_count, failed = [], 0, []
    for symbol in SYMBOLS:
        for horizon in protocol['horizons']:
            directory = study/symbol/horizon
            header = json.loads((directory/'header.json').read_text(encoding='utf-8')) if (directory/'header.json').exists() else None
            records = []
            for trial in matrix:
                path = directory/f'{trial["id"]}.json'
                if path.exists():
                    row = json.loads(path.read_text(encoding='utf-8'))
                    row['evidenceSha256'] = sha256(path)
                else:
                    row = {'trial': trial, 'status': 'unexecuted', 'error': 'pair_or_total_resource_budget'}
                records.append(row)
                trial_count += 1
                if row['status'] != 'completed':
                    failed.append({'symbol': symbol, 'horizon': horizon, 'trial': trial['id'], 'status': row['status'], 'reason': row.get('error')})
            selected = {name: research_candidate(records, name) for name in ('direction', 'volatility')}
            explanation = None
            remaining = protocol['resourceBudget']['maxWallSeconds']-spent-pilot_seconds-explanations
            if explain and header and remaining >= 15:
                try:
                    with threadpool_limits(limits=1):
                        explanation = explain_pair(study, symbol, horizon, protocol,
                            protocol['resourceBudget']['maxWallSeconds']-spent-pilot_seconds-explanations)
                    explanations += explanation['seconds']
                except Exception as error:
                    explanation = {'failed': f'{type(error).__name__}: {error}'}
            elif (directory/'explanation.json').exists():
                explanation = json.loads((directory/'explanation.json').read_text(encoding='utf-8'))
                explanations += explanation['seconds']
            elif header:
                explanation = {'unexecuted': 'explanation_resource_budget'}
            compact, shared_windows = [], {}
            for row in records:
                reduced = {k: v for k, v in row.items() if k not in ('code', 'protocolFingerprint', 'dailyLossImprovement', 'folds')}
                if 'metrics' in row:
                    reduced['metrics'] = brief_metrics(row['metrics'])
                if 'folds' in row:
                    reduced['folds'] = []
                    for fold in row['folds']:
                        reference = f'{row["trial"].get("mode", "volatility")}/{fold["fold"]}'
                        shared = {k: fold[k] for k in ('calibrationRows', 'evaluationRows', 'calibrationSourceStart',
                            'calibrationTargetEnd', 'validationSourceStart', 'validationTargetEnd', 'originFingerprint', 'selectedBaseline')}
                        shared['baselines'] = {n: {k: v for k, v in brief_metrics(m).items() if k in ('logLoss', 'brier', 'balancedAccuracy', 'mcc', 'mae', 'qlike')}
                                               for n, m in fold['baselines'].items()}
                        if reference in shared_windows and shared_windows[reference] != shared:
                            raise ValueError('candidate_baselines_or_origins_not_identical')
                        shared_windows[reference] = shared
                        f = {k: fold[k] for k in ('fold', 'trainRows', 'trainSourceStart', 'trainTargetEnd', 'calibration', 'fitSeconds')}
                        f['evaluationRef'] = reference
                        f['metrics'] = brief_metrics(fold['metrics'])
                        f['trainingDiagnostic'] = brief_metrics(fold['trainingDiagnostic'])
                        f['rawValidationMetrics'] = brief_metrics(fold['rawMetrics'])
                        reduced['folds'].append(f)
                    costs = [f['metrics'].get('costDiagnostic') for f in row['folds']]
                    if costs and all(costs):
                        reduced['costDiagnostic'] = {'costPerTurnover': .0012,
                            'turnover': sum(c['turnover'] for c in costs),
                            'nonzeroDecisions': sum(c['nonzeroDecisions'] for c in costs),
                            'netReturnSum': sum(c['netReturnSum'] for c in costs),
                            'note': 'nonoverlapping sampled decisions; includes fold-end liquidation; not executable trading profit'}
                compact.append(reduced)
            decisions = {name: None if row is None else {'candidate': row['trial']['id'], 'metrics': row['metrics'],
                'baselineRelativeImprovement': row['baselineRelativeImprovement'], 'evidence': row['evidence'],
                'developmentEligible': row['developmentEligible'], 'productionAccepted': False,
                'reason': row['reason'], 'allFoldsWin': row['allFoldsWin'], 'calibrationPass': row['calibrationPass']}
                for name, row in selected.items()}
            pairs.append({'symbol': symbol, 'horizon': horizon, 'header': header, 'trials': compact,
                          'sharedEvaluationWindows': shared_windows, 'decisions': decisions, 'explanation': explanation})
    evidence = {'version': 'objective-evidence-v1', 'protocol': protocol, 'protocolFingerprint': digest(protocol),
        'pairs': pairs, 'execution': execution, 'plannedConfigurations': trial_count,
        'incompleteOrFailed': failed, 'measuredStudySeconds': spent, 'explanationSeconds': explanations,
        'engineeringPilot': {'execution': pilot, 'trials': pilot_trials, 'seconds': pilot_seconds,
            'note': 'same fixed model configurations; first pair hit 180s before baseline-calculation caching; preserved separately and excluded from model ranking'},
        'resourceAccounting': {'registeredExperimentSeconds': protocol['resourceBudget']['maxWallSeconds'],
            'measuredFitPilotAndExplanationSeconds': spent+pilot_seconds+explanations,
            'reportBatchOverrunSeconds': max(0., spent+pilot_seconds+explanations-protocol['resourceBudget']['maxWallSeconds']),
            'note': 'original optional explanation guard checked between model batches; a 15-second admission margin now prevents starting another batch near the cap; no additional model fitting was performed'},
        'productionAcceptedObjectives': 0, 'futureConfirmationStatus': 'not_observed'}
    # Keep individual pair evidence reviewable; the index fingerprints every file.
    index = {k: v for k, v in evidence.items() if k != 'pairs'}
    index['pairs'] = []
    for pair in pairs:
        relative = Path('pairs')/f'{pair["symbol"]}-{pair["horizon"]}.json'
        save_portable_evidence(output/relative, pair)
        index['pairs'].append({'symbol': pair['symbol'], 'horizon': pair['horizon'],
            'file': relative.as_posix(), 'sha256': sha256(output/relative), 'decisions': pair['decisions']})
    save_portable_evidence(output/'evidence.json', index)
    catalog_from_study(study, output/'decisions.json')
    lines = ['# Direction and volatility benchmark — Phase 2', '',
        'All values below come from the supplied historical Binance minute dataset. Historical development evidence is not final confirmation.',
        '[Full metrics, calibration reliability, trials, failures, ablations and source hashes](evidence.json).',
        '[Registered matrix](../../multihorizon/objective_study.json). Original price-regression evidence is preserved unchanged.', '',
        f'Planned configurations: {trial_count}; completed: {trial_count-len(failed)}; failed/unexecuted: {len(failed)}.',
        f'Measured study time: {spent:.1f}s; explanation time: {explanations:.1f}s; earlier engineering pilot: {pilot_seconds:.1f}s. Production activation: **none**.', '',
        '## Per-symbol / per-horizon decisions', '',
        '| Coin | Horizon | Direction candidate | Log-loss improvement | Balanced accuracy / MCC | ECE | Direction development gate | Volatility candidate | MAE improvement | Coverage | Volatility development gate |',
        '|---|---|---|---|---|---|---|---|---|---|---|']
    for pair in pairs:
        d, v = pair['decisions']['direction'], pair['decisions']['volatility']
        if d and v:
            lines.append(f'| {pair["symbol"]} | {pair["horizon"]} | {d["candidate"]} | {d["baselineRelativeImprovement"]:.2%} | {d["metrics"]["balancedAccuracy"]:.3f} / {d["metrics"]["mcc"]:.3f} | {d["metrics"]["ece"]:.3f} | {"pass" if d["developmentEligible"] else "fail"} | {v["candidate"]} | {v["baselineRelativeImprovement"]:.2%} | {v["metrics"].get("intervalCoverage", 0):.1%} | {"pass" if v["developmentEligible"] else "fail"} |')
    lines += ['', '**Every objective remains unavailable in live inference until independent future confirmation.**',
        'All eight 1M horizons remain unavailable. A historical development pass is not production acceptance.', '',
        '## Feature ablations', '',
        'Positive loss increase after removal means the group helped that fixed model; negative means removal helped.',
        'Direction uses the fixed neutral rich logistic reference. Volatility uses a fixed rich log-RV Ridge reference.', '',
        '| Group removed | Mean direction log-loss change | Mean volatility MAE change |', '|---|---|---|']
    for group in protocol['ablations']:
        changes = {'direction': [], 'volatility': []}
        for pair in pairs:
            rows = {r['trial']['id']: r for r in pair['trials'] if r['status'] == 'completed'}
            for objective, reference, removed, metric in [('direction', 'neutral-logistic_rich', f'neutral-ablate-{group}', 'logLoss'),
                                                       ('volatility', 'rich-rv-all', f'rich-rv-{group}', 'mae')]:
                if reference in rows and removed in rows:
                    changes[objective].append(rows[removed]['metrics'][metric]/rows[reference]['metrics'][metric]-1)
        lines.append(f'| {group} | {np.mean(changes["direction"]):.3%} | {np.mean(changes["volatility"]):.3%} |')
    lines += ['', '## Every fixed trial / hyperparameter comparison', '',
        '| Pair | Configuration | Status | Baseline-relative improvement | Primary loss | Calibration | Fit+evaluation s | RSS MiB | Numeric inference ms |',
        '|---|---|---|---|---|---|---|---|---|']
    for pair in pairs:
        for row in pair['trials']:
            if row['status'] != 'completed':
                lines.append(f'| {pair["symbol"]}/{pair["horizon"]} | {row["trial"]["id"]} | {row["status"]} | — | — | — | — | — | — |')
                continue
            primary = row['metrics']['logLoss' if row['trial']['objective'] == 'direction' else 'mae']
            lines.append(f'| {pair["symbol"]}/{pair["horizon"]} | {row["trial"]["id"]} | completed | {row["baselineRelativeImprovement"]:.2%} | {primary:.6g} | {row["calibrationPass"]} | {row["durationSeconds"]:.2f} | {row["processPeakRssMiB"]:.1f} | {(row.get("artifact") or {}).get("numericInferenceMedianMs", 0):.3f} |')
    lines += ['', '## Interpretation and limits', '',
        'Three-class direction includes origin-known neutral movements. Improved neutral-class log loss alone',
        'does not establish profitable signed direction; inspect binary controls, conditional signed diagnostics,',
        'classwise reliability, MCC and cost diagnostics. Hard majority accuracy is insufficient.',
        'Volatility forecasts measure square-root future realized variance, not signed returns or future prices.',
        'QLIKE is log(forecast variance)+actual variance/forecast variance; differences are meaningful even when absolute loss is negative.',
        'Intervals use separate past calibration and observed validation coverage. Serial dependence invalidates iid coverage guarantees.',
        'Seven-day descriptive bootstrap intervals and HAC/Bonferroni lower bounds are approximate; 912 planned/prior hypotheses are counted.',
        'No gate was relaxed. The 1% price-regression gate remains unchanged and no new price model was activated.',
        'The old inspected holdout is development history. 2026-12-01 through 2027-02-28 UTC is reserved and not yet observed.',
        'GARCH is research-only until its ongoing variance state has a validated bounded recovery path.',
        'Numeric latency excludes feature/provider cost. RSS includes Python/library/data memory. No Railway sizing claim is inferred.',
        'Optional explanations may be partial at the combined resource cap; exact measured overrun/accounting is recorded in evidence.json.',
        'Failed and unexecuted configurations remain explicit in JSON. No raw CSV/Parquet/model weights are committed.']
    output.mkdir(parents=True, exist_ok=True)
    (output/'RESULTS.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    return evidence
