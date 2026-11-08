> Archived migration/verification record. Commands and branch statements below describe an earlier release. Current setup is in [README](../../README.md), [ML operations](../../ml/README.md) and [current verification](../MVP_VERIFICATION.md).

> Historical verification record. Current implementation, measured models and operating instructions are in [Price Predictions](../PRICE_PREDICTIONS.md) and [the ML guide](../../ml/README.md). Older commands below are not current procedures.

# Dynamic ML lifecycle verification

Run date: 2026-11-06, Windows/PowerShell, Python 3.13.14, Node 26.13.0. Work stayed on the current `main` branch. Initial implementation and verification left the changes unstaged. Separate commits and push follow the repository owner's subsequent explicit instruction. No branch switching, history rewriting, scheduler, remote job or deployment was enabled.

## Architecture and change inventory

The starting audit, contracts, temporal boundaries, migration risks and suggested Conventional Commit groups are in [ML_LIFECYCLE.md](../ML_LIFECYCLE.md). Windows commands, scheduling, rollback, licensing and failure recovery are in [ml/README.md](../../ml/README.md).

Added:

- `ml/common.py`, `store.py`, `provider.py`, `ingestion.py`: shared time/config contracts, local transactional SQLite, bounded official Binance access, incremental sync and verified legacy import.
- `ml/artifact.py`, `registry.py`, `forecast.py`: data-only numerical artifacts, explicit quality/status transitions, rollback and prospective forecast/reconciliation ledger.
- `ml/pipeline.py`, `run.ps1`, `test_lifecycle.py`: independent commands, finite Windows runner and integration/regression tests.
- `shared/hybrid.ts`, `shared/tests/hybrid.test.ts`: additive future hybrid contract with evidence/timing/ML parity checks.
- `docs/ML_LIFECYCLE.md`, `docs/ML_VERIFICATION.md`, `ml/reports/LIFECYCLE_2026-11-06.md`, `ml/reports/lifecycle-2026-11-06.json`: audit, verification and actual historical candidate comparison.

Modified:

- `ml/features.py`, `train.py`, `download.py`, `predict.py`, `config.json`, `README.md`: stricter time validation, four-window chronological training, CLI compatibility entry points and workflow documentation.
- `shared/package.json`: additive hybrid schema export; no dependency changes.
- Root `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/VERIFICATION.md`: current lifecycle boundaries and verification links.
- `ml/reports/RESULTS.md`: label the preserved older experiment as inspected historical research.

No tracked files were removed. Backend/web/mobile implementation, shared financial logic, existing prediction response, pinned dependencies, legacy binaries and `ml/reports/latest.json` remain unchanged. Generated SQLite data/artifacts, logs and backups stay under ignored `ml/data/` and are not part of the source change. The checked-in JSON report contains research metrics/metadata, not raw candles or executable model artifacts.

## Executed checks and actual results

| Command                                                                     | Result                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py' -v`   | **37 passed**, including the six original feature tests                                              |
| `.\.venv\Scripts\python.exe -m pip check`                                   | No broken requirements                                                                               |
| `npm test`                                                                  | **74 passed**: shared 27, backend 45, web 2                                                          |
| `npm run typecheck`                                                         | Passed shared/backend/web                                                                            |
| `npm run build`                                                             | Passed shared/backend/web production build                                                           |
| `npm run lint`                                                              | Passed existing web lint                                                                             |
| `npm --prefix mobileapp run typecheck`                                      | Passed                                                                                               |
| `npm --prefix mobileapp test`                                               | **3 passed**                                                                                         |
| `npm run test:browser`                                                      | **4 passed**, including disabled forecast display and provider outage                                |
| PowerShell AST parse of `ml/run.ps1`                                        | Passed                                                                                               |
| `powershell.exe -NoProfile -File .\ml\run.ps1 -Task Daily` / `-Task Weekly` | Both finite runs passed; logs written, no scheduler registration, no duplicate models/predictions    |
| `python ml/pipeline.py sync`                                                | Real initial BTC/ETH history sync succeeded; 3,368 rows per pair                                     |
| `python ml/pipeline.py validate`                                            | Both real datasets verified; no missing days/duplicates/anomalies                                    |
| `python ml/pipeline.py train`                                               | **24 candidates registered**, all inactive; no historical candidate passed the complete quality gate |
| Repeat `sync`                                                               | **0 added** for each pair, same dataset version, no network fetch needed                             |
| Repeat `train`                                                              | **24 already_registered**, unchanged IDs/artifacts                                                   |
| `python ml/pipeline.py predict --shadow-all`                                | **24 pending unvalidated shadow forecasts**, plus two disabled active-model results                  |
| `python ml/pipeline.py reconcile`                                           | **0 reconciled**, correctly waits for future target completion                                       |
| `python ml/pipeline.py status`                                              | Passed; no active models; real local dataset/forecast state inspected                                |
| `python ml/pipeline.py inspect-model --model-id ID`                         | Passed; complete registered candidate report inspected                                               |
| `python ml/pipeline.py evaluate --model-id ID`                              | Correctly ineligible: historical gate failed and zero completed prospective observations             |
| `python ml/pipeline.py backup --output ml/data/local-review-backup.sqlite3` | Consistent real-store backup created without changing the source database                            |
| SQLite `PRAGMA integrity_check`                                             | `ok` on real local store and test backup                                                             |

