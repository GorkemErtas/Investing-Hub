"""Explicit v2 commands; no fitting, networking or writes at import time."""
from pathlib import Path
import argparse
import json


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    local = commands.add_parser('local-prepare', help='Select existing frozen artifacts for local experimental inference; no training')
    local.add_argument('--study', type=Path, default=Path('ml/artifacts/objectives-study-2026-11-16'))
    local.add_argument('--price-study', type=Path, default=Path('ml/artifacts/multihorizon/study-final.json'))
    local.add_argument('--dataset', type=Path, default=Path('ml/data/normalized-v2'))
    local.add_argument('--output', type=Path, default=Path('ml/artifacts/local'))
    review = commands.add_parser('selection-review', help='Review frozen development evidence and optional bounded last-fold replay')
    review.add_argument('--study', type=Path, default=Path('ml/artifacts/objectives-study-2026-11-16'))
    review.add_argument('--price-study', type=Path, default=Path('ml/artifacts/multihorizon/study-final.json'))
    review.add_argument('--dataset', type=Path, default=Path('ml/data/normalized-v2'))
    review.add_argument('--previous', type=Path, default=Path('ml/reports/local-selection-v1.json'))
    review.add_argument('--output', type=Path, default=Path('ml/reports/selection-quality'))
    review.add_argument('--replay-output', type=Path, default=Path('ml/artifacts/selection-review'))
    review.add_argument('--replay', action='store_true')
    review.add_argument('--pair-process', action='store_true', help=argparse.SUPPRESS)
    review.add_argument('--symbol')
    review.add_argument('--horizon', choices=['1m', '15m', '1h'])
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
    worker.add_argument('--objective-registry', type=Path)
    worker.add_argument('--objective-output', type=Path, default=Path('ml/data/objective-forecasts.json'))
    report = commands.add_parser('report')
    report.add_argument('--study', type=Path, default=Path('ml/artifacts/multihorizon/study.json'))
    report.add_argument('--output', type=Path, default=Path('ml/reports'))
    repair = commands.add_parser('repair-artifacts')
    repair.add_argument('--study', type=Path, default=Path('ml/artifacts/multihorizon/study.json'))
    repair.add_argument('--dataset', type=Path, default=Path('ml/data/normalized-v2'))
    repair.add_argument('--output', type=Path, default=Path('ml/artifacts/multihorizon/study-repaired.json'))
    repair.add_argument('--algorithm', choices=['xgboost', 'random_forest'], default='xgboost')
    research = commands.add_parser('objective-research')
    research.add_argument('--dataset', type=Path, default=Path('ml/data/normalized-v2'))
    research.add_argument('--output', type=Path, default=Path('ml/artifacts/objectives-v1'))
    research.add_argument('--protocol', type=Path, default=Path('ml/multihorizon/objective_study.json'))
    research.add_argument('--symbol')
    research.add_argument('--horizon', choices=['1m', '15m', '1h'])
    research.add_argument('--pair-process', action='store_true', help=argparse.SUPPRESS)
    objectives_report = commands.add_parser('objective-report')
    objectives_report.add_argument('--study', type=Path, default=Path('ml/artifacts/objectives-study-2026-11-16'))
    objectives_report.add_argument('--output', type=Path, default=Path('ml/reports/objectives-phase2'))
    objectives_report.add_argument('--explain', action='store_true')
    objectives_report.add_argument('--plots', action='store_true')
    objectives_catalog = commands.add_parser('objective-catalog')
    objectives_catalog.add_argument('--study', type=Path, default=Path('ml/artifacts/objectives-study-2026-11-16'))
    objectives_catalog.add_argument('--output', type=Path, default=Path('ml/artifacts/objective-registry/registry.json'))
    args = parser.parse_args(argv)
    if args.command == 'selection-review':
        from multihorizon.selection_review import replay_pair, run_replays
        if args.pair_process:
            from multihorizon.benchmark import ResourceMonitor
            from multihorizon.data import save_json
            with ResourceMonitor() as memory:
                path = args.replay_output/f'{args.symbol}-{args.horizon}.json'
                value = replay_pair(args.study, args.dataset, args.symbol, args.horizon, path)
            value['sampledPeakRssMiB'] = memory.peak/1024**2
            if value['sampledPeakRssMiB'] > 2048:
                raise MemoryError('review_memory_budget')
            save_json(path, value)
            return 0
        if args.replay:
            run_replays(args.study, args.dataset, args.replay_output)
        from multihorizon.selection_review import export_review
        result = export_review(args.study, args.price_study, args.previous, args.replay_output, args.output)
        print(json.dumps(result['summary']))
        return 0
    if args.command == 'local-prepare':
        from multihorizon.local_selection import prepare_local
        result = prepare_local(args.study, args.price_study, args.dataset, args.output)
        print(json.dumps({'policy': result['policy'], 'experimentalObjectives': sum(r['status'] == 'experimental' for r in result['objectives']),
            'experimentalPrices': sum(r['status'] == 'experimental' for r in result['prices']), 'trainingPerformed': False}))
        return 0
    if args.command == 'objective-report':
        from multihorizon.objective_reports import export_objective_report
        result = export_objective_report(args.study, args.output, explain=args.explain)
        if args.plots:
            from multihorizon.objective_plots import plot_reliability
            plots = plot_reliability(args.output)
            with (args.output/'RESULTS.md').open('a', encoding='utf-8') as document:
                document.write('\n## Development reliability figures\n\n')
                for name in plots['figures']:
                    document.write(f'- [{name}]({name})\n')
            print(json.dumps(plots))
        print(json.dumps({'configurations': result['plannedConfigurations'], 'incomplete': len(result['incompleteOrFailed']),
                          'productionAccepted': result['productionAcceptedObjectives']}))
        return 0
    if args.command == 'objective-catalog':
        from multihorizon.objective_registry import catalog_from_study
        result = catalog_from_study(args.study, args.output)
        print(json.dumps({'pairs': len(result['entries']), 'status': 'research_only_until_future_confirmation'}))
        return 0
    if args.command == 'objective-research':
        from multihorizon.objective_research import run_study, run_pair
        if args.pair_process:
            run_pair(args.dataset, args.output/args.symbol/args.horizon, args.symbol, args.horizon,
                     json.loads(args.protocol.read_text(encoding='utf-8')))
            return 0
        outcomes = run_study(args.dataset, args.output, symbol=args.symbol, horizon=args.horizon, protocol_path=args.protocol)
        return 0 if all(x['status'] in ('completed', 'cached') for x in outcomes) else 1
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
        from multihorizon.objective_registry import ObjectiveRegistry
        run_worker(Registry(args.registry), args.output, once=args.once, stop=stop,
            objective_registry=ObjectiveRegistry(args.objective_registry) if args.objective_registry else None,
            objective_output=args.objective_output)
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
