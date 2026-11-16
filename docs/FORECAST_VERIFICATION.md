# Forecast migration verification — 2026-11-16

## Outcome and limits

All 96 supplied files validated: **4,204,800** one-minute candles, eight symbols,
2025-11-01 through 2026-10-31 UTC. No detected gaps, duplicate/order, timestamp,
schema, OHLCV or nonfinite failures. Original CSVs were unchanged. No source ZIPs
or Binance `.CHECKSUM` files were present; vendor archive authenticity was not
independently established. [Exact input and Parquet hashes](../ml/reports/historical-v2-validation.json)
record the composite fingerprint `41803b366656636186ad00e3bad1cfc42127ed8707c4f9ddc05d63305853bb54`.

The study completed **24 symbol/horizon pairs × 7 families = 168 comparisons**.
No pair reached the predeclared minimum 1% validation RMSE advantage with stable
fold and paired-block evidence. All 24 short-horizon outputs are unavailable;
eight `1M` outputs are unavailable for insufficient independent monthly outcomes.
No baseline or unvalidated numerical prediction was substituted.

[Comparison and selection report](../ml/reports/FORECAST_BENCHMARK.md),
[full frozen evidence](../ml/reports/historical-v2-benchmark.json) and
[portable decision registry](../ml/reports/historical-v2-registry.json) contain
actual outcomes. The fixed reduced-budget study is not an exhaustive search and
does not prove that no financial model could ever improve on no-change.

Measured study time was 743.9 seconds plus 115.0 seconds of artifact repair/parity
checks. Peak sampled process RSS was 1214.2 MiB. Single-origin numeric inference
medians spanned 0.00865–11.3835 ms, excluding network/features. Numeric artifacts
were roughly 2.6–78 kB. These are local Windows CPU results, not Railway measurements.

## Executed checks

| Check | Result |
|---|---|
| Original 96-file validation and Parquet normalization | Passed, all files and rows |
| Required seven-family benchmark | 168 completed comparisons; all selection gates unavailable |
| XGBoost / Random Forest corrected artifact parity | 48 unchanged deployment fits checked on 10,000 historical origins each; maximum observed error across artifacts 1.54e-9 |
| Root npm unit regressions | 48 shared + 113 backend + 12 web = 173 passed; 2 Mongo integration tests skipped |
| Python regression suite | 76 passed after fixes, including legacy SQLite/daily/scheduling and new data/features/models/live/registry/supervisor tests |
| Root TypeScript checks | Passed |
| Root shared/API/web production build | Passed; Vite warns about an existing >500 kB main chunk |
| Complete web Playwright suite | 24 passed |
| Forecast Playwright after market-action change and CSS cleanup | 4 passed on each final focused run |
| Mobile type check and unit tests | Passed; 7 unit tests |
| Mobile Expo web export / browser regressions | Passed; 2 browser tests |
| Railway IaC type check | Passed; no configuration applied |
| Docker Compose configuration parse | Passed |
| Real Binance live provider | Passed: 256 completed BTC minute candles; newest was 25,349 ms old on retrieval |
| Actual study → registry → worker publication → built Node reader | Passed: all 32 strict schema-valid unavailable responses with correct monthly/no-advantage reasons |
| Git whitespace/data exclusion review | Passed; CSV/Parquet/artifacts/publications remain ignored |

Browser evidence uses **synthetic test-only forecast fixtures**, clearly named as
such, to exercise available/error/expiry paths; it is not model performance evidence.
Screenshots were visually inspected at desktop and 390 px mobile widths:
`webapp/test-results/forecasts-unified-desktop.png` and
`webapp/test-results/forecasts-unified-mobile-tr-light.png`. Tests cover same-coin
chart/market links, horizons, disabled monthly controls, evaluation details, live
expiry, no numeric fallback, Turkish copy and light mode. CI retains browser
artifacts for 14 days. Runtime/generated screenshots are not committed.

## Failed attempts, fixes and unexecuted checks

- Initial Vitest startup failed with sandbox `spawn EPERM`; executing with normal
  local subprocess permissions passed all suites.
- An initial Python temporary-directory fixture hit Windows sandbox ACL behavior;
  fixtures now inherit repository ACLs and use checked test-only cleanup paths.
- Two initial browser tests used incorrect existing localized control labels.
  Selectors were corrected; the complete suite and focused reruns passed.
- Five first-run XGBoost numeric exports failed parity and were blocked. The
  runtime now matches float32 comparison semantics. Original errors and source
  hashes are preserved in immutable study/repair evidence. Random Forest's
  float32 input semantics received the same explicit boundary check. No model
  hyperparameter, predictive metric, holdout split or selection decision changed.
- One final Python run hit a transient Windows/OneDrive atomic replacement
  denial. Metadata replacement now retries that single atomic step five times
  with bounded backoff, preserving the previous file on failure. A deterministic
  sharing-conflict test and full suite passed afterward. PowerShell can classify
  redirected unittest stderr as an error even when unittest reports `OK`;
  exit-code confirmation captures stderr inside a Python subprocess.
- The two skipped Mongo tests require an isolated Mongo test server. No local
  Docker daemon was running; no production Mongo connection was used.
- Docker builds and container smoke tests were **not executed**: the Docker CLI
  could not connect to its local Linux daemon. Linux image size/startup/RSS and
  live Railway capacity/billing remain unmeasured. CI includes the container job.
- Lint was not run for this task. No physical native-device/FCM/SMTP delivery or
  production rollout was executed. Monthly fitting/evaluation was deliberately
  not executed. A deployable numerical winner is absent, so daily-runtime removal
  and activation are deferred.

The branch preserves daily endpoints, SQLite ledgers/backups, source CSVs,
authentication, portfolio/email features and mobile behavior. No main merge,
production deployment, live environment modification or destructive data operation
was performed. See [cleanup manifest](FORECAST_CLEANUP.md),
[architecture/migration](FORECAST_MIGRATION.md), [feature definitions](FORECAST_FEATURES.md)
and [reproducible commands/API/operations](FORECAST_OPERATIONS.md).
