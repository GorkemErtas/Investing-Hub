"""Independent lifecycle CLI. No API server, scheduler registration or deployment."""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from common import ROOT, SYMBOLS, canonical, day, latest_open, load_config, utc_ms
from forecast import generate, reconcile
from ingestion import import_legacy, sync
from provider import Binance
from registry import approve, evaluate, promote, reject, rollback
from store import Store
from train import train_models


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest='command', required=True)
    for name in ('sync', 'validate', 'train', 'evaluate', 'approve', 'promote', 'reject',
                 'rollback', 'predict', 'reconcile', 'status', 'inspect-model', 'daily', 'weekly', 'backup', 'export-analysis', 'analytics'):
        command = commands.add_parser(name)
        command.add_argument('--db', type=Path, default=Path(os.environ.get(
            'INVESTING_HUB_ML_DB', ROOT / 'data' / 'lifecycle.sqlite3')))
        if name != 'analytics':
            command.add_argument('--config', type=Path, default=ROOT / 'config.json')
            command.add_argument('--symbol', choices=SYMBOLS)
        else:
            command.add_argument('--output', type=Path, default=ROOT / 'data' / 'analytics')
        if name in ('sync', 'daily', 'weekly'):
            command.add_argument('--start', help='UTC YYYY-MM-DD; defaults to configured history start')
            command.add_argument('--legacy-dir', type=Path, default=ROOT / 'data')
        if name in ('evaluate', 'approve', 'promote', 'reject', 'rollback', 'inspect-model'):
            command.add_argument('--model-id', required=True)
        if name in ('reject', 'rollback'):
            command.add_argument('--reason', required=True)
        if name == 'predict':
            choice = command.add_mutually_exclusive_group()
            choice.add_argument('--model-id', help='Explicit candidate shadow forecast, never public/trusted')
            choice.add_argument('--shadow-all', action='store_true', help='Forecast all nonexpired candidate/approved models')
        if name == 'backup':
            command.add_argument('--output', type=Path, required=True)
        if name == 'export-analysis':
            command.add_argument('--output', type=Path, default=ROOT / 'data' / 'future-forecasts.json')
    return result


def inspect_status(store, symbols, config, now):
    datasets = []
    for symbol in symbols:
        metadata = store.dataset(symbol)
        if metadata:
            frame, _, quality = store.verified_frame(symbol, now)
            datasets.append({'symbol': symbol, 'dataset': metadata, 'quality': quality,
                             'current': int(frame.open_time.max()) == latest_open(now)})
        else:
            datasets.append({'symbol': symbol, 'status': 'not_synced'})
    models = [{'id': r['id'], 'symbol': r['symbol'], 'status': r['status'],
               'trained_at': r['metadata']['trained_at'],
               'historical_pass': r['metadata']['historical_pass'],
               'validation_rmse': r['metadata']['validation_metrics']['return_rmse'],
               'no_change_rmse': r['metadata']['baseline_metrics']['return_rmse'],
               'expired': now - r['metadata']['trained_at'] > config['max_model_age_days'] * 86400000}
              for r in (store.model(row[0]) for row in store.db.execute('SELECT id FROM models').fetchall())
              if r['symbol'] in symbols]
    counts = [dict(r) for r in store.db.execute(
        'SELECT symbol,status,COUNT(*) AS count FROM predictions GROUP BY symbol,status')]
    performance = [{'model_id': r[0], 'through_time': r[1], 'metrics': json.loads(r[2])}
                   for r in store.db.execute('SELECT * FROM performance ORDER BY through_time DESC LIMIT 20')]
    events = [dict(r) for r in store.db.execute('SELECT * FROM events ORDER BY id DESC LIMIT 10')]
    return {'as_of': now, 'datasets': datasets, 'models': models, 'predictions': counts,
            'recent_performance': performance, 'recent_events': events,
            'public_forecast_status': 'legacy route disabled; Future Analysis requires explicit eligible export-analysis'}


