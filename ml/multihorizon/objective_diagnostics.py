"""Descriptive pre-validation diagnostics; never changes the registered model matrix."""
import numpy as np
from .data import SYMBOLS, load_symbol, save_json
from .objective_research import timestamp


def diagnose(dataset, output):
    cutoff = timestamp('2026-05-27')
    coins = []
    for symbol in SYMBOLS:
        frame, fingerprint = load_symbol(dataset, symbol)
        log = np.log(frame.close)
        returns = log.diff()
        past = returns[frame.close_time < cutoff].dropna()
        square = past.pow(2)
        record = {'symbol': symbol, 'datasetFingerprint': fingerprint,
            'periodEndExclusiveMs': cutoff, 'minuteObservations': len(past),
            'lagReturnCorrelation': {str(lag): float(past.autocorr(lag)) for lag in (1, 15, 60)},
            'lagSquaredReturnCorrelation': {str(lag): float(square.autocorr(lag)) for lag in (1, 15, 60)},
            'targetDiagnostics': {}}
        for horizon in (1, 15, 60):
            selected = (frame.close_time+horizon*60000 < cutoff)
            target = (log.shift(-horizon)-log)[selected].dropna()
            rv = returns.pow(2).rolling(horizon).sum().shift(-horizon)[selected].dropna()
            record['targetDiagnostics'][str(horizon)] = {'zeroReturnFraction': float((target == 0).mean()),
                'within24bpRoundTripCost': float((target.abs() <= .0024).mean()),
                'logReturnStd': float(target.std()), 'realizedVarianceCoefficientOfVariation': float(rv.std()/rv.mean())}
        coins.append(record)
    result = {'scope': 'descriptive pre-validation history only; no hypothesis testing or model tuning', 'coins': coins}
    save_json(output, result)
    return result
