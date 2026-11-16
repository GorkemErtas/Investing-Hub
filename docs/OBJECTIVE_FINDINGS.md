# Phase 2 measured findings

The registered study completed **768/768 configurations across 24 symbol/horizon
pairs**, with no failed main-study trials. Two direction candidates and three
volatility candidates meet the development gates. **No numerical objective is
accepted for publication.** The genuinely future confirmation window is
2026-12-01 to 2027-03-01 exclusive, UTC; it has not occurred at study time.

The [complete decision and trial tables](../ml/reports/objectives-phase2/RESULTS.md)
link to [fingerprinted per-pair evidence](../ml/reports/objectives-phase2/evidence.json).
The [registered protocol](../ml/multihorizon/objective_study.json) fixes the matrix,
budget, losses, costs and selection rules. [Operations and reproduction](OBJECTIVE_FORECASTS.md)
describe the separate objectives, API, worker and UI.
[Verification](OBJECTIVE_VERIFICATION.md) records actual test results and their scope.

## Why the original price benchmark selected nothing

The preserved [price evidence](../ml/reports/FORECAST_BENCHMARK.md) compares six
fitted families against zero future return, across eight coins and three horizons.
Only six pairs have any candidate with lower validation RMSE than that baseline;
the largest advantage is DOGE/1m Ridge at approximately **0.396%**, below the
unchanged 1% requirement. Its inspected holdout RMSE is 5.31% worse than baseline.
This alone explains the absence of selections, even before fold stability and
multiplicity checks. A no-change *price* forecast is a strong baseline when the
conditional expected minute return is close to zero.

Inspection found correct forward log-return targets, past-only features,
train-only scaling, purged chronological boundaries and matched evaluation
origins. Existing numeric export parity and corruption checks remain in place.
No target reversal or evaluation bug was found that would rescue these results.
The old zero-return baseline's reported sign accuracy counts only exact zero
outcomes; comparing that accuracy directly with a classifier would be misleading.
Phase 2 therefore uses proper probabilistic classification baselines and scores.

The original CPU pilot fits at most 12,000 evenly spaced training rows and a
three-epoch small LSTM. It is not an exhaustive estimate of each family's best
possible performance. Phase 2's controlled legacy-feature logistic comparison
raises the cap from 12,000 to 36,000 while holding the 180-day window fixed.
Log loss improves in 17/24 pairs, but the mean relative improvement is only
**0.0723%**. This classification experiment does not prove a larger regression
budget would fail; it does not support attributing all failed price gates to
training budget either. Window length and feature expansion in other comparisons
change together, so their separate causal effects cannot be identified.

[Pre-validation diagnostics](../ml/reports/objectives-phase2/diagnostics.json)
use only history before 2026-05-27. Minute return lag-one correlations are small
for most coins, while squared-return correlations are **0.287–0.366**. Between
**96.2% and 98.94%** of minute moves fall inside the assumed 24bp round-trip cost.
One-minute realized-variance coefficients of variation are **5.49–10.63**,
compared with roughly **1.72–2.44** at one hour. Both signed returns and the
one-minute variance target are noisy; volatility persistence is clearer.

LINK is a source-quality research priority: 37.97% of minute returns are exactly
zero and its lag-one correlation is -0.130. ADA also has 19.12% zero minute
returns. Tick size, price precision and microstructure can create these patterns.
The supplied source archives are unavailable for independent provenance checks;
these diagnostics do not establish that the dataset is invalid. Do not interpret
the LINK correlation as executable alpha without those checks.

## Experiments and fit behavior

Each pair has 12 direction configurations/label variants, seven direction group
ablations, five fitted volatility models and eight fixed volatility Ridge
reference/ablations. Direction covers Logistic Regression, Random Forest,
LightGBM, XGBoost and LSTM. Volatility includes HAR-RV, GARCH(1,1), LightGBM and
XGBoost, with rolling, EWMA and historical-mean baselines. Every result, fixed
hyperparameter bundle, baseline comparison and unsuccessful configuration appears
in the evidence. No trial was added because an earlier result looked promising.

