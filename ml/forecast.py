"""Prospective predictions and delayed actual-value reconciliation."""
from __future__ import annotations

import json

import numpy as np

from artifact import predict
from common import DAY_MS, canonical, digest, latest_open
from features import FEATURES, FEATURE_VERSION, feature_frame
from train import metrics


def generate(store, symbol, config, now, model_id=None):
    model = store.model(model_id) if model_id else store.active(symbol)
    if model is None:
        result = {'symbol': symbol, 'status': 'disabled_unvalidated', 'reason': 'No active approved local model'}
        store.event('prediction_disabled', result, now)
        return result
    if model['symbol'] != symbol:
        raise ValueError('Model symbol mismatch')
    frame, dataset, quality = store.verified_frame(symbol, now)
    latest = frame.iloc[-1]
    source_time, reference = int(latest.close_time), float(latest.close)
    target_time = source_time + DAY_MS
    prediction_id = digest(canonical([symbol, model['id'], target_time]).encode())
    previous = store.db.execute('SELECT * FROM predictions WHERE id=?', (prediction_id,)).fetchone()
    if previous:
        return dict(previous)
    report = model['metadata']
    status, reason, predicted_return, predicted_price = 'pending', None, None, None
    try:
        if model['status'] in ('rejected', 'archived'):
            status = 'rejected'
            raise ValueError('Model status does not permit new forecasts')
        if source_time - DAY_MS + 1 != latest_open(now) or quality['missing_days']:
            raise ValueError('Dataset stale or has gaps')
        if not source_time < now < target_time:
            raise ValueError('Prediction must precede target close and follow source completion')
        if report['trained_at'] > now or report['training_range']['target_end'] > source_time:
            raise ValueError('Model contains data unavailable at forecast origin')
        if now - report['trained_at'] > config['max_model_age_days'] * DAY_MS:
            raise ValueError('Model has expired')
        if report['feature_version'] != FEATURE_VERSION or report['feature_order'] != FEATURES:
            raise ValueError('Feature contract mismatch')
        # Backdating is not supported by the CLI. Tests inject a clock only.
        source_available = store.db.execute(
            'SELECT MAX(s.retrieved_at) FROM candles c JOIN sources s ON c.source_id=s.id WHERE c.symbol=?',
            (symbol,)).fetchone()[0]
        if source_available > now:
            raise ValueError('Source had not been retrieved at forecast timestamp')
        features = feature_frame(frame).iloc[[-1]][FEATURES]
        predicted_return = float(predict(model['artifact'], features)[0])
        predicted_price = reference * (1 + predicted_return)
        if not np.isfinite(predicted_price) or predicted_price <= 0:
            raise ValueError('Invalid model price output')
    except (ValueError, KeyError, TypeError) as error:
        status = 'rejected' if status == 'rejected' else 'failed'
        reason = str(error)
        predicted_return = predicted_price = None
    details = {'dataset_fingerprint': dataset['fingerprint'], 'reason': reason,
               'model_status_at_generation': model['status'],
               'usage': 'offline_research_only' if model['status'] == 'active' else 'shadow_unvalidated',
               'calibration': None}
    store.db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                     (prediction_id, symbol, model['id'], now, source_time, target_time, reference,
                      predicted_return, predicted_price, None, None, None, status, canonical(details)))
    store.event('prediction', {'id': prediction_id, 'status': status, 'reason': reason}, now)
    return dict(store.db.execute('SELECT * FROM predictions WHERE id=?', (prediction_id,)).fetchone())


def forward_rows(store, model, now):
    rows = store.db.execute(
        "SELECT * FROM predictions WHERE model_id=? AND status='evaluated' AND target_time<? ORDER BY target_time",
        (model['id'], now)).fetchall()
    report = model['metadata']
    return [dict(r) for r in rows if report['trained_at'] <= r['generated_at'] and
            r['source_time'] < r['generated_at'] < r['target_time'] and
            r['target_time'] == r['source_time'] + DAY_MS and
            report['training_range']['target_end'] <= r['source_time']]


def score_rows(rows):
    return metrics([r['actual_return'] for r in rows], [r['predicted_return'] for r in rows],
                   [r['reference_price'] for r in rows])


def baseline_rows(rows):
    return metrics([r['actual_return'] for r in rows], np.zeros(len(rows)),
                   [r['reference_price'] for r in rows])


def reconcile(store, symbol, now):
    frame, dataset, _ = store.verified_frame(symbol, now)
    actuals = {int(r.close_time): float(r.close) for r in frame.itertuples()}
    pending = store.db.execute(
        "SELECT * FROM predictions WHERE symbol=? AND status='pending' AND target_time<?", (symbol, now)).fetchall()
    reconciled = 0
    for row in pending:
        if row['target_time'] not in actuals:
            continue
        if not row['source_time'] < row['generated_at'] < row['target_time']:
            store.db.execute("UPDATE predictions SET status='rejected' WHERE id=?", (row['id'],))
            store.event('invalid_prediction_time', {'prediction_id': row['id']}, now)
            continue
        actual = actuals[row['target_time']]
        details = json.loads(row['details'])
        details.update({'reconciled_at': now, 'actual_dataset_fingerprint': dataset['fingerprint']})
        store.db.execute("UPDATE predictions SET actual_price=?,error=?,actual_return=?,status='evaluated',details=? WHERE id=?",
                         (actual, row['predicted_price'] - actual, actual / row['reference_price'] - 1,
                          canonical(details), row['id']))
        reconciled += 1
    for row in store.db.execute('SELECT id FROM models WHERE symbol=?', (symbol,)).fetchall():
        model = store.model(row[0])
        observations = forward_rows(store, model, now)
        if observations:
            report = {'model': score_rows(observations), 'no_change': baseline_rows(observations),
                      'as_of': now, 'first_target': observations[0]['target_time'],
                      'last_target': observations[-1]['target_time']}
            store.db.execute('INSERT OR REPLACE INTO performance VALUES(?,?,?)',
                             (row[0], observations[-1]['target_time'], canonical(report)))
    store.event('reconcile', {'symbol': symbol, 'reconciled': reconciled}, now)
    return {'symbol': symbol, 'reconciled': reconciled}
