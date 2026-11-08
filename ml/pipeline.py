"""Explicit local CLI: sync, train/evaluate, select, predict and inspect."""
from __future__ import annotations
import argparse
import json
import logging
import os
import sqlite3
from argparse import Namespace
from contextlib import nullcontext
from pathlib import Path
from common import ROOT, SYMBOLS, day, load_config, utc_ms, latest_open
from job_lock import job_lock
from forecast import generate, reconcile
from ingestion import import_legacy, sync
from provider import Binance
from publication import export_predictions
from store import Store
from train import train_models, select_best, PIPELINE_VERSION


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    commands = result.add_subparsers(dest='command', required=True)
    for name in ('sync','validate','train','evaluate','select','predict','reconcile','status','daily','daily-status','backup'):
        command = commands.add_parser(name)
        command.add_argument('--db', type=Path, default=Path(os.environ.get('INVESTING_HUB_ML_DB', ROOT/'data'/'lifecycle.sqlite3')))
        command.add_argument('--config', type=Path, default=ROOT/'config.json')
        command.add_argument('--symbol', choices=SYMBOLS)
        if name == 'sync':
            command.add_argument('--start')
            command.add_argument('--legacy-dir', type=Path, default=ROOT/'data')
        if name in ('predict','daily','backup'):
            command.add_argument('--output', type=Path, default=ROOT/'data'/'predictions.json' if name!='backup' else None, required=name=='backup')
        if name in ('daily','daily-status'):
            command.add_argument('--log-directory', type=Path)
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


def run(args, store, config, now, provider=None):
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
        provider=provider or Binance()
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
                if quality['missing_days'] or int(frame.open_time.max()) != latest_open(now):
                    raise ValueError('Current gap-free completed daily data required')
                results.append({'symbol':symbol,'rows':len(frame),'quality':quality,'fingerprint':metadata['fingerprint']})
    if args.command=='predict':
        return export_predictions(store,args.db,args.output,utc_ms(),getattr(args,'require_complete',False))
    return results


def main(argv=None):
    args=parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO,format='%(levelname)s %(name)s: %(message)s')
    store=None
    try:
        if args.command=='daily-status':
            from daily import daily_status
            result=daily_status(args.log_directory or args.db.parent/'logs'/'daily')
        else:
            if not args.db.exists() and args.command not in ('sync','daily'):
                raise ValueError('Existing database required; sync creates the initial dataset')
            if args.command=='daily':
                from daily import run_daily
                args.log_directory=args.log_directory or args.db.parent/'logs'/'daily'
                config=None
                def operation(command, current_store, now, on_retry):
                    nonlocal config
                    if config is None:
                        config=load_config(args.config)
                        if args.symbol or len(config['symbols']) != len(SYMBOLS) or set(config['symbols']) != set(SYMBOLS):
                            raise ValueError('Daily execution requires all eight symbols')
                    step=Namespace(**{**vars(args),'command':command,'require_complete':True,
                                      'start':None,'legacy_dir':ROOT/'data'})
                    return run(step,current_store,config,now,Binance(on_retry=on_retry))
                result=run_daily(args,operation,clock=utc_ms)
            else:
                config=load_config(args.config)
                reading=args.command in ('status','evaluate','backup')
                if args.command=='sync': args.db.parent.mkdir(parents=True,exist_ok=True)
                with nullcontext() if reading else job_lock(args.db):
                    store=Store.readonly(args.db) if reading else Store(args.db)
                    result=run(args,store,config,utc_ms())
        print(json.dumps(result,indent=2,allow_nan=False))
        return 0
    except Exception as error:
        logging.error('%s failed: %s',args.command,
                      type(error).__name__+'; inspect daily-status' if args.command=='daily' else error)
        return 1
    finally:
        if store is not None: store.close()


if __name__=='__main__':
    raise SystemExit(main())