Stronger logistic regularization (`C=0.1` to `0.01`) improves mean relative log
loss by **0.0307%**. Mean apparent validation-minus-training raw log-loss gaps are
0.0148 for Logistic, 0.0353 for Random Forest, 0.0540 for LightGBM, 0.0296 for
XGBoost and 0.0233 for LSTM. These diagnostics compare the recent 2,048 fitted
rows with the later validation period: drift and sampling contribute to the gap,
so it cannot measure pure overfitting. Tree gaps suggest regularization is useful;
near-baseline scores across families also indicate weak available directional
signal. Five LSTM epochs and small hidden state leave its capacity question open.
There is no basis to declare a neural model inherently better from this study.

Class-prior, uniform, majority and calibration-fitted momentum baselines are
evaluated on exactly the same origins. Candidate-independent baseline training
windows prevent a model winning merely because its comparator changed. Binary
controls' baseline-relative log-loss improvements range from **-0.61% to 3.20%**
(mean 0.17%); binary targets exclude zero outcomes and are conditional on a move.
They are not comparable directly with three-class scores or live unconditional
direction probabilities. Class counts, balanced accuracy and MCC accompany raw
accuracy; neutral frequency is not evidence of directional skill.

## Feature ablation and explainability

| Removed group | Direction log-loss change | Volatility MAE change |
|---|---:|---:|
| Multi-scale returns | -0.027% | +0.075% |
| Volatility | +0.675% | +17.832% |
| Activity / taker imbalance | +0.008% | -0.492% |
| Candle structure | -0.020% | -0.144% |
| Trend | -0.016% | +0.309% |
| Lagged BTC/ETH | -0.022% | +0.592% |
| Clock | -0.006% | -0.219% |

These are means across all 24 pairs for fixed rich Logistic and log-RV Ridge
references; positive values mean removal hurts. Volatility features help most.
Extra indicators do not consistently improve direction, and activity/structure
can hurt the fixed volatility reference. Effects are model-dependent and these
averages have no independent confirmatory status. No feature was removed or new
trial fitted after inspecting these results.

One/three/seven-day circular group shifts measure model reliance on the last
development fold. The five development candidates all have explanations.
ETH/1m LightGBM relies most on volatility and activity; ETH/15m Logistic and the
volatility candidates rely most on volatility. Correlated group shifts can create
unrealistic combinations; this is descriptive permutation evidence, not causality.
SHAP is deferred until a complex model survives prospective validation. Most
reference explanations completed; LINK/15m is partial and LINK/1h was unexecuted
when the explanation budget ended. The complete 768-trial benchmark is unaffected.

## Candidates, calibration and uncertainty

| Objective | Pair / model | Baseline-relative gain | Quality | Adjusted lower proper-loss gain |
|---|---|---:|---|---:|
| Direction | ETH/1m LightGBM regularized | 1.68% log loss | BA .353; MCC .061; ECE .024 | .000869 |
| Direction | ETH/15m Logistic regularized | 1.19% log loss | BA .353; MCC .059; ECE .020 | .005383 |
| Volatility | BTC/1h HAR regularized | 2.95% MAE | 87.7% interval coverage | .004577 |
| Volatility | SOL/1h LightGBM | 12.29% MAE | 89.3% interval coverage | .008022 |
| Volatility | BNB/15m LightGBM | 4.76% MAE | 88.4% interval coverage | .018667 |

The lower bound is in **daily mean log-loss units for direction and QLIKE units
for volatility**, not percentage points or a return forecast. It uses lag-seven
HAC standard errors, effective weekly Student-t degrees of freedom, Bonferroni
family size **912 = 768 planned + 144 prior comparisons**, and family alpha .05.
There are 84 scored days but only 12 effective weekly blocks. Seven-day circular
bootstrap 95% intervals in the JSON are descriptive, unadjusted intervals.
Dependence, stationarity and small-sample assumptions remain approximate; neither
calculation grants guaranteed family-wise coverage in financial time series.

