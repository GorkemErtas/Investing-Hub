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
    args = parser.parse_args(argv)
    from multihorizon.data import normalize as run
    report = run(args.source, args.output)
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2))
    return 0 if report['status'] == 'valid' else 1


if __name__ == '__main__':
    raise SystemExit(main())
