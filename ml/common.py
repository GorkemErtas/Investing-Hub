"""Small shared contracts for the local, offline lifecycle."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DAY_MS = 86_400_000
SYMBOLS = ('BTCUSDT', 'ETHUSDT')
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
        raise ValueError(f'Unsupported research symbol: {symbol}')
    return symbol


def load_config(path: Path | None = None) -> dict:
    config = json.loads((path or ROOT / 'config.json').read_text(encoding='utf-8'))
    if not config['symbols'] or not set(config['symbols']).issubset(SYMBOLS):
        raise ValueError('Invalid configured symbols')
    if config['window_mode'] not in ('rolling', 'expanding'):
        raise ValueError('window_mode must be rolling or expanding')
    if config['walk_forward_splits'] < 2 or config['min_train_samples'] < 30:
        raise ValueError('Insufficient walk-forward/training samples')
    if not 1 <= config['minimum_fold_wins'] <= config['walk_forward_splits'] or config['fold_days'] < 2:
        raise ValueError('Invalid fold size or minimum fold wins')
    years = config['training_years']
    if not years or len(set(years)) != len(years) or any(y not in (None, 1, 2, 3) for y in years):
        raise ValueError('Training windows must be unique full-history/null, 3, 2 or 1 years')
    if not 0 < config['max_absolute_daily_return'] <= 1:
        raise ValueError('Invalid daily-return anomaly threshold')
    if not 0 <= config['required_relative_rmse_improvement'] < 1:
        raise ValueError('Invalid improvement threshold')
    if config['min_forward_samples'] < 30 or config['max_model_age_days'] < 1:
        raise ValueError('Forward evaluation requires at least 30 samples and a positive model age')
    # All previously inspected periods are development data, including 2026.
    if day(config['development_end_exclusive']) != day('2027-01-01'):
        raise ValueError('Development cutoff is frozen at 2027-01-01; 2026 is already inspected')
    day(config['start_date'])
    return config
