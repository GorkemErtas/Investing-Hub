# Final ML-only MVP verification — 2026-11-08

Work stayed on `feat/analytics-lab`. No real scheduled task was installed, no paid service called, no deployment performed and no main-branch merge made.

## Changes

- Removed the analytical UI/page/plot/styles/hooks and `/analytics` route; the navigation now has Overview, Portfolio, Price Predictions and Learning Hub.
- Removed the analytical backend reader/endpoint/configuration, shared schema/export/fixtures and Python research/classification/statistics/SQL/export modules, with their obsolete tests. Negative regression assertions retain the former route names only to prove their removal.
- Moved the generic checksum-protected atomic JSON writer into `ml/json_store.py`, retaining the publication envelope, fsync and atomic replacement. Internal model evaluation, metrics, selection, reconciliation, provenance and numerical artifacts remain.
- Added the finite `daily` CLI sequence, an OS-released database job lock, bounded safe logs/read-only status, extended `run.ps1`, and opt-in `schedule.ps1` management. No dependency was added; existing numerical dependencies are still required by pandas/scikit-learn/PyTorch.
- Replaced active operating documentation and archived the original measured analytical findings under `historical-experiments`; ignored old research exports and existing SQLite records were not deleted.

## Actual results

| Verification                           | Result                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python unittest discovery              | **52 passed**                                                                                                                                                                                               |
| `npm test`                             | **91 passed**: shared 39, backend 50, web 2                                                                                                                                                                 |
| `npm run typecheck`                    | Passed shared/backend/web                                                                                                                                                                                   |
| `npm run lint`                         | Passed, zero warnings                                                                                                                                                                                       |
| `npm run build`                        | Passed after clearing only verified untracked build directories; retired analytical compiled files are absent                                                                                               |
| `npm run test:browser`                 | **8 passed**: eight numerical cards, expiry/unavailability, removed routes/navigation, responsive layout, market/charts, portfolio/replay and learning                                                      |
| `npm run check:mobile`                 | Passed                                                                                                                                                                                                      |
| `npm run test:mobile`                  | **4 passed**                                                                                                                                                                                                |
| Mobile ESLint                          | Passed                                                                                                                                                                                                      |
| Mobile Expo web export / Playwright    | Fresh isolated export passed; **1 full workflow passed**, including numerical forecasts, market/candles, account/portfolio and logout isolation                                                             |
| `pip check`                            | No broken requirements                                                                                                                                                                                      |
| PowerShell / Task Scheduler regression | UTC XML, absolute paths, bounded execution, install/status/run/uninstall and ownership protection passed using mocked scheduler cmdlets; real wrapper failure returns nonzero and safe readable logs        |
| Cross-process lock                     | Independent child process refused during ownership and succeeded after release                                                                                                                              |
| Daily workflow regression              | New-day sync/validation/reconciliation/generation/publication verified for all eight synthetic assets; repeated execution makes no duplicate forecasts or model changes; no training/selection call allowed |
| Failure regressions                    | Bounded network retries, invalid/stale data, incomplete prediction set, interrupted status, retention and atomic replacement failure preserve integrity and report failure                                  |
| Compiled actual prediction API         | All **8** JSON responses exactly matched the real daily publication; removed analytical endpoint returned **404**                                                                                           |
| Diff / runtime scan                    | `git diff --check` passed; no active analytical imports/configuration/exports remain; private environment files and generated artifacts remain ignored                                                      |

The desktop and narrow-screen prediction page were visually inspected. Browser regressions use synthetic fixtures; the real local run below is separate evidence. Negative-path tests intentionally emit sanitized failure logs.

## Real local daily execution

A consistent SQLite backup was taken before the run into ignored `ml/data/backups`. `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\ml\run.ps1 -Task Daily` succeeded independently of the application servers:

1. All eight datasets were already current, so synchronization added **zero** rows and needed no provider requests.
2. Every dataset passed current UTC-day, source, fingerprint and gap validation.
3. Reconciliation found **zero** newly completed pending forecasts in this existing store. The synthetic new-day regression separately verified eight reconciliations.
4. Existing selected artifacts generated/reused all **eight** genuine forecasts; publication and post-publication verification succeeded.
5. Local structured logs recorded the complete command order and final success with eight valid forecasts and zero retries.

Before/after read-only comparisons proved that **all 152 model rows (including selections/metadata/weights/checksums), all 272 original forecast identities/timestamps/numerical fields and all source/candle/dataset/version rows were unchanged**. Operational events and the refreshed publication/log files were the intended writes. Machine-readable preservation/API evidence remains ignored under `ml/data`; source and historical experiment records are retained. No model was retrained or reselected in the real workflow.

## Operational limits

See [daily operations](DAILY_UPDATES.md) for exact installation, status, manual run, uninstallation, logs, backup and safe restore commands. Registration/real clock-trigger execution were deliberately not performed: scheduler tests replace mutating cmdlets. This task uses the installing user's interactive token, so that user must stay signed in and the computer must be running or able to wake/resume. Power policy, provider availability and a changed checkout/data location can prevent execution. Missed days are not backfilled with invented forecasts. Failed/stale publications produce explicit unavailable API/UI states. Native Android/iOS compilation/device behavior were not rerun; mobile TypeScript, lint, unit tests, web export and browser integration passed. Historical predictive scores do not establish future accuracy; no new benchmark is claimed.
