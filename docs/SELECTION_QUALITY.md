# MAE-first model selection review

Volatility now minimizes development **MAE**, then QLIKE, fixed simplicity order
and candidate ID, using the existing 12-decimal tie policy. Direction and price
ranking are unchanged. All models remain experimental; no performance gate was added.

The [24-pair before/after table](../ml/reports/selection-quality/COMPARISON.md)
reports both losses and baselines. [Machine-readable evidence](../ml/reports/selection-quality/evidence.json)
contains all 72 selected objectives, artifact checksums, selection reasons,
baseline alternatives, folds, periods/sample counts, calibration/reliability,
regimes and event-tail diagnostics. The [QLIKE-first manifest](../ml/reports/local-selection-v1.json)
is preserved exactly; the [current manifest](../ml/reports/local-selection.json)
uses `local-development-ranking-v2-mae-first`.

## Measured results

- 18/24 volatility selections changed. Mean pairwise development MAE reduction
  versus the previous model is **3.88%**, median **0.86%**; the other six are unchanged.
- QLIKE worsens in the same 18 pairs. The metrics penalize different errors;
  lower MAE does not imply better variance calibration or all-round improvement.
- Against the same original calibration-selected baseline, MAE wins increase
  from **15/24 to 17/24**. The comparator was originally chosen on calibration
  QLIKE, not MAE. All other rolling/EWMA/mean baselines are also reported; these
  figures do not assert superiority over every possible MAE baseline.
- Three folds provide 8,064 / 8,061 / 2,013 direction/volatility observations for
  1m / 15m / 1h over the registered June–early September 2026 development period.
  Effective source/target boundaries are reported precisely per model/fold.

MAE aligns selection with the displayed horizon-volatility error. QLIKE remains
`log(predictedVariance) + actualVariance/predictedVariance`, a separate diagnostic
that penalizes variance errors differently. Relative improvements use
`100*(baseline-model)/baseline`; zero/missing denominators stay null, never zero.
RMSE aggregates squared loss before taking the square root. MCC, ECE and balanced
accuracy are not fabricated by averaging folds.

## Stability, leakage and uncertainty

[The reproducible stability report](../ml/reports/selection-quality/STABILITY.md)
shows 15/24 volatility models winning all three folds, yet only 7/24 win in their
last-fold quiet-market regime. The largest realized-volatility 1% accounts for
2.56–18.53% of volatility primary loss; removing those observations reverses a
last-fold baseline win for SOL/15m, BNB/15m and DOGE/15m. Regime cuts are fitted
on each model's training-only past variance, and may differ across training windows.
They support within-model baseline comparisons, not causal old/new regime claims.

All eight 1m intervals are very wide: median width is roughly 13–100,453 times
forecast volatility. Coverage alone hides that lack of precision. Last-fold
ETH/15m and ETH/1h coverage is 82.1% and 80.8%, below the 90% target; BTC/1h is
84.4%. These are descriptive warnings, not activation gates. A genuine reporting
mismatch was fixed: the saved last-fold interval radius now uses its own last-fold
coverage. Pooled cross-fold coverage/width remain separate historical diagnostics.

Past-only features, target alignment, exact one-minute peer lag, train-only
preprocessing, purging/embargo, nonoverlapping return increments, original origin
hashes, completed candles and duplicate/gap/nonfinite checks were audited. Replays
must match artifact, dataset and origin identities; failed/stale cached attempts
cannot substitute for current evidence. Only the original last development fold
is replayed, with feature construction truncated at its registered boundary.

Price deployment refits can contain development dates, so they are never rescored
on those dates. Their original walk-forward errors remain the evidence. Earlier
direction/volatility fold weights were not saved; their regime/fold summaries
are preserved, but additional per-observation diagnostics cover only the last fold.
The fixed original momentum baseline was reconstructed on its original training /
calibration rows. No candidate model was fitted or tuned.

## Verification and remaining review issues

Local checks passed: **102 Python tests**, **179 JavaScript tests** (two real-Mongo
cases skipped locally), **28 browser tests**, TypeScript, production build and lint.
New tests cover ranking/ties, missing/zero baselines, RMSE pooling, interval-fold
matching, extreme-event reversals, replay provenance and chronological guards.
Browser tests cover visible primary error/baseline disclosure, unknown comparisons,
wide/poor-coverage warnings, small-volatility precision, optional price metadata,
expiry and existing localization/themes/responsiveness.

All 24 additional replays completed: measured subprocess time 257.0s plus a 6.7s
pilot within the 600s review budget; sampled peak RSS was 1,143.5MiB. Numerical
work used one thread and each pair an isolated process. Predictions stay ignored
under `ml/artifacts/selection-review`; source data and original research are unchanged.

The unchanged Windows launcher and opt-in `npm run verify:local` were exercised
with completed public Binance candles. Actual direction probabilities, volatility
and price matched their API responses, without synthetic responses or fake clocks;
offline expiry and reconnection passed. [Dated live verification](../ml/reports/selection-quality/live-verification.json)
is software evidence, not a forecast-accuracy backtest. The temporary stack was
stopped after checking it. Final Linux/Mongo/mobile/Docker CI is linked in PR #9.

Remaining limitations for review: seven of eight minute-volatility models still
lose to the original MAE baseline; intervals can be uninformative; sampled UTC
phases, short development history, selection optimism and market/calibration drift
limit generalization. MAE improvements are measured on reused development data,
not independent future confirmation. The old significance evidence for volatility
concerns QLIKE and is not relabeled as MAE confidence. No profitability claim follows.
Existing ablations/regularization evidence does not justify another broad search;
pre-registered zero-aware calibration and prospective phase/regime coverage are
the next research opportunities. No merge or external deployment was performed.
