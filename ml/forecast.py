"""One immutable next-day forecast from the objectively selected local model."""
from __future__ import annotations
import json
import numpy as np
from artifact import predict
from common import DAY_MS, canonical, digest, latest_open
from features import FEATURES, FEATURE_VERSION, feature_frame
from train import PIPELINE_VERSION, metrics


def generate(store, symbol, config, now):
    try:
        model = store.active(symbol)
        if not model or model['metadata'].get('pipeline_version') != PIPELINE_VERSION:
            raise ValueError('no_selected_model')
        frame, dataset, quality = store.verified_frame(symbol, now)
        latest = frame.iloc[-1]
        source, reference = int(latest.close_time), float(latest.close)
        target = source+DAY_MS
        meta = model['metadata']
        if quality['missing_days'] or int(latest.open_time) != latest_open(now):
            raise ValueError('dataset_stale_or_gapped')
        if not source < now < target or meta['trained_at'] > now or meta['training_range']['target_end'] > source:
            raise ValueError('invalid_forecast_chronology')
        if meta['feature_version'] != FEATURE_VERSION or meta['feature_order'] != FEATURES:
            raise ValueError('feature_contract_mismatch')
        if not store.db.execute('SELECT 1 FROM dataset_versions WHERE symbol=? AND fingerprint=?', (symbol, meta['dataset_fingerprint'])).fetchone():
            raise ValueError('training_dataset_version_missing')
        retrieved = store.db.execute('SELECT MAX(s.retrieved_at) FROM candles c JOIN sources s ON c.source_id=s.id WHERE c.symbol=?', (symbol,)).fetchone()[0]
        if retrieved > now:
            raise ValueError('source_not_available_at_forecast')
        features = feature_frame(frame).dropna(subset=FEATURES)[FEATURES]
        if meta['algorithm'] == 'lstm':
            lookback = json.loads(model['artifact'])['lookback']
            x = features.iloc[-lookback:].to_numpy()[None, :, :]
        else:
            x = features.iloc[[-1]]
        change = float(predict(model['artifact'], x)[0])
        price = reference*(1+change)
        if not np.isfinite(price) or price <= 0:
            raise ValueError('invalid_model_output')
        identity = digest(canonical([symbol, model['id'], target]).encode())
        previous = store.db.execute('SELECT * FROM predictions WHERE id=?', (identity,)).fetchone()
        if previous:
            if previous['status'] not in ('pending', 'evaluated') or previous['predicted_price'] != price or previous['reference_price'] != reference:
                raise ValueError('immutable_forecast_mismatch')
            return dict(previous)
        details = {'pipeline_version': PIPELINE_VERSION, 'dataset_fingerprint': dataset['fingerprint'],
                   'model_status_at_generation': 'active', 'reason': None}
        store.db.execute('INSERT INTO predictions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (identity, symbol, model['id'], now, source, target, reference, change, price,
             None, None, None, 'pending', canonical(details)))
        store.event('prediction', {'id': identity, 'symbol': symbol, 'model_id': model['id']}, now)
        return dict(store.db.execute('SELECT * FROM predictions WHERE id=?', (identity,)).fetchone())
    except (ValueError, KeyError, TypeError, OverflowError) as error:
        result = {'symbol': symbol, 'status': 'unavailable', 'reason': str(error)}
        store.event('prediction_unavailable', result, now)
        return result


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
            intervals = [(r, json.loads(r['details']).get('calibration')) for r in observations]
            intervals = [(r, interval) for r, interval in intervals if interval]
            report['prospective_interval_samples'] = len(intervals)
            report['prospective_interval_coverage'] = (sum(interval['lowerPrice'] <= r['actual_price'] <= interval['upperPrice']
                for r, interval in intervals) / len(intervals)) if intervals else None
            store.db.execute('INSERT OR REPLACE INTO performance VALUES(?,?,?)',
                             (row[0], observations[-1]['target_time'], canonical(report)))
    store.event('reconcile', {'symbol': symbol, 'reconciled': reconciled}, now)
    return {'symbol': symbol, 'reconciled': reconciled}
