"""Atomic local snapshots and normalized, spreadsheet-safe analytical CSVs."""
import csv
import json
import os
from pathlib import Path
from uuid import uuid4
from common import canonical, digest


def atomic_json(path, content):
    payload = canonical(content)
    if len(payload.encode('utf-8')) > 5 * 1024 * 1024:
        raise ValueError('Analytical output exceeds bounded snapshot size')
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            stream.write(canonical({'payload': payload, 'sha256': digest(payload.encode())}))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def safe_cell(value):
    if isinstance(value, (list, dict)):
        return canonical(value)
    if isinstance(value, str) and value.startswith(('=', '+', '-', '@', '\t', '\r', '\n')):
        return "'" + value
    return value


def write_csv(path, rows, fields, metadata):
    with Path(path).open('x', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=[*metadata, *fields], extrasaction='raise')
        writer.writeheader()
        for row in rows:
            writer.writerow({key: safe_cell(value) for key, value in {**metadata, **row}.items()})


def export_report(output, report, evaluated, events):
    output = Path(output).resolve()
    run = output / 'runs' / report['runId']
    run.mkdir(parents=True, exist_ok=False)
    metadata = {'runId': report['runId'], 'generatedAt': report['generatedAt'], 'schemaVersion': report['version'],
                'featureVersion': report['provenance']['featureVersion'], 'codeHash': report['provenance']['codeHash']}
    descriptions, models = [], []
    for asset in report['assets']:
        if asset['statistics'] and asset['statistics']['returns']:
            for metric, value in asset['statistics']['returns'].items():
                descriptions.append({'symbol': asset['symbol'], 'datasetFingerprint': asset['dataset']['fingerprint'], 'metric': metric,
                    'value': value, 'unit': 'count' if metric == 'samples' else 'fraction_squared' if metric == 'variance' else 'dimensionless' if metric in ('skewness', 'excessKurtosis') else 'return_fraction'})
        for model in asset['classifiers']:
            metrics = model['metrics'] or {}
            models.append({'symbol': asset['symbol'], **{key: model[key] for key in ('task', 'model', 'fold', 'version', 'datasetFingerprint', 'trainStart', 'trainEnd', 'validationStart', 'validationEnd', 'evaluationStart', 'evaluationEnd', 'phase', 'status', 'threshold', 'eventThreshold')},
                **{key: metrics.get(key) for key in ('samples', 'positives', 'prevalence', 'accuracy', 'balancedAccuracy', 'precision', 'recall', 'f1', 'rocAuc', 'averagePrecision', 'brier', 'falsePositiveRate', 'confusion')}})
    tables = [
        ('descriptive_statistics.csv', descriptions, ['symbol', 'datasetFingerprint', 'metric', 'value', 'unit']),
        ('classification_comparison.csv', models, ['symbol', 'task', 'model', 'fold', 'version', 'datasetFingerprint', 'trainStart', 'trainEnd', 'validationStart', 'validationEnd', 'evaluationStart', 'evaluationEnd', 'phase', 'status', 'threshold', 'eventThreshold', 'samples', 'positives', 'prevalence', 'accuracy', 'balancedAccuracy', 'precision', 'recall', 'f1', 'rocAuc', 'averagePrecision', 'brier', 'falsePositiveRate', 'confusion']),
        ('regression_comparison.csv', [{'symbol': a['symbol'], **{k: r[k] for k in ('modelId', 'model', 'status', 'datasetFingerprint', 'phase', 'evaluationStart', 'evaluationEnd', 'samples', 'returnMae', 'returnRmse', 'priceMaeUsdt', 'priceRmseUsdt', 'baselineRmse', 'foldWins')}} for a in report['assets'] for r in a['regressions']],
            ['symbol', 'modelId', 'model', 'status', 'datasetFingerprint', 'phase', 'evaluationStart', 'evaluationEnd', 'samples', 'returnMae', 'returnRmse', 'priceMaeUsdt', 'priceRmseUsdt', 'baselineRmse', 'foldWins']),
        ('evaluated_predictions.csv', [{**{key: r[key] for key in ('id', 'symbol', 'model_id', 'generated_at', 'source_time', 'target_time', 'reference_price', 'predicted_return', 'predicted_price', 'actual_return', 'actual_price', 'error')},
            'phase': 'prospective_active' if json.loads(r['details']).get('model_status_at_generation') == 'active' else 'prospective_shadow'} for r in evaluated],
            ['id', 'symbol', 'model_id', 'generated_at', 'source_time', 'target_time', 'reference_price', 'predicted_return', 'predicted_price', 'actual_return', 'actual_price', 'error', 'phase']),
        ('anomalies.csv', events, ['symbol', 'time', 'method', 'indicator', 'score', 'threshold', 'referenceStart', 'referenceEnd', 'severity']),
        ('anomaly_summary.csv', [{'symbol': a['symbol'], **r} for a in report['assets'] for r in a['anomalyFrequency']], ['symbol', 'month', 'method', 'flags'])]
    for filename, rows, columns in tables:
        write_csv(run / filename, rows, columns, metadata)
    atomic_json(run / 'report.json', report)
    atomic_json(run / 'columns.json', {'metadata': metadata, 'tables': {name: fields for name, _, fields in tables},
        'units': {'returns': 'fraction (multiply by 100 for percent)', 'prices': 'USDT', 'epoch_times': 'UTC Unix milliseconds',
            'text_times': 'ISO UTC', 'confusion': 'JSON [TN,FP,FN,TP]', 'anomaly_score': 'method-specific, never a calibrated probability'}})
    # latest becomes visible only when the entire immutable run succeeded.
    atomic_json(output / 'latest.json', report)
    return {'runId': report['runId'], 'directory': str(run), 'assets': [{'symbol': a['symbol'], 'status': a['status'], 'reason': a['reason']} for a in report['assets']]}
