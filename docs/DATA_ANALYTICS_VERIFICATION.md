# Analytics Lab verification and actual findings

Verified 2026-11-07 on Windows/PowerShell, Node 26.13.0, with the existing pinned Python environment. Work is isolated on `feat/analytics-lab`, based on `c967c40`. Only this feature branch is intended for push; no merge or deployment is part of the task.

## Checks

| Check                                              | Actual result                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                    | Passed shared, API and production web build                                                                                            |
| `npm run typecheck`                                | Passed all three workspaces                                                                                                            |
| `npm test`                                         | 174 passed: shared 49, backend 118, web 7                                                                                              |
| `npm run lint`                                     | Passed, zero warnings                                                                                                                  |
| `npm run test:browser`                             | 14 passed: four Analytics Lab, six Future Analysis, four existing application regressions                                              |
| Python `unittest discover -s ml -p 'test_*.py' -q` | 58 passed, including thirteen added analytics cases                                                                                    |
| `npm run check:mobile` / `npm run test:mobile`     | Passed / 3 passed                                                                                                                      |
| Compiled API against the actual local report       | Eight HTTP 200 validated responses; BTC/ETH dated/stale data, six explicit unavailable assets; production disabled despite enable flag |
| Compiled web preview with actual research output   | Desktop 1440×1000 and mobile 390×844 inspected; no page errors or horizontal mobile overflow; rare-event single-class state verified   |
| `git diff --check`                                 | Passed                                                                                                                                 |

Earlier validation exposed fixture timing/StrictMode assumptions and an SVG `<title>` rendering issue in React's server renderer. These were corrected and the affected suites rerun successfully. There are no outstanding test failures. Expected negative-path Python logs for backup/corrupt-data/provider failures are fixture assertions, not actual data failures.

Tests cover statistical edge cases, sample/quantile metrics, circular contiguous blocks, deterministic resampling, Holm order, missing-date returns/correlations, classification confusion and probability metrics, degenerate/imbalanced labels, train/validation/evaluation isolation, unchanged earlier results under changed future data, causal anomaly references, deterministic detectors, SQL joins/windows/aggregations, immutable CSV runs, spreadsheet escaping, read-only registry invariants, partial-asset failure cleanup, all assets, bounded contracts, invalid exports, registry revocation, stale/expired reports, local Host/socket checks, production denial, API input validation, UI loading/error/empty states and existing Future Analysis behavior.

## Actual local run

