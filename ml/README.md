# Local daily ML lifecycle

The separate `python ml/pipeline.py analytics` command opens the existing database read-only, reuses its verification/features/chronological split plan, and writes ignored analytical JSON/CSV runs. It computes EDA, circular block inference, direction/rare-event classifiers, observed anomalies, SQL summaries and frozen registry monitoring. It never creates a database, writes registry events, promotes models, reconciles outcomes or calls Gemini. Its prespecified research configuration is recorded independently of production training configuration. All eight assets are checked; absent/short/gapped histories remain explicit. See [Analytics Lab methods, local UI, exports and exercises](../docs/DATA_ANALYTICS.md).

Python 3.13; no Python API, GPU, database service, Gemini call or deployment. The legacy Express prediction response remains disabled. The separate Future Analysis endpoint accepts only an explicit eligible ML publication. No scheduler is registered by this repository.

The independent CLI syncs completed spot daily candles for every asset in `shared/contracts.ts`, validates provenance, trains reproducible candidates, records shadow forecasts, reconciles actuals, and supports explicit approval/promotion/rollback. SQLite is built into Python; no new Python dependencies were added.

## Windows / PowerShell

From the repository root:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py' -v

.\.venv\Scripts\python.exe ml/pipeline.py sync
.\.venv\Scripts\python.exe ml/pipeline.py validate
.\.venv\Scripts\python.exe ml/pipeline.py train
.\.venv\Scripts\python.exe ml/pipeline.py status
.\.venv\Scripts\python.exe ml/pipeline.py predict --shadow-all
.\.venv\Scripts\python.exe ml/pipeline.py reconcile
```

`sync` initially requests history from 2017-08-17 through yesterday UTC, bounded by the official earliest daily kline for each symbol (including newer listings); subsequent runs fetch only missing observations. `reconcile` needs a later sync after targets have completed. There is no mechanism to fast-forward prospective evaluation or backdate a forecast. On Linux/macOS use `.venv/bin/python` and a Python 3.13 virtual environment.

The default database is ignored `ml/data/lifecycle.sqlite3`. **For scheduled operation use a local disk path outside OneDrive/network/cloud-sync folders**, for example:

```powershell
$env:INVESTING_HUB_ML_DB = Join-Path $env:LOCALAPPDATA 'Investing-Hub\ml\lifecycle.sqlite3'
.\.venv\Scripts\python.exe ml/pipeline.py status
```

Set the same variable for every command, or pass `--db <absolute-path>` **after** the subcommand. An empty database starts disabled. Do not point a new command at a different database by accident. Configuration is `ml/config.json`, overridable with `--config`; symbols are allowlisted. Use `--symbol BTCUSDT` to operate on one pair. `sync --start 2021-01-01` restricts requested coverage for an isolated research database; default training uses all history present in that database. Never describe a restricted import as exchange-wide full history.

`ml/download.py`, `ml/train.py` and `ml/predict.py` remain thin entry points to the new CLI. The old `predict --artifact/--csv` interface is deliberately removed: no joblib/ONNX/legacy artifact is loaded. Historical binaries under `archive/legacy-models` remain inactive and untouched.

## Commands and review gates

| Command                                           | Effect                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `sync`                                            | Atomic incremental ingestion per symbol; optionally import verified legacy CSVs first                                              |
| `validate`                                        | Check stored candle values, gaps, dataset hash and source manifest; nonzero on invalid data                                        |
| `train`                                           | Register each algorithm/window as `candidate`; never approve or activate                                                           |
| `inspect-model --model-id ID`                     | Full reproducibility, training, validation and artifact metadata                                                                   |
| `evaluate --model-id ID`                          | Record historical and prospective quality evidence; does not change model status                                                   |
| `approve --model-id ID`                           | Mark approved only if all quality gates currently pass                                                                             |
| `promote --model-id ID`                           | Recheck gates and atomically replace the local active model; requires approval                                                     |
| `reject --model-id ID --reason 'review reason'`   | Retain candidate/approved model with rejected status                                                                               |
| `rollback --model-id ID --reason 'review reason'` | Restore an intact, unexpired archived model with prior activation evidence                                                         |
| `predict`                                         | Active local model only; records disabled event if none                                                                            |
| `predict --model-id ID`                           | Explicit, visibly unvalidated shadow forecast of a candidate                                                                       |
| `predict --shadow-all`                            | Active model plus nonexpired candidate/approved shadow models                                                                      |
| `reconcile`                                       | Resolve pending forecasts whose exact daily target has completed and been ingested                                                 |
| `status`                                          | Dataset freshness, quality, registry, forecast counts, rolling performance snapshots, recent events                                |
| `daily`                                           | Sync, reconcile, active/shadow forecasts; never train/promote                                                                      |
| `weekly`                                          | Sync, reconcile, train, active/shadow forecasts; never approve/promote                                                             |
| `export-analysis --output PATH`                   | Explicit atomic all-asset publication; only current active-origin, approved, prospectively validated, calibrated forecasts qualify |
| `backup --output PATH`                            | SQLite consistent backup to a new destination; refuses overwrites                                                                  |

Exit codes: `0` completed (including a quality result from `evaluate`), `1` command/provider/data failure, `2` denied approval/promotion or failed/rejected inference. Inspect `eligible` and `reasons` in evaluation JSON. All failures are logged; command failures also enter the audit event table when the store is available. No failed quality check replaces an active model.

After a candidate has accumulated sufficient genuine future observations:

```powershell
$modelId = 'copy-an-ID-from-status'
.\.venv\Scripts\python.exe ml/pipeline.py inspect-model --model-id $modelId
.\.venv\Scripts\python.exe ml/pipeline.py evaluate --model-id $modelId
.\.venv\Scripts\python.exe ml/pipeline.py approve --model-id $modelId
.\.venv\Scripts\python.exe ml/pipeline.py promote --model-id $modelId
.\.venv\Scripts\python.exe ml/pipeline.py predict
.\.venv\Scripts\python.exe ml/pipeline.py backup --output ml/data/reviewed-backup.sqlite3
```

These commands change only the local registry. Publication remains a separate explicit `export-analysis` operation with all gates rechecked; see [Future Analysis operation](../docs/FUTURE_ANALYSIS.md). Candidate-origin forecasts are never trusted client-facing predictions, even after promotion.

## Data integrity and provenance

Use [Binance's documented monthly/daily archive layout and checksum sidecars](https://github.com/binance/binance-public-data) for historical batches; use [official UTC daily REST klines](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints) at `data-api.binance.vision` for current or unavailable archives. Only an archive 404 permits REST fallback. Checksum failures, corrupt ZIPs, access restrictions and all other errors stop ingestion. ZIPs are parsed in memory, never extracted. Requests are sequential, timeout after 20 seconds, and retry transient errors at most twice. HTTP 418/429 stops the run and reports Retry-After; no repeated requests to another symbol follow a rate limit. Do not restart earlier than the advertised delay. There are no credentials or proxy/geographic bypasses.

Timestamps must be integer milliseconds; archives using documented microseconds are normalized only after validating their exact boundaries. Seconds, mixed units, fractional timestamps, non-UTC boundaries, nonfinite/nonpositive prices, invalid OHLC ranges, negative volume, duplicate days and incomplete candles are rejected. The latest completed opening is UTC midnight today minus one day; a candle is complete only at its closing millisecond plus one. Unreviewed absolute daily returns above 80% are rejected; the threshold cannot be raised. Exact, source-bound historical observation approvals in `ml/reviews/historical_price_movements.json` cover three independently verified DOGE movements and are audited consistently during ingestion, stored verification, training and inference prerequisites. They never approve a model. Prices are never clipped or filled. See [review evidence, diagnostics and extension procedure](../docs/HISTORICAL_ANOMALY_REVIEWS.md).

Stored records are immutable: inserts reuse identical existing rows and reject conflicting values. Sync repairs missing days, including interior gaps; any unresolved requested day rolls back that symbol's entire sync. Feature windows additionally break at gaps; training rejects unresolved gaps. Already committed symbols survive another symbol's failure. SQLite transactions, unique keys, checksums and a versioned source manifest prevent partial dataset publication. Rerunning an up-to-date sync makes no provider request or new dataset version.

Sources record URL, response SHA-256, retrieval time, timestamp contract and license reference. Archives also record publisher SHA-256 and checksum-sidecar hash. REST has no publisher checksum: its recorded response digest detects local changes, and HTTPS/provider validation establish the acquisition boundary. Dataset versions pin normalized numeric content, row count/range, parent version and exact source IDs. Original HTTP bodies are not retained; their hashes establish provenance, not independent third-party attestation. Rows link to their first verified source.

If old `ml/data/<symbol>.csv` and `provenance.json` exist, the initial sync verifies the CSV against its manifest, validates all candles, and imports them without modification. This carries the earlier archive hashes forward, recording that original ZIPs are unavailable for rechecking. A CSV without a matching manifest is refused. Import gaps can be repaired by the following sync. Use `--legacy-dir` for another reviewed local location.

Binance can revise old archives. The pipeline preserves the previously verified snapshot rather than silently rewriting observations or past forecast actuals. Review a proposed correction in a **separate** database and compare records/provenance before an explicit migration. No automatic correction or data deletion command is provided.

## Evaluation and reproducibility

The target remains next-day close return, `close[t+1]/close[t]-1`; price is `close[t]*(1+return)`. Features end at source close `t`. Ridge scaling is fitted inside each training pipeline. Random Forest and Gradient Boosting retain the existing fixed parameters and seed 42, with one CPU worker for reproducibility.

All historical data inspected through 2026 belongs to development; the development cutoff is frozen at **2027-01-01 exclusive**. This does not imply unavailable future 2026 candles already exist. Only observations present and completed at training time are used. The first three development folds and one selection fold use common chronological date blocks (default four 90-day evaluation blocks), strict label-time purging, and one unused origin between blocks. The first three folds measure consistency; the final fold supplies selection metrics. All twelve algorithm/window combinations are retained so review can compare full available history with recent 3/2/1 years (1095/730/365 days). Changing configuration is research/model selection, never a new untouched test.

`window_mode=rolling` moves recent-window lower bounds with each fold. `expanding` fixes each recent window's lower bound at the first evaluation origin minus its day count and expands thereafter. Full history always expands. The final fit uses all currently available labels under the chosen policy; historical cutoff restrictions apply to evaluation, not to fitting newly observed labels. Reports record actual ranges, not just window names.

Historical eligibility requires 2% lower selection return RMSE than no-change and at least three of four fold wins. **Historical scores alone cannot promote anything.** Each frozen candidate must additionally accumulate at least 30 prospective daily forecasts, generated after training/source completion and before target completion, then improve at least 2% over no-change. With an active model, the candidate must also beat it on at least 30 identical target dates. Insufficient evidence leaves the candidate pending. Approval and promotion are separate explicit commands; promotion rechecks current evidence. Models expire for inference and promotion after 90 days by default. Rollback verifies integrity, features, age and recorded prior activation, preserves history and requires a reason.

Forward shadow observations used in promotion are prospective validation. Subsequent active forecasts provide continuing forward evaluation; do not tune a model against these outcomes and call them unseen again. Comparing many candidates and market regimes introduces selection uncertainty; these conservative heuristic gates are not significance tests, investment guarantees or calibrated probabilities. No trading/cost/execution-at-close claim is made.

The registry stores IDs derived from dataset/config/training-code/environment fingerprints, full config/parameters, training range/time, feature version/order, walk-forward metrics, artifact checksum, parity result and status. Repeated identical training reuses existing IDs. Numeric JSON encodes only linear coefficients/scaler values or bounded tree arrays; inference checks feature contracts and checksums and cannot execute pickle code. Export parity against sklearn must be within `1e-12`. Package versions remain pinned in `requirements.txt`. Reproducibility is scoped to the recorded Python/numeric environment; cross-platform BLAS differences remain possible.

Forecast identity is `(symbol, model ID, target close time)`. Records include generation/source/target timestamps, reference price, predicted return/price, model status at generation, dataset fingerprint, frozen historical OOS residual interval evidence (or `null` when unavailable), actual close/return, signed price error (`predicted - actual`) and evaluation state. Failures/rejections remain auditable. Reconciliation only consumes completed, subsequently ingested target candles and never changes original prediction values. Cumulative performance snapshots track return/price MAE/RMSE, direction and baseline over time.

## Scheduling without an open terminal

`ml/run.ps1` executes one finite daily or weekly run, retains dated logs next to the database, serializes runs with a per-database Windows mutex, and returns the CLI exit code. A killed process releases OS/SQLite locks; the next run repairs missing observations. If a job overlaps, the wrapper logs a skip. There is no automatic retry before a provider's Retry-After; retry the failed finite run later.

To run it manually:

```powershell
powershell.exe -NoProfile -File .\ml\run.ps1 -Task Daily -DatabasePath "$env:LOCALAPPDATA\Investing-Hub\ml\lifecycle.sqlite3"
powershell.exe -NoProfile -File .\ml\run.ps1 -Task Weekly -DatabasePath "$env:LOCALAPPDATA\Investing-Hub\ml\lifecycle.sqlite3"
```

Optional Task Scheduler setup is an **operator action**, not performed here. Set the program to `powershell.exe`; arguments to `-NoProfile -NonInteractive -WindowStyle Hidden -File "<absolute-repo>\ml\run.ps1" -Task Daily -DatabasePath "<absolute-local-db>"`; select a user with access to the repo, venv and DB, and configure execution when logged out. Run daily after 00:20 UTC; use a separate Weekly task on Sunday after 01:00 UTC. On an Istanbul/UTC+3 Windows host these are 03:20 and Sunday 04:00 local; check `Get-TimeZone`. Enable missed-start execution, disable overlapping instances, and inspect last exit status/logs. Account credentials/permissions and registration must be configured locally. Sleep/offline machines can catch up later; do not manufacture forecasts for missed days.

For a deployment-friendly host, use two finite systemd timers/cron jobs on a single persistent local volume: daily `python ml/pipeline.py daily`, Sunday `python ml/pipeline.py weekly`, absolute Python/DB/config paths, UTC schedule, no overlap and captured stderr/exit alerts. No remote job or deployment configuration is enabled. A daemon is unnecessary for one candle a day. Back up with the CLI, restore only while all jobs are stopped, and validate the restored file before use. Do not copy a live SQLite file or concurrently cloud-sync it. Log rotation, backup retention, disk monitoring and clock synchronization are operator responsibilities.

## Source usage and Future Analysis

Binance's [Vision Dataset Terms](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md) reviewed 2026-11-06 identify CC BY-NC-SA 4.0 and restrict commercial dataset/derivative use. The public-data repository's MIT code license does not grant commercial data redistribution rights. Keep raw data/models private and ignored; review API terms and obtain the required written license before commercial use or redistribution. Published derived research must carry attribution and applicable share-alike licensing. Access restrictions never trigger synthetic or alternate-provider substitution.

`shared/future-analysis.ts` replaces the provisional hybrid and news contracts with one report: ML-only numeric forecast/evaluation/calibration evidence plus a critical Gemini interpretation bound to the exact model/forecast fingerprint. `export-analysis` holds the SQLite writer lock through checksum/stamp capture and atomic JSON replacement, without changing registry/evaluation records. The backend rejects changed registry exports, bad parity, timing, gates or units. Gemini cannot modify numeric values, approve models or create missing forecasts. Historical residual coverage is not a guarantee; prospective coverage accumulates against original bounds. No real model was trained, promoted or exported by this implementation. See [architecture, privacy, provider costs and setup](../docs/FUTURE_ANALYSIS.md).

See [audit and architecture](../docs/ML_LIFECYCLE.md), [verification report](../docs/ML_VERIFICATION.md), and the preserved [historical experiment](reports/RESULTS.md). Legacy historical metrics are development evidence and do not represent this lifecycle's unseen performance.