The Python suite covers exact UTC/millisecond completion, units (milliseconds/microseconds), mixed/fractional timestamp rejection, missing-day repair, repeated/restarted sync, outage/corruption/partial-download rollback, conflicting records, manifest/data tampering, legacy checksum import, chronological purging/window modes, training-only scaler fitting, independent reproducibility, numeric sklearn parity for all algorithms, cyclic artifact rejection, disabled/candidate status, prospective metrics, baseline/incumbent gates, explicit approval/promotion, historical failure despite good prospective scores, pending target preservation, retained failed/rejected forecasts, source availability, rollback age/checksum/prior-approval checks, transaction failure recovery and safe backups.

Synthetic candles are created only by test fixtures. Real-run reports use Binance observations. Promotion/rollback tests use isolated test stores and do not activate any real research candidate.

## Real-data experiment

Both symbols cover **2017-08-17 through 2026-11-05 UTC**. Acquisition used **222 monthly archives** with publisher checksum verification and **two official REST batches** for recent data. Dataset fingerprints:

- BTCUSDT: `aed9b87ab1626c16c9039202ca8025d3b63394b76f264b9148fff47f61ee1295`
- ETHUSDT: `3ebb0ec97b5f4fc3752d15b0dd2bec93035ba99ecb283d9144a11036fe8aea4e`

Ridge, Random Forest and Gradient Boosting were each fitted with full history and rolling 3/2/1-year histories. All 24 candidate reports include exact training ranges, feature/config/code/environment fingerprints, parameters, four historical fold results and numeric artifact checksums. The maximum export/inference parity error was `1.214306433183765e-17`, below the required `1e-12`.

Historical selection return RMSE is reported against no-change on identical dates. Best BTC selection result: full-history Ridge `0.02072454` vs baseline `0.02086239`, with 2/4 fold wins. Best ETH selection result: 3-year Random Forest `0.02851760` vs baseline `0.02884427`, with 2/4 wins. Neither meets the required 2% selection improvement and 3/4 wins. No candidate is approved/active. See [all 24 results](../../ml/reports/LIFECYCLE_2026-11-06.md) and [full research metadata](../../ml/reports/lifecycle-2026-11-06.json).

Four 90-target historical blocks end on 2026-02-04, 2026-05-06, 2026-08-05 and 2026-11-04. Training labels strictly precede evaluation features and unused origins separate blocks. The first three blocks are development consistency checks; the final block is model selection. Previously inspected 2026 observations are never called an untouched test. Prospective shadow predictions were recorded before their 2026-11-06 UTC closing target. Actuals are still null: future time cannot be simulated in real evaluation. The code requires at least 30 prospective observations and, for replacement, at least 30 paired incumbent target dates. This conservative rule intentionally prevents immediate promotion.

## Failures and environment limitations

- The network sandbox initially returned URL errors for the official Binance endpoint. The same authorized read-only download succeeded outside that sandbox, then both full historical syncs completed. No provider substitution or synthetic fallback occurred.
- Python 3.13 `TemporaryDirectory` creates ACLs that the restricted Windows token could not traverse, including inside the workspace. Test fixture directories now inherit workspace ACLs and are safely cleaned under `ml/data/`; the final Python suite passed.
- Vitest (shared/mobile) and Playwright encountered sandbox restrictions spawning their local resolver/server/browser (`EPERM`). Re-running the same regression commands outside it passed.
- An exploratory repeat-sync check overlapped the long-running training writer and reached the configured lock timeout. No data/model state was damaged. The sequential repeat succeeded; the PowerShell runner prevents overlapping runs for its database.
- Early assertions exposed adjacent evaluation-block horizon overlap; chronological blocks now reserve an unused origin between them. The corrected temporal tests and real run passed.
- No remote scheduler, production deployment, live Gemini calls, native device build or long-running prospective evaluation was performed. Browser/native application code was not changed.

## Remaining before production use

1. Review data usage rights for the intended product and obtain required commercial permission; public endpoints/repository code licensing do not establish redistribution rights.
2. Operate from persistent local disk outside OneDrive, with a reviewed scheduler/service account, synchronized UTC clock, exit-code alerts, log/backup retention and restore drills. The local research DB used here is ignored inside the workspace, not an installed production store.
3. Accumulate real future observations without backdating, reusing inspected holdouts or treating candidate selection as proof of profitability. Investigate performance and regime stability before considering any approval.
4. Review frozen candidate evidence, preprocessing/numeric parity and rollback eligibility. No current candidate qualifies; keep forecasting disabled.
5. Design and review a separate Express publication adapter with recency/status checks if public forecasts are later authorized. Local activation alone must not change the current null response.
6. Implement Gemini only in a later task, with retrieved/verified sources, publication-time provenance, prompt/data controls and separation of explanation from numerical inference. Calibration requires independent evidence; it remains null.

Commit groups in dependency order are listed in [ML_LIFECYCLE.md](../ML_LIFECYCLE.md#suggested-conventional-commit-groups). Initial verification preceded staging and committing; see Git history for the subsequent owner-requested commits.
