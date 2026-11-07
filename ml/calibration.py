"""Chronological absolute-return residual calibration; no invented price band."""
from __future__ import annotations

import math
import numpy as np

NOMINAL_COVERAGE = 0.9


def fit_interval(residuals, calibration_end, validation_start, actual, predicted, evaluated_at):
    errors = np.abs(np.asarray(residuals, dtype=float))
    if len(errors) < 30 or not np.isfinite(errors).all() or calibration_end >= validation_start or evaluated_at < validation_start:
        raise ValueError('Insufficient or noncausal out-of-sample residual calibration')
    rank = min(len(errors), math.ceil((len(errors) + 1) * NOMINAL_COVERAGE))
    radius = float(np.sort(errors)[rank - 1])
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if not len(actual) or len(actual) != len(predicted) or not np.isfinite([*actual, *predicted]).all():
        raise ValueError('Invalid chronological interval evaluation')
    coverage = float(np.mean(np.abs(actual - predicted) <= radius))
    return {'method': 'chronological_oos_absolute_return_quantile_v1', 'nominalCoverage': NOMINAL_COVERAGE,
            'radiusReturn': radius, 'calibrationSamples': len(errors), 'calibrationEnd': int(calibration_end),
            'validationStart': int(validation_start), 'validationSamples': len(actual),
            'empiricalCoverage': coverage, 'evaluatedAt': int(evaluated_at),
            'status': 'empirically_calibrated' if coverage >= NOMINAL_COVERAGE else 'experimental'}


def price_interval(calibration, reference, predicted_return):
    if not calibration or calibration['status'] != 'empirically_calibrated':
        return None
    radius = calibration['radiusReturn']
    lower, upper = reference * (1 + predicted_return - radius), reference * (1 + predicted_return + radius)
    if not all(math.isfinite(v) for v in (lower, upper, radius)) or radius < 0 or lower <= 0 or upper < lower:
        return None
    return {**calibration, 'lowerPrice': lower, 'upperPrice': upper}
