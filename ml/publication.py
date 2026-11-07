"""Explicit atomic publication of eligible active-origin ledger forecasts only."""
from __future__ import annotations

import json
import os
from pathlib import Path
from uuid import uuid4

from common import DAY_MS, SYMBOLS, canonical, digest, iso, latest_open
from registry import check_usable, evaluate


def unavailable(symbol, reason):
    return {'symbol': symbol, 'status': 'unavailable', 'reason': reason, 'data': None}


def forecast_result(store, symbol, config, now):
    if not store.dataset(symbol):
        return unavailable(symbol, 'no_dataset')
    frame, dataset, quality = store.verified_frame(symbol, now)
    if quality['missing_days'] or int(frame.open_time.max()) != latest_open(now):
        return unavailable(symbol, 'dataset_stale_or_gapped')
    model = store.active(symbol)
    if model is None:
        return unavailable(symbol, 'no_active_approved_model')
    check_usable(model, config, now)
    evaluation = evaluate(store, model['id'], config, now, record=False)
    if not evaluation['eligible']:
        return unavailable(symbol, 'prospective_approval_gate_not_met')
    row = store.db.execute("SELECT * FROM predictions WHERE model_id=? AND status='pending' AND target_time>? ORDER BY generated_at DESC LIMIT 1",
                           (model['id'], now)).fetchone()
    if not row:
        return unavailable(symbol, 'no_current_active_forecast')
    details, report = json.loads(row['details']), model['metadata']
    interval = details.get('calibration')
    # Promotion cannot relabel today's immutable candidate-origin shadow.
    if details.get('model_status_at_generation') != 'active':
        return unavailable(symbol, 'shadow_forecast_not_publishable')
    if not interval or interval.get('status') != 'empirically_calibrated':
        return unavailable(symbol, 'interval_calibration_not_ready')
    if not (row['source_time'] == int(frame.close_time.max()) and row['source_time'] < row['generated_at'] < row['target_time'] and
            row['target_time'] - row['source_time'] == DAY_MS and report['training_range']['target_end'] <= row['source_time'] and
            interval['calibrationEnd'] < interval['validationStart'] and interval['evaluatedAt'] <= report['trained_at'] <= row['generated_at']):
        return unavailable(symbol, 'forecast_provenance_or_time_invalid')
    calibration = {**interval}
    for key in ('calibrationEnd', 'validationStart', 'evaluatedAt'):
        calibration[key] = iso(calibration[key]).replace('+00:00', 'Z')
    stamp = lambda value: iso(value).replace('+00:00', 'Z')
    data = {'authority': 'ml', 'symbol': symbol, 'horizon': '1d', 'priceUnit': 'USDT',
            'forecastId': row['id'],
            'dataQuality': {'rows': len(frame), 'missingDays': 0, 'provenance': 'verified_binance_ohlcv'},
            'generatedAt': stamp(row['generated_at']), 'sourceCandleCloseTime': stamp(row['source_time']),
            'targetCloseTime': stamp(row['target_time']), 'referencePrice': row['reference_price'],
            'predictedPrice': row['predicted_price'], 'predictedReturn': row['predicted_return'],
            'direction': 'UP' if row['predicted_return'] > 0 else 'DOWN' if row['predicted_return'] < 0 else 'NEUTRAL',
            'neutralThreshold': 0, 'modelId': model['id'], 'trainedAt': stamp(report['trained_at']),
            'modelExpiresAt': stamp(report['trained_at'] + config['max_model_age_days'] * DAY_MS),
            'datasetFingerprint': dataset['fingerprint'], 'interval': calibration,
            'validation': {'status': 'approved_prospective', 'historicalReference': 'ml:model/' + model['id'],
                           'forwardReference': 'ml:prospective/' + model['id'], 'forwardSamples': evaluation['forward_samples'],
                           'policy': {'requiredRelativeRmseImprovement': config['required_relative_rmse_improvement'],
                                      'minimumFoldWins': config['minimum_fold_wins'],
                                      'minimumFoldCount': config['walk_forward_splits'],
                                      'minimumForwardSamples': config['min_forward_samples']},
                           'metrics': {'selectionReturnRmse': report['validation_metrics']['return_rmse'],
                                       'baselineReturnRmse': report['baseline_metrics']['return_rmse'],
                                       'prospectiveReturnRmse': evaluation['metrics']['return_rmse'],
                                       'prospectiveBaselineReturnRmse': evaluation['no_change']['return_rmse'],
                                       'foldWins': report['walk_forward_wins'], 'foldCount': len(report['walk_forward'])},
                           'evaluatedAt': stamp(now)}}
    return {'symbol': symbol, 'status': 'validated', 'reason': None, 'data': data}


def export_analysis(store, database, output, config, now):
    database, output = Path(database).resolve(), Path(output).resolve()
    if output == database or output.suffix.lower() != '.json':
        raise ValueError('Publication requires a separate JSON output file')
    actual_database = Path(store.db.execute('PRAGMA database_list').fetchone()[2]).resolve()
    if actual_database != database:
        raise ValueError('Publication registry path mismatch')
    forecasts = []
    with store.transaction():
        for symbol in SYMBOLS:
            try:
                forecasts.append(forecast_result(store, symbol, config, now))
            except (ValueError, KeyError, TypeError):
                forecasts.append(unavailable(symbol, 'model_or_dataset_validation_failed'))
        # No evaluation events or registry mutations occur during export. Hold
        # the SQLite writer lock through snapshot stamping and atomic publication
        # so concurrent promotion cannot stamp stale evidence with a newer DB.
        return write_publication(database, output, forecasts, now)


def write_publication(database, output, forecasts, now):
    stat = database.stat()
    content = {'version': 'ml-publication-v1', 'generatedAt': iso(now).replace('+00:00', 'Z'),
               'registry': {'size': stat.st_size, 'mtimeNs': str(stat.st_mtime_ns)}, 'forecasts': forecasts}
    payload = canonical(content)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.' + uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            stream.write(canonical({'payload': payload, 'sha256': digest(payload.encode())}))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return {'output': str(output), 'forecasts': [{'symbol': item['symbol'], 'status': item['status'], 'reason': item['reason']} for item in forecasts]}