Temperature scaling is fitted on a separate preceding 14-day segment, with
horizon purging and a one-minute embargo. Raw and calibrated fold scores and
reliability bins are retained. [Reliability figures](../ml/reports/objectives-phase2/RESULTS.md#development-reliability-figures)
show all eight coins per horizon; bins with fewer than 25 observations are omitted
from figures, retained in JSON. Aggregate ECE hides subgroup defects: ETH/1m's last
fold low-volatility ECE is .057 despite its aggregate passing value.

Volatility intervals target 90% coverage, using past calibration log-sigma
residuals; measured coverage is lower for these candidates and has no iid coverage
guarantee. Risk categories use training-only variance quantiles. Neither an interval
nor a risk category is a price projection or a probability of profit/loss.

Larger headline gains can fail: ADA/1h volatility improves MAE 15.02% yet fails
the complete gate; ETH/1h volatility improves 11.60% and also fails. BTC/1m
direction improves 2.44% but fails. The decision table retains these negative
decisions rather than lowering thresholds.

Regime cuts use training-only volatility quantiles. Last-fold ETH/15m loses
slightly on log loss in the medium-volatility group; BTC/1h and SOL/1h lose on
MAE in quiet markets despite QLIKE gains. High-volatility errors contribute much
of their overall MAE advantage. Stability is measured on the sampled origins:
ETH candidate label flip rates are 15.5% and 18.8%; these are not minute-by-minute
live flip estimates. Last-fold signed nonneutral balanced accuracy is about .535
and .539, a post hoc diagnostic requiring independent confirmation.

Both qualified direction candidates take **zero nonzero decisions** under the
registered .60 probability rule and 12bp per-turnover cost. Zero net return here
means no trades, not profitable forecasting. Sparse non-overlapping simulations
omit order-book execution, funding and market impact. No trading edge is claimed.

## Resources and remaining production work

| Measurement | Observed local value |
|---|---|
| Main study / engineering pilot | 3,185.0s / 180.2s |
| Optional explanations | 240.5s |
| Combined measured compute | 3,605.7s; **5.7s over** the 3,600s budget |
| Fit limit | One thread; 36,000 rows; 180s/pair; 2GiB process limit |
| Main peak sampled RSS | 1,184.8MiB |
| Numeric median single-origin latency, range across artifacts | 0.0104–98.2344ms |
| Numeric artifact sizes | 826–1,578,504 bytes |
| Maximum recorded export parity error | 1.46e-7 |
| Live BTC 1,536-minute two-page fetch | 4,063ms |
| Feature preparation plus ETH peer fetch | 4,015ms, includes network |
| Inactive worker, 32 bundles / zero numeric objectives | 17.74ms; 154.7MiB RSS; zero network requests |

The first engineering pilot timed out from repeated baseline work; its completed
and unexecuted trials/source hashes are preserved separately. Baseline caching
resolved that implementation bottleneck without selecting different trials.
All main fits completed within their limits. The optional explanation guard
originally checked between model batches and overshot the combined hour by 5.7s;
future reporting requires a 15-second admission margin. No extra model fitting or
explanations were run to replace missing results. This is a disclosed budget
exception, not an assertion that every stage met the exact cap.

Latency excludes provider, feature computation and scheduler overhead. Provider
measurements are single local observations, not tail-latency estimates or Railway
capacity tests. The inactive worker measurement is not an active deployment load
test. GARCH matches native causal forecasts in tests but remains research-only
until bounded live state recovery is designed and validated. Raw weights, CSVs,
Parquet and runtime publications remain outside Git; reviewable metrics are committed.

Keep all direction, volatility and price numerical publication disabled. Freeze
candidate artifacts before December, collect complete future minutes and evaluate
all 60 UTC minute phases with overlap-aware uncertainty (at least 100 origins per
phase), using the same gates and an expanded comparison family if experiments are
added. Current artifacts are last-development-fold fits, not October refits. Any
refit changes the checksum and needs its own freeze and confirmation. Do not tune
on the confirmation period. The existing daily SQLite system remains operational.

The next research priority is provenance/tick-size verification and a prospective
volatility study at 15m/1h. If new evidence supports further direction work, register
a separate bounded experiment with execution-quality or microstructure inputs;
adding more candle indicators or brute-force tuning is not justified by these
ablation results. No live Railway service, historical dataset or legacy model was
changed, and PR #9 remains unmerged.