The final-source command was executed against **existing verified data**, without downloading or revising observations:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py analytics --db ml/data/lifecycle.sqlite3
```

Run: `ea276d9ce30494cde9975b73d156c2737e7fb7c7e790ef7fcf7cdb3c46d74d5a`, generated **2026-11-07 14:50:03 UTC**. Its code hash was checked against the final Python source. Scientific metrics reproduced across the earlier runs. The SQLite file's SHA-256 was identical before/after the actual run; no model status, prediction value, pending outcome or audit record was changed. Real-data **research classifiers were fitted**; production regression models were not retrained, approved or promoted.

Ignored local artifacts are under `ml/data/analytics/runs/<run-id>` with `latest.json` pointing to the complete checksum-enveloped report. The run contains 66 classifier/reference/fold evaluation rows, 24 existing regression comparison rows and six CSV exports. It contains zero genuine evaluated prospective predictions because none exist yet. Runtime JSON, CSV, data, artifacts, logs and credentials are not committed.

| Coverage                       | Actual state                                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| BTC and ETH                    | 3,368 verified daily candles each, 2017-08-17–2026-11-05 UTC; zero gaps, 3,353 labeled feature rows each                   |
| SOL, BNB, XRP, ADA, DOGE, LINK | No verified dataset; explicit unavailable results                                                                          |
| Freshness                      | BTC/ETH need the completed November 6 candle; historical reports explicitly stale                                          |
| Production registry            | Twelve candidates each for BTC/ETH, zero historical gate passes; no approved/active models                                 |
| Prospective/interval evidence  | No evaluated prospective observations or original interval evidence for these older candidates; metrics remain unavailable |

At the original delivery, the pre-existing user file `ml/experiments/six_month_study.py` was byte-identical (SHA-256 `CE2B8D5293C432B9120AEC8F99E7E65168BEFBFABA5DD4D7D1158E846ED86B36`) and excluded from the feature commits.

Follow-up cleanup: the owner authorized removing the redundant untracked script. It duplicated existing return/volatility calculations while bypassing canonical verification, gap isolation and explicit database selection. No application imports, commands or tests referenced it. No tracked runtime code, data or reports changed; reference and whitespace checks passed, without rerunning runtime tests.

## Quantitative observations

These small factual research summaries use Binance Vision data for non-commercial education. Attribution: **Binance Vision**; derived research summaries in this section are provided under **CC BY-NC-SA 4.0**, subject to the [dataset terms](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md). They are not forecasts or authorization for a commercial data product.

| Historical daily returns        | BTC     | ETH     |
| ------------------------------- | ------- | ------- |
| Observed returns                | 3,367   | 3,367   |
| Mean                            | 0.1469% | 0.1620% |
| Daily sample standard deviation | 3.4848% | 4.4990% |
| Excess kurtosis                 | 8.8364  | 6.6191  |

The prespecified windows are **2025-11-11–2026-05-09** and **2026-05-10–2026-11-05**, each 180 daily returns. Approximate two-sided centered circular-block bootstrap results, using 999 resamples and 14-day blocks:

| Hypothesis, B minus A    | Effect (percentage points) | p    | Holm p |
| ------------------------ | -------------------------- | ---- | ------ |
| BTC mean return          | +0.1053                    | .690 | 1.000  |
| BTC mean absolute return | −0.3812                    | .106 | .318   |
| ETH mean return          | +0.1932                    | .581 | 1.000  |
| ETH mean absolute return | −0.6187                    | .058 | .232   |

None meets a Holm-adjusted .05 threshold under the stated approximate assumptions. This does not establish equality, stationarity or causality. Pointwise confidence intervals, block sensitivity and autocorrelation diagnostics remain in the local report; validity is limited by possible nonstationarity and long memory.

In the last 60-observation direction fold, BTC Random Forest balanced accuracy was **60.00%** versus **50.00%** for majority; ETH Logistic Regression was **60.27%** versus **50.00%**. These are selected displayed historical comparisons across several candidates, not significance-tested superiority or prospective performance. Every fold, baseline, confusion matrix and prevalence is retained. No model approval follows from these values.

The last rare-event evaluation fold contained **zero positive events for both assets** under the frozen training-only absolute-return threshold. ROC-AUC/AP/balanced accuracy are therefore unavailable. High accuracy in that period is uninformative about rare-event recall. The result exposes a training/evaluation-regime mismatch; thresholds were not changed after seeing it to improve the report.

Observed anomaly method counts were BTC **170 Z / 537 IQR / 79 MAD / 68 Isolation Forest** and ETH **178 / 510 / 91 / 78**. These total **1,711 method alerts**, not 1,711 unique days, fraud cases or predicted future moves. Scored-day denominators and reference periods accompany the counts; there are no verified anomaly labels and no fabricated precision/recall/F1.

## Scope, files and remaining limitations

The extension lives in `ml/analytics` and reuses `Store`, `features`, `evaluation_splits`, `training_slice`, `forward_rows` and existing regression metrics. `shared/analytics.ts` defines bounded contracts; `backend/src/analytics/reader.ts` and the added GET route read the local export; `AnalyticsLab.tsx` and `AnalyticsPlot.tsx` present independent navigation, plots, filters, evidence and explanations. Configuration defaults off. No new package, database, registry, paid service, scheduler or deployed endpoint was added.

The release bounds histories to 6,000 rows/asset, registry comparison to 100 versions and analytical prospective SQL to 5,000 rows. Dashboard event details retain the latest 200/asset, with full bounded-run event CSVs kept locally. Larger workloads require profiling and an explicit extension. A long read transaction can delay offline SQLite writers; normal market/Mongo portfolio requests do not run analytics or wait for model fitting. Source paths and clock synchronization remain operator-owned.

Classification probabilities are uncalibrated; model comparisons are inspected historical research. Future proof of usefulness requires new prespecified evaluation data. Unsupervised scores do not establish fraud/loss. Production forecast and Gemini consent, cost, source and no-shared-result-cache boundaries are preserved. All Analytics Lab access is disabled in production; live provider calls, native-device builds, Docker deployment and public data redistribution were not performed. Temporary owned preview/browser processes were closed.

For execution, scientific assumptions, SQL business questions, Excel/Power Query/DAX examples, electricity-domain transfer and practical exercises, use [DATA_ANALYTICS.md](DATA_ANALYTICS.md). No required implementation phase is left as a proposal; gathering missing verified assets, collecting future evaluation evidence and operational/commercial approvals remain separate work.
