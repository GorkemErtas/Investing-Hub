"""Small shared contracts for the local, offline lifecycle."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DAY_MS = 86_400_000
# Read the bounded literal catalog, never execute JavaScript or maintain a
# second Python asset list. A changed declaration fails closed.
def supported_symbols():
    text = (ROOT.parent / 'shared' / 'contracts.ts').read_text(encoding='utf-8')
    match = re.search(r'export const assets = \[(.*?)\] as const;', text, re.S)
    if not match:
        raise ValueError('Shared asset catalog declaration missing')
    symbols = tuple(re.findall(r'symbol:\s*"([A-Z0-9]+USDT)"', match[1]))
    if not symbols or len(symbols) != len(set(symbols)):
        raise ValueError('Invalid shared asset catalog')
    return symbols


SYMBOLS = supported_symbols()
COLUMNS = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time']
TERMS = 'https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md'


def utc_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def iso(value: int) -> str:
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat()


def day(value: str) -> int:
    parsed = datetime.strptime(value, '%Y-%m-%d').replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def latest_open(now: int) -> int:
    return now // DAY_MS * DAY_MS - DAY_MS


def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def symbol_check(symbol: str) -> str:
    if symbol not in SYMBOLS:
        raise ValueError(f'Unsupported prediction symbol: {symbol}')
    return symbol


def load_config(path: Path | None = None) -> dict:
    config = json.loads((path or ROOT / 'config.json').read_text(encoding='utf-8'))
    if config['symbols'] == 'shared':
        config['symbols'] = list(SYMBOLS)
    if not config['symbols'] or not set(config['symbols']).issubset(SYMBOLS):
        raise ValueError('Invalid configured symbols')
    for key in ('walk_forward_splits', 'fold_days', 'holdout_days', 'min_train_samples', 'lookback', 'lstm_hidden', 'lstm_epochs', 'lstm_batch_size'):
        if not isinstance(config[key], int) or config[key] < 1:
            raise ValueError('Invalid positive training configuration: '+key)
    if config['walk_forward_splits'] < 2 or config['min_train_samples'] < 30 or config['fold_days'] < 2 or config['holdout_days'] < 2:
        raise ValueError('Insufficient chronological evaluation samples')
    if not 1 <= config['lookback'] <= 64 or not 1 <= config['lstm_hidden'] <= 64:
        raise ValueError('Unsupported bounded LSTM dimensions')
    if not 0 < config['max_absolute_daily_return'] <= .8 or not 0 <= config['selection_tolerance'] <= .05:
        raise ValueError('Invalid integrity threshold or selection tolerance')
    if not 0 < config['lstm_learning_rate'] <= .1:
        raise ValueError('Invalid learning rate')
    day(config['start_date'])
    return config
