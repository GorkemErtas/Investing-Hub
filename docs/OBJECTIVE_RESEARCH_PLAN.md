# Direction and volatility research registration

This continues PR #9 on its existing branch. The executable fixed matrix is
[`objective_study.json`](../ml/multihorizon/objective_study.json), committed before
running the new trials. Source CSV/Parquet and previous model evidence remain intact.

## Questions and first-benchmark diagnosis

Only six of 24 pairs showed any validation RMSE advantage; the best was 0.396%,
below the unchanged 1% price gate. All family-average RMSE ratios were worse than
no-change. LSTM improved no pair. Most Ridge group ablations changed error by less
than 0.1%. These observations suggest weak conditional-return signal and estimation
noise, not evidence that thresholds should be relaxed. They do not distinguish
underfit from overfit without training/validation gaps and budget controls.

The original 12,000 fit origins cover less than 3% of minute rows. They can alias
intraday states; shallow trees and three neural epochs were an intentionally small
pilot. Absolute quote/trade levels may drift; longer lagged, normalized activity,
trend and cross-asset information were absent. The new study measures these issues.
Alignment/purge/serialization tests remain mandatory. The five old tree-export
failures were inference defects already repaired, not explanations for the models'
native out-of-sample error. Existing targets are legitimate future log returns;
that does not imply conditional means are predictable from OHLCV.

Direction and volatility are separate tasks. Binary direction conditions on a
nonzero move; three-class direction adds an origin-known volatility/noise zone.
Neither label claims a move pays transaction costs. Realized volatility is the
square root of the **sum of future squared minute log returns**; it measures total
movement, not a signed return or a future price. A one-minute realized variance is
one squared return and is especially noisy. No annualization is applied.

## Fixed chronology and resource budget

Reuse the original June–August development walk-forward windows (explicit UTC
boundaries in the matrix). Each fold separates fitting, purged 14-day probability/
interval calibration and validation, with horizon purging and one-minute embargo.
Every trial uses identical eligible origins within its task/label definition.
Fit-only transforms/class counts, origin-only neutral thresholds and exact lagged
cross-asset alignment prevent leakage. Training learning curves compare 12k/36k
origins; fixed regularization/window variants measure generalization gaps.

All 2025-11 through 2026-10 history, including the already inspected old holdout,
is **development evidence**. Reserve **2026-12-01 through 2027-02-28 UTC**, end
exclusive 2027-03-01, for a genuinely future confirmation of frozen candidates.
That data is not available now. No retrospective result activates a production
forecast. Future confirmation needs adequate effective sample size, stable regime
performance and the same gates; elapsed calendar time alone is insufficient.

Budget: one pair/process, one numerical thread, at most 36k fit origins,
2 GiB observed process RSS, 180 seconds/pair and 3,600 seconds total execution.
Failures/timeouts/unexecuted trials are recorded explicitly. Nine direction model
configurations cover five families, with binary checks on three fixed controls;
five fitted volatility configurations plus four baselines cover HAR/GARCH/boosting.
Seven fixed group ablations use lightweight models. No adaptive search or new
hyperparameters are added after seeing results. Missing GARCH dependencies or
nonconvergence are reported; no synthetic substitute is fitted to real-data studies.

## Calibration, selection and uncertainty

Temperature calibration uses a separate historical calibration segment; report
raw and calibrated log loss/Brier, classwise reliability, ECE, balanced accuracy,
MCC and class counts. Class imbalance is evaluated without validation-based
resampling or retrospective class balancing. A model score is not a probability
until its calibration artifact and measured reliability have been validated.

Volatility compares rolling, EWMA, unconditional and HAR/GARCH/tree models. QLIKE
uses `log(forecast_variance) + actual_variance/forecast_variance`, which is valid for
zero realized variance with strictly positive forecasts. Report volatility MAE,
actual 90% interval coverage, widths, calibration and volatility-regime stability.
Intervals use past-only split conformal log-volatility residuals; serial dependence
means nominal coverage is not a finite-sample guarantee.

The old return gate stays unchanged. New direction/volatility gates independently
require meaningful baseline-relative loss improvement, every-fold wins, calibration,
and multiplicity-adjusted evidence. All planned tests and the 144 earlier comparisons
count toward the family size. Seven-day block intervals and HAC uncertainty retain
daily dependence; their approximations and limited effective blocks are disclosed.
Historical eligibility and prospective acceptance are distinct; the latter remains
unavailable until future evidence exists. Direction can qualify independently of
volatility. Price remains optional experimental research and cannot inherit another
objective's success.

## Implementation and compatibility

Extend `ml/multihorizon`, the current bounded live provider/worker, strict shared
contracts and the existing ForecastPanel. Preserve v1/v2 and native clients.
Research features/artifacts have separate versions; unconfirmed research cannot
enter the active price registry. No additional page, training HTTP handler,
production deployment or Railway mutation is part of this task.

Method references: [probability calibration](https://scikit-learn.org/stable/modules/calibration.html),
[permutation importance](https://scikit-learn.org/stable/modules/permutation_importance.html),
[GARCH analytical forecasts](https://arch.readthedocs.io/en/latest/univariate/forecasting.html).