def forecasts(store, symbols, config, now, model_id=None, shadow_all=False):
    output = []
    for symbol in symbols:
        ids = [model_id] if model_id else [None]
        if shadow_all:
            ids += [r[0] for r in store.db.execute(
                "SELECT id FROM models WHERE symbol=? AND status IN ('candidate','approved')", (symbol,))
                if now - store.model(r[0])['metadata']['trained_at'] <= config['max_model_age_days'] * 86400000]
        for identity in ids:
            if identity and store.model(identity)['symbol'] != symbol:
                if model_id:
                    continue
                raise ValueError('Shadow model symbol mismatch')
            with store.transaction():
                output.append(generate(store, symbol, config, now, identity))
    return output


def run(args, store, config, now):
    symbols = [args.symbol] if args.symbol else config['symbols']
    command = args.command
    if command == 'export-analysis':
        from publication import export_analysis
        return export_analysis(store, args.db, args.output, config, now)
    if command == 'inspect-model':
        model = store.model(args.model_id)
        return {'id': model['id'], 'status': model['status'], 'artifact_checksum': model['checksum'],
                'report': model['metadata']}
    if command == 'backup':
        import sqlite3
        if args.output.resolve() == args.db.resolve() or args.output.exists():
            raise ValueError('Backup destination must be a new, separate file')
        args.output.parent.mkdir(parents=True, exist_ok=True)
        target = sqlite3.connect(args.output)
        try:
            store.db.backup(target)
        finally:
            target.close()
        return {'backup': str(args.output.resolve())}
    if command in ('evaluate', 'approve', 'promote', 'reject', 'rollback'):
        with store.transaction():
            if command in ('reject', 'rollback'):
                return (reject(store, args.model_id, args.reason, now) if command == 'reject' else
                        rollback(store, args.model_id, config, now, args.reason))
            return {'evaluate': evaluate, 'approve': approve, 'promote': promote}[command](
                store, args.model_id, config, now)
    output = []
    if command in ('sync', 'daily', 'weekly'):
        provider = Binance()
        for symbol in symbols:
            if not store.dataset(symbol):
                import_legacy(store, args.legacy_dir, symbol, now)
            output.append(sync(store, provider, symbol, day(args.start or config['start_date']),
                               now, config['max_absolute_daily_return']))
        if command == 'sync':
            return output
        now = utc_ms()
    if command in ('validate', 'status'):
        with store.transaction():
            if command == 'status':
                return inspect_status(store, symbols, config, now)
            for symbol in symbols:
                _, metadata, quality = store.verified_frame(symbol, now)
                if quality['missing_days']:
                    raise ValueError(f'{symbol}: {quality["missing_days"]} missing daily observations')
                output.append({'symbol': symbol, 'dataset': metadata, 'quality': quality})
            return output
    if command in ('reconcile', 'daily', 'weekly'):
        for symbol in symbols:
            with store.transaction():
                output.append(reconcile(store, symbol, now))
    if command in ('train', 'weekly'):
        for symbol in symbols:
            with store.transaction():
                output.extend(train_models(store, symbol, config, now))
    if command in ('predict', 'daily', 'weekly'):
        if command == 'weekly':
            now = utc_ms()
        output.extend(forecasts(store, symbols, config, now,
                               getattr(args, 'model_id', None),
                               getattr(args, 'shadow_all', command in ('daily', 'weekly'))))
    return output


def main(argv=None):
    args = parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')
    store = None
    try:
        if args.command == 'analytics':
            from analytics.cli import run as run_analytics
            print(json.dumps(run_analytics(args.db, args.output, utc_ms()), indent=2, allow_nan=False))
            return 0
        config = load_config(args.config)
        store = Store(args.db)
        now = utc_ms()
        result = run(args, store, config, now)
        print(json.dumps(result, indent=2, allow_nan=False))
        if isinstance(result, dict) and result.get('eligible') is False and args.command in ('approve', 'promote'):
            return 2
        if isinstance(result, list) and any(r.get('status') in ('failed', 'rejected') for r in result):
            return 2
        return 0
    except Exception as error:
        # Record a failed attempt outside the rolled-back work transaction.
        if store is not None:
            try:
                store.event('command_failed', {'command': args.command, 'error': str(error)})
            except Exception:
                logging.exception('Could not persist failure audit event')
        logging.error('%s failed: %s', args.command, error)
        return 1
    finally:
        if store is not None:
            store.close()


if __name__ == '__main__':
    sys.exit(main())
