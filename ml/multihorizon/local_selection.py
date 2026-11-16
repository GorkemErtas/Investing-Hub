"""Local experimental selection from frozen development evidence; never fits a model."""
import json
import math
import shutil
from pathlib import Path
import numpy as np
from .data import SYMBOLS, MINUTE, digest, load_symbol, save_json, sha256
from .features import FEATURES, FEATURE_VERSION, HORIZONS
from .objective_features import OBJECTIVE_FEATURE_VERSION
from .objective_registry import objective_unavailable
from .evidence_metrics import runtime_evaluation, finite

POLICY = 'local-development-ranking-v2-mae-first'
ORDER = {'logistic': 0, 'ridge': 0, 'har_rv': 0, 'random_forest': 1,
         'hist_gradient_boosting': 2, 'lightgbm': 3, 'xgboost': 4, 'lstm': 5}


def rank_objectives(rows, objective, *, volatility_primary='mae'):
    """No holdout, significance, fold-win, improvement or future-confirmation inputs."""
    if volatility_primary not in ('mae', 'qlike'):
        raise ValueError('unsupported_volatility_selection_metric')
    primary, secondary = ('logLoss', 'brier') if objective == 'direction' else (volatility_primary, 'qlike' if volatility_primary == 'mae' else 'mae')
    eligible = [r for r in rows if r.get('status') == 'completed' and
        r['trial']['objective'] == objective and r.get('artifact') and
        (objective != 'direction' or r['trial'].get('mode') == 'neutral') and
        all(finite(r['metrics'].get(k)) and (k == 'qlike' or r['metrics'][k] >= 0) for k in (primary, secondary))]
    return sorted(eligible, key=lambda r: (round(r['metrics'][primary], 12),
        round(r['metrics'][secondary], 12), ORDER.get(r['trial']['algorithm'], 99), r['trial']['id']))


def verified_copy(source, expected, destination):
    source, destination = Path(source), Path(destination)
    if source.stat().st_size > 2*1024*1024 or sha256(source) != expected:
        raise ValueError('artifact_checksum_or_size')
    artifact = json.loads(source.read_text(encoding='utf-8'))
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists() or sha256(destination) != expected:
        shutil.copyfile(source, destination)  # Preserve exact trained bytes and checksum.
    return artifact


def risk_thresholds(frame, row, horizon):
    """Descriptive quantiles on the last fold's fitting targets only, never validation."""
    fold = row['folds'][-1]
    variance = np.log(frame.close).diff().pow(2).rolling(horizon).sum().shift(-horizon)
    chosen = np.flatnonzero((frame.close_time >= fold['trainSourceStart']) &
        (frame.close_time+horizon*MINUTE <= fold['trainTargetEnd']) & variance.notna())
    if len(chosen) > fold['trainRows']:
        chosen = chosen[np.linspace(0, len(chosen)-1, fold['trainRows'], dtype=int)]
    if len(chosen) < 100:
        return None
    return np.quantile(np.sqrt(variance.iloc[chosen]), [.33, .67]).tolist()


def last_fold_interval_calibration(row):
    if not row.get('folds'):
        return None
    fold = row['folds'][-1]
    calibration, coverage = fold.get('calibration', {}), fold.get('metrics', {}).get('intervalCoverage')
    radius, samples = calibration.get('radius'), calibration.get('samples', 0)
    if (calibration.get('method') != 'past_split_conformal_log_sigma' or not finite(radius) or radius < 0 or
            not finite(coverage) or not 0 <= coverage <= 1 or samples <= 0):
        return None
    return {'radius': radius, 'measuredCoverage': coverage, 'samples': samples}


def build_local_objectives(study, destination, dataset):
    study, destination = Path(study), Path(destination)
    entries, selections = [], []
    for symbol in SYMBOLS:
        frame = None
        try:
            frame, _ = load_symbol(dataset, symbol)
        except (OSError, ValueError, KeyError):
            pass  # Weights still support inference; only historical risk categories need raw data.
        for horizon in HORIZONS:
            directory = study/symbol/horizon
            rows = []
            for path in sorted(directory.glob('*.json')):
                if path.name.endswith('-artifact.json'):
                    continue
                try:
                    value = json.loads(path.read_text(encoding='utf-8'))
                except (OSError, ValueError):
                    continue
                if 'trial' in value:
                    rows.append(value)
            objectives = {}
            for objective in ('direction', 'volatility'):
                reason = 'monthly_insufficient_independent_outcomes' if horizon == '1M' else 'local_model_missing'
                objectives[objective] = objective_unavailable(reason)
                excluded = []
                for row in rank_objectives(rows, objective) if horizon != '1M' else []:
                    info, trial = row['artifact'], row['trial']
                    try:
                        source = (directory/info['file']).resolve()
                        if not source.is_relative_to(directory.resolve()):
                            raise ValueError('artifact_path')
                        relative = f'{symbol}-{horizon}-{objective}-{info["sha256"][:16]}.json'
                        artifact = verified_copy(source, info['sha256'], destination.parent/relative)
                        if artifact['schema'] != OBJECTIVE_FEATURE_VERSION or artifact['objective'] != objective or artifact['algorithm'] != trial['algorithm']:
                            raise ValueError('artifact_identity')
                        if objective == 'direction' and (artifact['classes'] != 3 or not math.isfinite(artifact['temperature']) or artifact['temperature'] <= 0):
                            raise ValueError('calibrated_three_class_artifact_required')
                        evaluation = runtime_evaluation(row)
                        item = {'status': 'experimental', 'reason': 'local_experimental_development_selection',
                            'modelVersion': f'{symbol}-{horizon}-{trial["id"]}-{info["sha256"][:12]}',
                            'algorithm': trial['algorithm'], 'artifact': relative, 'artifactSha256': info['sha256'],
                            'evaluation': evaluation, 'selectionPolicy': POLICY,
                            'trainingTargetEnd': row['folds'][-1]['trainTargetEnd']}
                        if objective == 'volatility':
                            item['riskThresholds'] = risk_thresholds(frame, row, HORIZONS[horizon]) if frame is not None else None
                            item['intervalCalibration'] = last_fold_interval_calibration(row)
                        objectives[objective] = item
                        break
                    except (OSError, ValueError, KeyError, TypeError) as error:
                        excluded.append({'candidate': trial['id'], 'reason': type(error).__name__})
                selections.append({'symbol': symbol, 'horizon': horizon, 'objective': objective,
                    'status': objectives[objective]['status'], 'model': objectives[objective].get('modelVersion'),
                    'evaluation': objectives[objective].get('evaluation'), 'excludedInvalidArtifacts': excluded,
                    **{k: objectives[objective][k] for k in ('artifactSha256', 'trainingTargetEnd', 'riskThresholds', 'intervalCalibration')
                       if k in objectives[objective]}})
            entries.append({'symbol': symbol, 'horizon': horizon, 'objectives': objectives})
    payload = {'version': 'objective-registry-v1', 'selectionPolicy': POLICY, 'entries': entries}
    save_json(destination, {'payload': payload, 'sha256': digest(payload)})
    return selections


