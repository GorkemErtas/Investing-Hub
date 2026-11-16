"""Loss aggregation and transparent baseline comparisons, with no model fitting."""
import math
from datetime import datetime, timezone


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def relative_improvement(model, baseline):
    """Positive means lower loss; a zero/missing/nonpositive denominator is undefined."""
    return 1-model/baseline if finite(model) and finite(baseline) and baseline > 0 else None


def aggregate_metrics(folds, source):
    """Pool additive losses by scored rows, RMSE by squared loss. Never average MCC/ECE."""
    result = {}
    keys = ('mae', 'rmse', 'qlike', 'logLoss', 'brier', 'returnMae', 'returnRmse', 'priceMae',
            'priceRmse', 'intervalCoverage', 'meanIntervalWidth', 'zeroVarianceFraction')
    for key in keys:
        values = [(source(f).get(key), f.get('evaluationRows', f.get('evaluationSamples', 0))) for f in folds]
        if not values or not all(finite(v) and n > 0 for v, n in values):
            continue
        squared = key.lower().endswith('rmse')
        total = sum(n for _, n in values)
        mean = sum((v*v if squared else v)*n for v, n in values)/total
        result[key] = math.sqrt(mean) if squared else mean
    return result


def objective_evidence(row):
    objective = row['trial']['objective']
    metric = 'logLoss' if objective == 'direction' else 'mae'
    folds = row.get('folds', [])
    baseline = aggregate_metrics(folds, lambda f: f.get('baselines', {}).get(f.get('selectedBaseline'), {}))
    all_baselines = {}
    for name in sorted({n for f in folds for n in f.get('baselines', {})}):
        all_baselines[name] = aggregate_metrics(folds, lambda f: f.get('baselines', {}).get(name, {}))
    actual = row['metrics']
    improvement = relative_improvement(actual.get(metric), baseline.get(metric))
    comparison = {'primaryMetric': metric, 'model': actual, 'baseline': baseline,
        'baselinePolicy': 'original study: strongest simple baseline selected on preceding calibration; volatility baseline choice used QLIKE',
        'baselineNamesByFold': [f.get('selectedBaseline') for f in folds],
        'relativePrimaryImprovement': improvement,
        'beatsBaseline': actual[metric] < baseline[metric] if finite(baseline.get(metric)) else None,
        'qlikeImprovement': baseline['qlike']-actual['qlike'] if finite(baseline.get('qlike')) and finite(actual.get('qlike')) else None,
        'allBaselines': all_baselines,
        'samples': sum(f['evaluationRows'] for f in folds) if folds and all(f.get('evaluationRows', 0) > 0 for f in folds) else None,
        'startMs': min((f['validationSourceStart'] for f in folds if 'validationSourceStart' in f), default=None),
        'endMs': max((f['validationTargetEnd'] for f in folds if 'validationTargetEnd' in f), default=None),
        'folds': [{k: f[k] for k in ('fold', 'evaluationRows', 'trainRows', 'trainSourceStart', 'trainTargetEnd',
            'calibrationSourceStart', 'calibrationTargetEnd', 'validationSourceStart', 'validationTargetEnd',
            'selectedBaseline', 'originFingerprint', 'metrics', 'baselines', 'calibration', 'rawMetrics', 'volatilityRegimes') if k in f}
            for f in folds]}
    return comparison


def runtime_evaluation(row):
    evidence = objective_evidence(row)
    metric = row['metrics']
    result = {'period': 'development', 'candidate': row['trial']['id'], 'primaryLoss': metric[evidence['primaryMetric']],
        'baselineRelativeImprovement': evidence['relativePrimaryImprovement'],
        'calibrationError': metric.get('ece'), 'intervalCoverage': metric.get('intervalCoverage'),
        'developmentEligible': row['developmentEligible'], 'futureConfirmed': False, 'confirmationEnd': None,
        'selectionMetric': evidence['primaryMetric'], 'baselinePrimaryLoss': evidence['baseline'].get(evidence['primaryMetric']),
        **{k: metric[k] for k in ('balancedAccuracy', 'mcc', 'brier', 'qlike', 'rmse') if k in metric}}
    if evidence['samples'] is not None:
        result['evaluationSamples'] = evidence['samples']
    if 'qlike' in evidence['baseline']:
        result['baselineQlike'] = evidence['baseline']['qlike']
    aggregate = aggregate_metrics(row.get('folds', []), lambda f: f.get('metrics', {}))
    if 'meanIntervalWidth' in aggregate:
        result['meanIntervalWidth'] = aggregate['meanIntervalWidth']
    for name, field in [('evaluationStart', 'startMs'), ('evaluationEnd', 'endMs')]:
        if evidence[field] is not None:
            result[name] = datetime.fromtimestamp(evidence[field]/1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return result
