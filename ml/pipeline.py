"""Explicit local CLI: sync, train/evaluate, select, predict and inspect."""
from __future__ import annotations
import argparse
import json
import logging
import os
import sqlite3
from pathlib import Path
from common import ROOT, SYMBOLS, day, load_config, utc_ms
from forecast import generate, reconcile
from ingestion import import_legacy, sync
from provider import Binance
from publication import export_predictions
from store import Store
from train import train_models, select_best, PIPELINE_VERSION


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest='command', required=True)
    for name in ('sync','validate','train','evaluate','select','predict','reconcile','status','analytics','backup'):
        command = commands.add_parser(name)
        command.add_argument('--db', type=Path, default=Path(os.environ.get('INVESTING_HUB_ML_DB', ROOT/'data'/'lifecycle.sqlite3')))
        command.add_argument('--config', type=Path, default=ROOT/'config.json')
        command.add_argument('--symbol', choices=SYMBOLS)
        if name == 'sync':
            command.add_argument('--start')
            command.add_argument('--legacy-dir', type=Path, default=ROOT/'data')
        if name in ('predict','analytics','backup'):
            command.add_argument('--output', type=Path, default=(ROOT/'data'/'predictions.json' if name=='predict' else ROOT/'data'/'analytics') if name!='backup' else None, required=name=='backup')
    return result


def inspect_status(store, symbols, config, now):
    datasets=[]
    for symbol in symbols:
        try:
            frame, metadata, quality = store.verified_frame(symbol, now)
            datasets.append({'symbol':symbol,'rows':len(frame),'last_close':int(frame.close_time.max()),'fingerprint':metadata['fingerprint'],'missing_days':quality['missing_days']})
        except ValueError as error:
            datasets.append({'symbol':symbol,'status':'unavailable','reason':str(error)})
    models=[]
    for row in store.db.execute('SELECT id FROM models ORDER BY symbol,id').fetchall():
        model=store.model(row[0]); meta=model['metadata']
        if model['symbol'] in symbols and meta.get('pipeline_version') == PIPELINE_VERSION:
            models.append({'symbol':model['symbol'],'model_id':model['id'],'selected':model['status']=='active',
                'algorithm':meta['algorithm'],'trained_at':meta['trained_at'],'dataset_fingerprint':meta['dataset_fingerprint'],
                'selection':meta['validation_metrics'],'final_evaluation':meta['final_evaluation']})
    return {'as_of':now,'datasets':datasets,'models':models}


def run(args, store, config, now):
    symbols=[args.symbol] if args.symbol else config['symbols']
    if args.command=='backup':
        if args.output.exists() or args.output.resolve()==args.db.resolve():
            raise ValueError('Backup requires a new separate destination')
        args.output.parent.mkdir(parents=True,exist_ok=True)
        target=sqlite3.connect(args.output)
        try: store.db.backup(target)
        finally: target.close()
        return {'backup':str(args.output.resolve())}
    if args.command in ('status','evaluate'):
        return inspect_status(store,symbols,config,now)
    results=[]
    if args.command=='sync':
        provider=Binance()
        for symbol in symbols:
            if not store.dataset(symbol): import_legacy(store,args.legacy_dir,symbol,now)
            result=sync(store,provider,symbol,day(args.start or config['start_date']),now,config['max_absolute_daily_return'])
            results.append({'symbol':symbol,'added':result['added'],'fingerprint':result['dataset']['fingerprint'],'rows':result['dataset']['rows']})
        return results
    for symbol in symbols:
        with store.transaction():
            if args.command=='train': results.extend(train_models(store,symbol,config,now))
            elif args.command=='select': results.append(select_best(store,symbol,config,now))
            elif args.command=='predict': results.append(generate(store,symbol,config,now))
            elif args.command=='reconcile': results.append(reconcile(store,symbol,now))
            elif args.command=='validate':
                frame,metadata,quality=store.verified_frame(symbol,now)
                if quality['missing_days']: raise ValueError('Dataset gaps require synchronization')
                results.append({'symbol':symbol,'rows':len(frame),'quality':quality,'fingerprint':metadata['fingerprint']})
    if args.command=='predict':
        return export_predictions(store,args.db,args.output,utc_ms())
    return results


def main(argv=None):
    args=parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(name)s: %(message)s')
    store=None
    try:
        if args.command=='analytics':
            from analytics.cli import run as analytics
            result=analytics(args.db,args.output,utc_ms())
        else:
            if not args.db.exists() and args.command!='sync':
                raise ValueError('Existing database required; sync creates the initial dataset')
            store=Store.readonly(args.db) if args.command in ('status','evaluate','backup') else Store(args.db)
            result=run(args,store,load_config(args.config),utc_ms())
        print(json.dumps(result,indent=2,allow_nan=False))
        return 0
    except Exception as error:
        logging.error('%s failed: %s',args.command,error)
        return 1
    finally:
        if store is not None: store.close()


if __name__=='__main__':
    raise SystemExit(main())
