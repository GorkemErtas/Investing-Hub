#!/bin/sh
# Run from repository root with the project's Python venv installed.
set -eu
cd "$(dirname "$0")/.."
exec .venv/bin/python ml/pipeline.py daily --db ml/data/lifecycle.sqlite3 --output ml/data/predictions.json --log-directory ml/data/logs/daily
