"""Identical return/price metrics for offline evaluation and realized outcomes."""
import numpy as np


def metrics(target, predicted, close):
    # Scoring is shared by fitting and reconciliation, never forecast generation.
    from sklearn.metrics import mean_absolute_error, mean_squared_error

    target, predicted, close = (np.asarray(v, dtype=float) for v in (target, predicted, close))
    return {'return_mae': float(mean_absolute_error(target, predicted)),
            'return_rmse': float(np.sqrt(mean_squared_error(target, predicted))),
            'price_mae_usdt': float(mean_absolute_error(close * (1 + target), close * (1 + predicted))),
            'price_rmse_usdt': float(np.sqrt(mean_squared_error(close * (1 + target), close * (1 + predicted)))),
            'directional_accuracy': float(np.mean(np.sign(target) == np.sign(predicted))),
            'samples': len(target)}
