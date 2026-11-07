"""Read-only selection/export of existing immutable shadow forecasts; no inference."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from uuid import uuid4

from calibration import price_interval
from common import DAY_MS, SYMBOLS, canonical, digest, iso, latest_open
from registry import check_usable
from forecast import forward_rows
from store import Store

RULE = 'lowest_selection_return_rmse_then_model_id_v1'


def stamp(value):
    return iso(value).replace('+00:00', 'Z')


def unavailable(symbol, reason):
    return {'symbol': symbol, 'status': 'unavailable', 'reason': reason, 'data': None}


def stored_interval(interval, report, reference, change):
    """Withhold an absent/invalid interval independently of the point estimate."""
    if interval is None:
        return None
    try:
        expected = price_interval(report.get('interval_calibration'), reference, change)
        if (interval != expected or not interval or
                interval['method'] != 'chronological_oos_absolute_return_quantile_v1' or
                interval['nominalCoverage'] != 0.9 or not 0.9 <= interval['empiricalCoverage'] <= 1 or
                interval['calibrationSamples'] < 30 or interval['validationSamples'] <= 0 or
                not interval['calibrationEnd'] < interval['validationStart'] <= interval['evaluatedAt'] <= report['trained_at']):
            return None
        return {**interval, **{key: stamp(interval[key]) for key in ('calibrationEnd', 'validationStart', 'evaluatedAt')}}
    except (KeyError, ValueError, TypeError, OverflowError):
        return None


def candidate_data(store, row, frame, dataset, config, now):
    """Validate the stored output and its provenance without recomputing inference."""
    model = store.model(row['model_id'])  # Includes artifact checksum verification.
    report, details = model['metadata'], json.loads(row['details'])
    if not isinstance(details, dict):
        raise ValueError('Invalid forecast provenance object')
    check_usable(model, config, now)
    if (report.get('algorithm') not in ('ridge', 'random_forest', 'gradient_boosting') or
            report.get('window') not in ('full', '3y', '2y', '1y') or not 1 <= len(model['id']) <= 200):
        raise ValueError('Unsupported model identity')
    if not (model['status'] in ('candidate', 'approved', 'active') and model['symbol'] == row['symbol'] and
            details.get('model_status_at_generation') in ('candidate', 'approved', 'active') and
            details.get('usage') == ('offline_research_only' if details.get('model_status_at_generation') == 'active' else 'shadow_unvalidated') and
            details.get('reason') is None and
            details['dataset_fingerprint'] == dataset['fingerprint'] and
            row['source_time'] == int(frame.close_time.max()) and
            row['source_time'] < row['generated_at'] <= now < row['target_time'] and
            row['target_time'] == row['source_time'] + DAY_MS and
            report['training_range']['target_end'] <= row['source_time'] and
            report['trained_at'] <= row['generated_at'] and
            row['id'] == digest(canonical([row['symbol'], model['id'], row['target_time']]).encode())):
        raise ValueError('Invalid shadow identity, origin or chronology')
    available = store.db.execute('SELECT MAX(s.retrieved_at) FROM candles c JOIN sources s ON c.source_id=s.id '
                                'WHERE c.symbol=?', (row['symbol'],)).fetchone()[0]
    if available > row['generated_at']:
        raise ValueError('Sources unavailable at forecast origin')
    reference, change, price = row['reference_price'], row['predicted_return'], row['predicted_price']
    if not (all(isinstance(v, (int, float)) and math.isfinite(v) for v in (reference, change, price)) and
            reference > 0 and price > 0 and change > -1 and
            reference == float(frame.close.iloc[-1]) and
            math.isclose(price, reference * (1 + change), rel_tol=1e-10, abs_tol=1e-8)):
        raise ValueError('Invalid stored numeric output')
    selection, baseline = report['validation_metrics'], report['baseline_metrics']
    for value in (selection['return_rmse'], baseline['return_rmse']):
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError('Invalid historical metrics')
    folds = report['walk_forward']
    if not (selection['samples'] > 0 and selection['samples'] == baseline['samples'] and folds and
            all(f['train_target_end'] < f['evaluation_source_start'] <= f['evaluation_target_end']
                <= min(report['trained_at'], row['source_time']) for f in folds)):
        raise ValueError('Invalid historical evidence chronology')
    # Only the interval already stored at forecast origin may be displayed.
    interval = stored_interval(details.get('calibration'), report, reference, change)
    return {
        'authority': 'ml', 'symbol': row['symbol'], 'horizon': '1d', 'priceUnit': 'USDT',
        'forecastId': row['id'], 'generatedAt': stamp(row['generated_at']),
        'sourceCandleCloseTime': stamp(row['source_time']), 'targetCloseTime': stamp(row['target_time']),
        'referencePrice': reference, 'predictedPrice': price, 'predictedReturn': change,
        'direction': 'UP' if change > 0 else 'DOWN' if change < 0 else 'NEUTRAL', 'neutralThreshold': 0,
        'modelId': model['id'], 'trainedAt': stamp(report['trained_at']),
        'modelExpiresAt': stamp(report['trained_at'] + config['max_model_age_days'] * DAY_MS),
        'datasetFingerprint': dataset['fingerprint'],
        'dataQuality': {'rows': len(frame), 'missingDays': 0, 'provenance': 'verified_binance_ohlcv'},
        'interval': interval,
        'validation': {'status': 'experimental_not_validated', 'algorithm': report['algorithm'],
                       'trainingWindow': report['window'], 'historicalReference': 'ml:model/' + model['id'],
                       'selectionRule': RULE, 'eligibleCandidates': 1,
                       'selectionReturnRmse': selection['return_rmse'], 'baselineReturnRmse': baseline['return_rmse'],
                       'selectionSamples': selection['samples'],
                       'selectionStart': stamp(folds[-1]['evaluation_source_start']),
                       'selectionEnd': stamp(folds[-1]['evaluation_target_end']),
                       'foldWins': sum(f['metrics']['return_rmse'] < f['no_change']['return_rmse'] for f in folds),
                       'foldCount': len(folds), 'historicalGatePassed': bool(report.get('historical_pass', False)),
                       'forwardSamples': len(forward_rows(store, model, now))},
    }


def experimental_result(store, symbol, config, now):
    if not store.dataset(symbol):
        return unavailable(symbol, 'no_dataset')
    frame, dataset, quality = store.verified_frame(symbol, now)
    if len(frame) < 500 or quality['missing_days'] or int(frame.open_time.max()) != latest_open(now):
        return unavailable(symbol, 'dataset_stale_or_gapped')
    candidates = []
    for row in store.db.execute("SELECT * FROM predictions WHERE symbol=? AND status='pending' AND target_time>?",
                                (symbol, now)).fetchall():
        try:
            candidates.append(candidate_data(store, row, frame, dataset, config, now))
        except (ValueError, KeyError, TypeError, OverflowError):
            continue  # Invalid candidates cannot participate in ranking.
    if not candidates:
        return unavailable(symbol, 'no_current_valid_shadow_forecast')
    candidates.sort(key=lambda item: (item['validation']['selectionReturnRmse'], item['modelId']))
    chosen = candidates[0]
    chosen['validation']['eligibleCandidates'] = len(candidates)
    return {'symbol': symbol, 'status': 'experimental', 'reason': None, 'data': chosen}


def export_experimental(database, output, config, now):
    database, output = Path(database).resolve(), Path(output).resolve()
    if output == database or output.suffix.lower() != '.json':
        raise ValueError('Experimental export requires a separate JSON output file')
    store = Store.readonly(database)  # Missing DB fails without creating a database.
    temporary = output.with_name(output.name + '.' + uuid4().hex + '.tmp')
    try:
        if store.db.execute('PRAGMA journal_mode').fetchone()[0] == 'wal':
            raise ValueError('Export requires the lifecycle rollback journal for registry file stamping')
        store.db.execute('BEGIN')
        forecasts = []
        for symbol in SYMBOLS:
            try:
                forecasts.append(experimental_result(store, symbol, config, now))
            except (ValueError, KeyError, TypeError, OverflowError):
                forecasts.append(unavailable(symbol, 'model_or_dataset_validation_failed'))
        # The shared SQLite read lock prevents writer commits until output is stamped.
        stat = database.stat()
        payload = canonical({'version': 'ml-experimental-v1', 'generatedAt': stamp(now),
                             'registry': {'size': stat.st_size, 'mtimeNs': str(stat.st_mtime_ns)},
                             'forecasts': forecasts})
        output.parent.mkdir(parents=True, exist_ok=True)
        with temporary.open('x', encoding='utf-8') as stream:
            stream.write(canonical({'payload': payload, 'sha256': digest(payload.encode())}))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, output)
        return {'output': str(output), 'forecasts': [{'symbol': r['symbol'], 'status': r['status'], 'reason': r['reason']} for r in forecasts]}
    finally:
        store.close()
        temporary.unlink(missing_ok=True)
