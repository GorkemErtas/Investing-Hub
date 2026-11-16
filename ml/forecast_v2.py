"""Explicit v2 commands; no fitting, networking or writes at import time."""
from pathlib import Path
import argparse
import json


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    normalize = commands.add_parser('normalize')
    normalize.add_argument('--source', type=Path, default=Path('ml/data/coin'))
    normalize.add_argument('--output', type=Path, default=Path('ml/data/normalized-v2'))
    bench = commands.add_parser('benchmark')
    bench.add_argument('--dataset', type=Path, default=Path('ml/data/normalized-v2'))
    bench.add_argument('--output', type=Path, default=Path('ml/artifacts/multihorizon'))
    bench.add_argument('--symbol')
    bench.add_argument('--horizon', choices=['1m', '15m', '1h'])
    bench.add_argument('--max-train-rows', type=int, default=12000)
    bench.add_argument('--lstm-epochs', type=int, default=3)
    registry = commands.add_parser('registry')
    registry.add_argument('--study', type=Path, default=Path('ml/artifacts/multihorizon/study.json'))
    registry.add_argument('--output', type=Path, default=Path('ml/artifacts/registry-v2/registry.json'))
    worker = commands.add_parser('worker')
    worker.add_argument('--registry', type=Path, default=Path('ml/artifacts/registry-v2/registry.json'))
    worker.add_argument('--output', type=Path, default=Path('ml/data/forecasts-v2.json'))
    worker.add_argument('--once', action='store_true')
    report = commands.add_parser('report')
    report.add_argument('--study', type=Path, default=Path('ml/artifacts/multihorizon/study.json'))
    report.add_argument('--output', type=Path, default=Path('ml/reports'))
    repair = commands.add_parser('repair-artifacts')
    repair.add_argument('--study', type=Path, default=Path('ml/artifacts/multihorizon/study.json'))
    repair.add_argument('--dataset', type=Path, default=Path('ml/data/normalized-v2'))
    repair.add_argument('--output', type=Path, default=Path('ml/artifacts/multihorizon/study-repaired.json'))
    repair.add_argument('--algorithm', choices=['xgboost', 'random_forest'], default='xgboost')
    args = parser.parse_args(argv)
    if args.command == 'repair-artifacts':
        from multihorizon.repair import repair_artifacts
        repair_artifacts(args.study, args.dataset, args.output, args.algorithm)
        return 0
    if args.command == 'report':
        from multihorizon.reporting import export_report
        failures = export_report(args.study, args.output)
        print(json.dumps({'failedCandidates': failures}))
        return 1 if failures else 0
    if args.command == 'registry':
        from multihorizon.registry import build_registry
        result = build_registry(args.study, args.output)
        print(json.dumps(result, indent=2))
        return 0
    if args.command == 'worker':
        import logging
        import signal
        from threading import Event
        from multihorizon.registry import Registry
        from multihorizon.live import run_worker
        logging.basicConfig(level=logging.INFO, format='%(message)s')
        stop = Event()
        for signum in (signal.SIGINT, signal.SIGTERM):
            signal.signal(signum, lambda *_: stop.set())
        run_worker(Registry(args.registry), args.output, once=args.once, stop=stop)
        return 0
    if args.command == 'benchmark':
        from multihorizon.data import SYMBOLS, save_json
        from multihorizon.benchmark import benchmark
        if args.symbol and args.symbol not in SYMBOLS:
            parser.error('unsupported symbol')
        results = []
        for symbol in [args.symbol] if args.symbol else SYMBOLS:
            for horizon in [args.horizon] if args.horizon else ['1m', '15m', '1h']:
                result = benchmark(args.dataset, args.output, symbol, horizon,
                    {'maxTrainRows': args.max_train_rows, 'lstmEpochs': args.lstm_epochs})
                results.append(result)
                save_json(args.output/'study.json', results)
                print(json.dumps({'symbol': symbol, 'horizon': horizon, 'selection': result['selection'], 'seconds': result['totalSeconds']}), flush=True)
        return 0 if all(all(c['status'] == 'ok' for c in r['candidates'].values()) for r in results) else 1
    from multihorizon.data import normalize as run
    report = run(args.source, args.output)
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2))
    return 0 if report['status'] == 'valid' else 1


if __name__ == '__main__':
    raise SystemExit(main())
