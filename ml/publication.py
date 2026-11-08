"""The single numeric forecast publication, read by HTTP without Python inference."""
import json
from datetime import datetime, timezone
from pathlib import Path
from common import DAY_MS, SYMBOLS, canonical, digest, latest_open
from features import FEATURE_VERSION, FEATURES
from train import PIPELINE_VERSION, ALGORITHMS
from analytics.export import atomic_json


def stamp(value):
    return datetime.fromtimestamp(value/1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')


def unavailable(symbol, now, reason):
    return {'symbol': symbol, 'target': 'next_daily_close', 'horizon': '1d',
        'predictionTimestamp': stamp(now), 'sourceDataTimestamp': None, 'targetTimestamp': None,
        'modelVersion': None, 'algorithm': None, 'datasetFingerprint': None,
        'referencePrice': None, 'predictedReturn': None, 'predictedValue': None,
        'evaluationReference': 'local-model-evaluation', 'status': 'unavailable', 'reason': reason}


def prediction_result(store, symbol, now):
    try:
        frame, dataset, quality = store.verified_frame(symbol, now)
        source = int(frame.close_time.max())
        if quality['missing_days'] or int(frame.open_time.max()) != latest_open(now):
            return unavailable(symbol, now, 'dataset_stale_or_gapped')
        model = store.active(symbol)
        if not model or model['metadata'].get('pipeline_version') != PIPELINE_VERSION:
            return unavailable(symbol, now, 'no_selected_model')
        meta = model['metadata']
        if meta['algorithm'] not in ALGORITHMS or meta['feature_version'] != FEATURE_VERSION or meta['feature_order'] != FEATURES:
            raise ValueError('Invalid model contract')
        row = store.db.execute("SELECT * FROM predictions WHERE symbol=? AND model_id=? AND target_time=? AND status='pending'", (symbol,model['id'],source+DAY_MS)).fetchone()
        if not row:
            return unavailable(symbol, now, 'no_current_prediction')
        details = json.loads(row['details'])
        if (details.get('pipeline_version') != PIPELINE_VERSION or details['dataset_fingerprint'] != dataset['fingerprint'] or
            not source < row['generated_at'] <= now < row['target_time'] or
            meta['trained_at'] > row['generated_at'] or meta['training_range']['target_end'] > source or
            row['reference_price'] != float(frame.close.iloc[-1]) or
            row['predicted_price'] != row['reference_price']*(1+row['predicted_return']) or row['predicted_price'] <= 0):
            raise ValueError('Invalid immutable forecast')
        return {'symbol': symbol, 'target': 'next_daily_close', 'horizon': '1d',
            'predictionTimestamp': stamp(row['generated_at']), 'sourceDataTimestamp': stamp(source),
            'targetTimestamp': stamp(row['target_time']), 'modelVersion': model['id'],
            'algorithm': meta['algorithm'], 'datasetFingerprint': meta['dataset_fingerprint'],
            'referencePrice': row['reference_price'], 'predictedReturn': row['predicted_return'],
            'predictedValue': row['predicted_price'], 'evaluationReference': 'ml:'+model['id'],
            'status': 'experimental', 'reason': 'Experimental local model estimate; selection does not establish predictive reliability.'}
    except (ValueError, KeyError, TypeError, OverflowError):
        return unavailable(symbol, now, 'data_or_model_integrity_failed')


def export_predictions(store, database, output, now):
    database, output = Path(database).resolve(), Path(output).resolve()
    if output == database or output.suffix.lower() != '.json':
        raise ValueError('Publication must be a separate JSON file')
    if store.db.execute('PRAGMA journal_mode').fetchone()[0].lower() == 'wal':
        raise ValueError('Snapshot stamping requires rollback-journal SQLite')
    # The writer reservation prevents data/model changes until atomic publication.
    with store.transaction():
        stat = database.stat()
        report = {'version': PIPELINE_VERSION, 'generatedAt': stamp(now),
            'registry': {'size': stat.st_size, 'mtimeNs': str(stat.st_mtime_ns)},
            'forecasts': [prediction_result(store, symbol, now) for symbol in SYMBOLS]}
        atomic_json(output, report)
    return report