def rank_prices(report):
    return sorted((name for name, c in report['candidates'].items() if name != 'naive' and
        c['status'] == 'ok' and name in report['artifacts'] and finite(c.get('validation', {}).get('returnRmse')) and c['validation']['returnRmse'] >= 0),
        key=lambda name: (round(report['candidates'][name]['validation']['returnRmse'], 12), ORDER.get(name, 99), name))


def build_local_prices(study, destination):
    """Rank validation RMSE only; held-out values are copied solely for disclosure."""
    study, destination = Path(study), Path(destination)
    reports = json.loads(study.read_text(encoding='utf-8')) if study.is_file() else []
    by_pair = {(r['symbol'], r['horizon']): r for r in reports}
    entries, selections = [], []
    for symbol in SYMBOLS:
        for horizon in HORIZONS:
            item = {'symbol': symbol, 'horizon': horizon, 'status': 'unavailable', 'algorithm': None,
                'modelVersion': None, 'reason': 'monthly_insufficient_independent_outcomes' if horizon == '1M' else 'local_model_missing'}
            report = by_pair.get((symbol, horizon))
            excluded = []
            if report and horizon != '1M':
                for name in rank_prices(report):
                    info = report['artifacts'][name]
                    source = Path(info['path'])
                    if not source.is_file():
                        source = study.parent/symbol/horizon/report['runId']/f'{name}.json'
                    relative = f'{symbol}-{horizon}-price-{info["sha256"][:16]}.json'
                    try:
                        artifact = verified_copy(source, info['sha256'], destination.parent/relative)
                        if artifact['schema'] != FEATURE_VERSION or artifact['features'] != list(FEATURES) or artifact['algorithm'] != name:
                            raise ValueError('price_artifact_identity')
                        c = report['candidates'][name]
                        item.update(status='experimental', reason='local_experimental_development_selection', algorithm=name,
                            modelVersion=info['modelVersion'], artifact=relative, artifactSha256=info['sha256'],
                            featureSchema=FEATURE_VERSION, datasetFingerprint=report['datasetFingerprint'],
                            trainingPeriod=info['trainingPeriod'], selectionPolicy=POLICY,
                            evaluationMetrics={'validationReturnRmse': c['validation']['returnRmse'],
                                'baselineValidationReturnRmse': report['candidates']['naive']['validation']['returnRmse'],
                                **({'validationReturnMae': c['validation']['returnMae']} if 'returnMae' in c['validation'] else {}),
                                **({'baselineValidationReturnMae': report['candidates']['naive']['validation']['returnMae']} if 'returnMae' in report['candidates']['naive']['validation'] else {}),
                                'holdoutReturnRmse': c['holdout']['metrics']['returnRmse'],
                                'baselineHoldoutReturnRmse': c['holdout']['baseline']['returnRmse'],
                                'holdoutDirectionalAccuracy': c['holdout']['metrics']['directionalAccuracy']})
                        break
                    except (OSError, ValueError, KeyError) as error:
                        excluded.append({'candidate': name, 'reason': type(error).__name__})
                        continue
            entries.append(item)
            selections.append({**{k: item.get(k) for k in ('symbol', 'horizon', 'status', 'algorithm', 'modelVersion', 'evaluationMetrics', 'artifactSha256', 'trainingPeriod')},
                'baselineValidationReturnRmse': report['candidates']['naive']['validation']['returnRmse'] if report else None,
                'excludedInvalidArtifacts': excluded})
    payload = {'version': 'forecast-registry-v2', 'selectionPolicy': POLICY, 'entries': entries}
    save_json(destination, {'payload': payload, 'sha256': digest(payload)})
    return selections


def prepare_local(study, price_study, dataset, output):
    output = Path(output)
    objectives = build_local_objectives(study, output/'objectives.json', dataset)
    prices = build_local_prices(price_study, output/'prices.json')
    result = {'policy': POLICY, 'selectionUsesHoldout': False, 'objectives': objectives, 'prices': prices}
    save_json(output/'selection.json', result)
    return result
