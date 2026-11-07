# Experimental Future Analysis verification

Verified locally on **2026-11-07**, branch `feat/analytics-lab`. This is a dated operational check, not a financial performance evaluation. No model was trained, approved, promoted or changed; no features, hyperparameters, candle frequency, anomaly policy or independent approval thresholds changed. No deployment, database reset or paid Gemini request was performed.

## Actual local operation

The existing registry contained 120 candidate models, current shadow forecasts for all eight assets, and no active model. The existing `predict --shadow-all` command returned 120 pending immutable forecasts plus eight active-path `disabled_unvalidated` results. The latter do not block candidate export. Comparing full ordered table digests before/after confirmed unchanged `sources`, `candles`, `datasets`, `dataset_versions`, `models`, `predictions` and `performance`. Only eight normal disabled-active audit events were appended (306 → 314 events). Existing prediction values and timestamps were reused, without a new fit or retroactive regeneration.

`python ml/pipeline.py validate` passed for all eight verified datasets, including the three exact source-reviewed DOGE historical extremes. `export-experimental` then produced eight `experimental` results with null unavailable reasons. The separate approved publication implementation and default API path retain their historical/prospective gates. No candidate was relabeled as approved.

The following selections were observed from the real local snapshot. Reference closes were **2026-11-06 23:59:59.999 UTC**, and targets **2026-11-07 23:59:59.999 UTC**. These are experimental estimates from the existing ledger, not realized results or evidence of predictive superiority.

| Asset | Eligible forecasts | Selected algorithm / history | Stored next-close estimate (USDT, rounded) | Forward observations | Valid stored interval |
| ----- | -----------------: | ---------------------------- | -----------------------------------------: | -------------------: | --------------------- |
| BTC   |                 24 | Ridge / full                 |                               75754.618414 |                    1 | No                    |
| ETH   |                 24 | Random Forest / 3y           |                                2245.227372 |                    1 | No                    |
| SOL   |                 12 | Gradient Boosting / full     |                                  90.184664 |                    0 | Yes                   |
| BNB   |                 12 | Ridge / 3y                   |                                 696.471726 |                    0 | Yes                   |
| XRP   |                 12 | Random Forest / full         |                                   1.177408 |                    0 | No                    |
| ADA   |                 12 | Random Forest / 2y           |                                   0.183981 |                    0 | No                    |
| DOGE  |                 12 | Gradient Boosting / 2y       |                                   0.072320 |                    0 | No                    |
| LINK  |                 12 | Ridge / full                 |                                  10.854627 |                    0 | No                    |

Selection uses the lowest historical selection return RMSE, then ascending model ID. Historical selection dates/windows may differ; this ranking does not prove future superiority. Missing intervals remain null. Baseline outperformance, fold wins, forward sample counts and approval status are not experimental display requirements. Historical performance remains inspectable in Analytics Lab and report details.

A real local development API/Vite server was started with `FUTURE_GEMINI_SEARCH_ENABLED=false`, without loading a private env file. An unmocked Chromium check read the actual offline export through all eight experimental API endpoints and the web report. Every result passed the shared contract and matched the snapshot's original ML fields exactly. The UI showed the experimental label, correct sign-derived direction, model identity, timestamp and exactly two genuine intervals. The other six showed no numeric range. Consent controls remained disabled, there were zero POST requests, zero page errors, and no horizontal overflow at desktop or 390px mobile width. The API without a mode still reported approved mode separately.

Ignored local evidence is under `ml/data/experimental-verification/`: before/after ledger digests, shadow CLI output/log, `local-api.json`, and actual desktop/mobile screenshots. The runtime snapshot is `ml/data/experimental-forecasts.json`; these generated/private runtime files are not committed. The daily target expires normally; this check does not promise ongoing freshness or schedule any job.

## Automated verification

| Command                                                                | Actual result                                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.\.venv\Scripts\python.exe -m unittest discover -s ml -p "test_*.py"` | 82 passed: existing 74 plus 8 experimental export regressions                                            |
| `npm test`                                                             | 184 passed: shared 52, backend 125, web 7                                                                |
| `npm run build`                                                        | Shared/backend TypeScript and production Vite build passed                                               |
| `npm run typecheck`                                                    | All three workspaces passed                                                                              |
| `npm run lint`                                                         | Passed, zero warnings                                                                                    |
| `npm run test:browser`                                                 | 15 passed, including experimental all-eight, approved mode, consent, failure fallback and mobile layouts |
| `npm run check:mobile`                                                 | Passed                                                                                                   |
| `npm run test:mobile`                                                  | 3 passed                                                                                                 |
| `python ml/pipeline.py predict --shadow-all`                           | 120 existing pending forecasts reused; eight expected disabled-active audit events                       |
| `python ml/pipeline.py validate`                                       | All eight datasets verified                                                                              |
| `python ml/pipeline.py export-experimental`                            | Eight experimental forecasts exported, no registry/prediction writes                                     |

New deterministic tests cover losing unapproved candidates with zero prospective samples, exact RMSE ties, invalid/incompatible/expired/archived/failed/noncausal records, source corruption, missing databases/assets, immutable ledger bytes, checksum/stamp revocation, atomic replacement failure, original optional intervals, strict API mode/consent, fingerprint isolation, no persisted grounding, Gemini failure and evidence changes during review. Synthetic prices/metrics exist only in test fixtures. Gemini tests use mocks; paid live Google Search compatibility was not tested.
