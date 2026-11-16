# Development stability and leakage review

[All per-model scores, regimes, event tails and reliability bins](evidence.json).

These are descriptive development diagnostics. They do not establish independent validation, trading profit or a new activation gate.

## Fold and regime consistency

| Objective | Wins in all three folds | Last-fold low-volatility wins | Medium wins | High wins |
|---|---|---|---|---|
| direction | 22/24 | 23/24 | 18/24 | 21/24 |
| volatility | 15/24 | 7/24 | 8/24 | 18/24 |

Regime cuts use each fitted model’s training-only past-variance quantiles. Model/baseline comparisons share the same regime mask; regime cuts can differ between models/windows, so regime counts are not a direct old/new causal comparison.

## Sensitivity to large moves

- direction: the largest realized-volatility 1% of observations account for 1.01%–1.51% of primary loss. Removing them reverses a last-fold baseline win in: DOGEUSDT/15m.
- volatility: the largest realized-volatility 1% of observations account for 2.56%–18.53% of primary loss. Removing them reverses a last-fold baseline win in: SOLUSDT/15m, BNBUSDT/15m, DOGEUSDT/15m.

The JSON also slices absolute net returns and the largest absolute paired-loss contributions. Exact top ceil(n/100) counts and stable sorting avoid ambiguous quantile ties. These ex-post event labels are never used as prediction features.

## Uncertainty

| Horizon | Very wide volatility intervals | Coverage >5 percentage points from 90% | Observed last-fold coverage range |
|---|---|---|---|
| 1m | 8/8 | 0/8 | 88.4%–94.5% |
| 15m | 0/8 | 1/8 | 82.1%–92.3% |
| 1h | 0/8 | 2/8 | 80.8%–93.3% |

Very wide means median interval width exceeds ten times forecast volatility, a descriptive flag. Minute zero-return observations combined with the log-sigma floor can create enormous bands with plausible coverage but little precision. Widths remain volatility units, never price ranges.
Direction reports preserve pooled classwise reliability/ECE, calibrated Log Loss/Brier/BA/MCC, fold calibration scores and normalization checks. Historical calibration does not guarantee current accuracy.

In original fold records, calibration temperature/sample count describe the preceding calibration fit; rawEce/calibratedEce under that object describe validation quality, not fit-window accuracy. The separate rawMetrics field also refers to validation.

## Leakage audit and limits

- Target alignment, past-only feature mutation, exact one-minute peer lag, bounded history parity, scaler isolation, completed candles and duplicate/gap/nonfinite rejection remain covered by regression tests.
- Replay uses original origin fingerprints, purged training/calibration boundaries and nonoverlapping horizon returns. Adjacent return intervals can share an endpoint without sharing an increment.
- Feature construction for this replay stops before 2026-09-02 UTC. Selection and additional scoring do not use final holdout performance.
- Price deployment refits can contain development observations. Replaying those artifacts on development dates would leak training information; recorded walk-forward scores are retained instead.
- Fixed UTC phase thinning, only 84 development days, post-selection optimism, drift and unavailable earlier-fold weights limit inference. Last-fold event diagnostics have only 28 days.
- The genuine interval-reporting mismatch is fixed: last-fold radius pairs with last-fold coverage; aggregate cross-fold coverage is separate.

## Further experiments

Existing feature ablations select different groups by asset/horizon; they do not justify a universal indicator removal. Prior small regularization gains and unstable regime/event results do not justify another broad search. No new candidate fitting was run. Next research should pre-register zero-aware volatility calibration and prospective regime/phase coverage, with fresh evaluation data and a fixed budget.

Primary references: [loss metrics](https://scikit-learn.org/stable/modules/model_evaluation.html#mean-absolute-error), [probability calibration](https://scikit-learn.org/stable/modules/calibration.html).
