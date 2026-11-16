"""Proper objective metrics, chronological calibration, and dependent-loss uncertainty."""
import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import softmax
from scipy.stats import t as student_t
from sklearn.metrics import balanced_accuracy_score, matthews_corrcoef

DAY = 86400000


def probabilities(values):
    values = np.asarray(values, dtype=float)
    if values.ndim != 2 or not np.isfinite(values).all() or (values < 0).any() or (values.sum(axis=1) <= 0).any():
        raise ValueError('invalid_class_probabilities')
    values = np.clip(values, 1e-8, 1)
    return values/values.sum(axis=1, keepdims=True)


def calibrate_temperature(raw, labels):
    p = probabilities(raw)
    y = np.asarray(labels, dtype=int)
    if len(p) < 100 or len(np.unique(y)) < 2:
        raise ValueError('insufficient_chronological_calibration')
    result = minimize_scalar(lambda temperature: float(-np.log(
        np.clip(softmax(np.log(p)/temperature, axis=1)[np.arange(len(y)), y], 1e-12, 1)).mean()),
        bounds=(.25, 4.), method='bounded', options={'maxiter': 50})
    if not result.success:
        raise ValueError('temperature_calibration_failed')
    return float(result.x)


def apply_temperature(raw, temperature):
    if not .25 <= temperature <= 4:
        raise ValueError('invalid_temperature')
    return softmax(np.log(probabilities(raw))/temperature, axis=1)


def direction_metrics(y, raw, returns=None, cost=.0012):
    y, p = np.asarray(y, dtype=int), probabilities(raw)
    prediction = p.argmax(axis=1)
    labels = np.eye(p.shape[1])[y]
    logloss = -np.log(p[np.arange(len(y)), y])
    brier = np.sum((p-labels)**2, axis=1)
    reliability, class_ece = [], []
    for label in range(p.shape[1]):
        total = 0.
        for bin_index in range(10):
            selected = (p[:, label] >= bin_index/10) & (p[:, label] < (bin_index+1)/10 if bin_index < 9 else p[:, label] <= 1)
            if selected.any():
                average, observed = float(p[selected, label].mean()), float((y[selected] == label).mean())
                total += selected.mean()*abs(average-observed)
                reliability.append({'class': label, 'bin': bin_index, 'samples': int(selected.sum()), 'probability': average, 'observedFrequency': observed})
        class_ece.append(float(total))
    result = {'logLoss': float(logloss.mean()), 'brier': float(brier.mean()),
        'balancedAccuracy': float(balanced_accuracy_score(y, prediction)),
        'mcc': float(matthews_corrcoef(y, prediction)), 'accuracy': float(np.mean(prediction == y)),
        'ece': float(max(class_ece)), 'classCounts': np.bincount(y, minlength=p.shape[1]).tolist(),
        'reliability': reliability}
    if returns is not None:
        down, up = p[:, 0], p[:, -1]
        position = np.where(up >= .6, 1, np.where(down >= .6, -1, 0))
        turnover = np.abs(np.diff(np.r_[0, position])).astype(float)
        turnover[-1] += abs(position[-1])
        net = position*np.expm1(returns)-cost*turnover
        result['costDiagnostic'] = {'costPerTurnover': cost, 'turnover': float(turnover.sum()),
            'nonzeroDecisions': int((position != 0).sum()), 'netReturnSum': float(net.sum()),
            'netMean': float(net.mean()), 'netStd': float(net.std()),
            'meanOverStd': float(net.mean()/net.std()) if net.std() else None,
            'note': 'sampled nonoverlapping decisions, no annualized profitability claim'}
    return result, logloss


def volatility_metrics(actual_variance, predicted_variance, interval=None):
    actual, predicted = np.asarray(actual_variance), np.asarray(predicted_variance)
    if not np.isfinite(predicted).all() or (predicted <= 0).any() or not np.isfinite(actual).all() or (actual < 0).any():
        raise ValueError('invalid_volatility_variance')
    loss = np.log(predicted)+actual/predicted
    sigma, forecast = np.sqrt(actual), np.sqrt(predicted)
    result = {'mae': float(np.abs(forecast-sigma).mean()), 'rmse': float(np.sqrt(np.mean((forecast-sigma)**2))),
        'qlike': float(loss.mean()), 'zeroVarianceFraction': float(np.mean(actual == 0)),
        'units': 'nonannualized horizon log-return standard deviation'}
    if interval is not None:
        lower, upper = interval
        result.update(intervalCoverage=float(np.mean((sigma >= lower) & (sigma <= upper))),
                      meanIntervalWidth=float(np.mean(upper-lower)))
    return result, loss


def conformal_radius(actual, forecast, coverage=.9):
    # Symmetric standardized log-sigma residual; finite-sample order statistic.
    residual = np.abs(np.log(np.sqrt(np.asarray(actual))+1e-8)-np.log(np.sqrt(np.asarray(forecast))+1e-8))
    rank = min(len(residual), int(np.ceil((len(residual)+1)*coverage)))
    return float(np.partition(residual, rank-1)[rank-1])


def volatility_interval(variance, radius):
    center = np.sqrt(variance)+1e-8
    return np.maximum(0, center*np.exp(-radius)-1e-8), center*np.exp(radius)-1e-8


def paired_evidence(times, baseline_loss, model_loss, family_size, seed=42):
    times = np.asarray(times, dtype=np.int64)
    values = np.asarray(baseline_loss)-np.asarray(model_loss)
    days = times//DAY
    unique = np.unique(days)
    daily = np.asarray([values[days == day].mean() for day in unique])
    if len(daily) < 28:
        raise ValueError('insufficient_independent_daily_evidence')
    centered = daily-daily.mean()
    n, lag = len(daily), min(7, len(daily)-1)
    covariance = float(centered @ centered/n)
    for k in range(1, lag+1):
        covariance += 2*(1-k/(lag+1))*float(centered[k:] @ centered[:-k]/n)
    se = np.sqrt(max(covariance, 0)/n)
    effective_blocks = max(2, n//7)
    critical = float(student_t.ppf(1-.05/family_size, effective_blocks-1))
    lower = float(daily.mean()-critical*se)
    rng = np.random.default_rng(seed)
    block = 7
    starts = rng.integers(0, n, (4096, int(np.ceil(n/block))))
    indices = (starts[:, :, None]+np.arange(block)) % n
    bootstrap = daily[indices.reshape(4096, -1)[:, :n]].mean(axis=1)
    interval = np.quantile(bootstrap, [.025, .975])
    return {'meanDailyLossImprovement': float(daily.mean()), 'dailyBlocks': n,
        'movingBlockDays': block, 'effectiveWeeklyBlocks': effective_blocks, 'descriptive95Interval': interval.tolist(),
        'hacStandardError': float(se), 'simultaneousLowerImprovement': lower,
        'familySize': family_size, 'familyAlpha': .05,
        'method': 'seven-day circular block bootstrap (descriptive); lag7 HAC Student-t Bonferroni (approximate)'}
