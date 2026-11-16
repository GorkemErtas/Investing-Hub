# Forecast v2 operations and API

For current startup and experimental local selection use [Windows operations](LOCAL_WINDOWS.md).
The original benchmark/registry commands below preserve the earlier research policy.

## Reproduce locally

Use Python 3.13 and the repository virtual environment. The original 96 CSV files
must exist locally; they are intentionally ignored and are not available in a
fresh remote checkout. A missing/invalid dataset stops fitting. Never substitute
test fixtures for it. Run from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/requirements-multihorizon.txt
$env:OMP_NUM_THREADS='1'
$env:OPENBLAS_NUM_THREADS='1'
$env:MKL_NUM_THREADS='1'
.\.venv\Scripts\python.exe ml/forecast_v2.py normalize
.\.venv\Scripts\python.exe ml/forecast_v2.py benchmark
.\.venv\Scripts\python.exe ml/forecast_v2.py report
.\.venv\Scripts\python.exe ml/forecast_v2.py registry
.\.venv\Scripts\python.exe ml/forecast_v2.py worker --once
# Opt-in continuous worker in a separate local terminal:
.\.venv\Scripts\python.exe ml/forecast_v2.py worker
npm run dev
```

`benchmark --symbol BTCUSDT --horizon 15m --max-train-rows 12000 --lstm-epochs 3`
limits work to one pair. Bounds and the complete fixed configuration are recorded
in each report. Fully completed identical runs reuse their evidence. Do not change
configurations after examining holdout scores and call the holdout untouched.
For a new model study use new pre-registered windows, preferably genuinely future
data. Production never executes `benchmark`, normalization or fitting.

The first study caught five XGBoost export mismatches. Float32 input/threshold
comparison was corrected. The explicit `repair-artifacts` command refits only
unchanged deployment models and tests numerical serialization on 10,000 origins;
it never recomputes predictive metrics or changes selection. It preserves the
original failed study and writes separate repair evidence. To inspect this study:

```powershell
.\.venv\Scripts\python.exe ml/forecast_v2.py repair-artifacts
.\.venv\Scripts\python.exe ml/forecast_v2.py repair-artifacts --study ml/artifacts/multihorizon/study-repaired.json --algorithm random_forest --output ml/artifacts/multihorizon/study-final.json
.\.venv\Scripts\python.exe ml/forecast_v2.py report --study ml/artifacts/multihorizon/study-final.json
.\.venv\Scripts\python.exe ml/forecast_v2.py registry --study ml/artifacts/multihorizon/study-final.json
```

Original artifacts, partitioned data and reports remain under ignored local paths.
Committed JSON evidence has portable artifact references, not model payloads.
The first BTC/1m engineering pilot repeated the same fixed study configuration;
its holdout did not drive any model/feature/selection change. This is a historical
research evaluation, not a promise of an uncontaminated prospective experiment.

Random Forest portable inference also mirrors sklearn's float32 input conversion.
All 24 deployment fits in that family were checked on 10,000 origins following
the correction. These are serialization checks, not additional performance tuning.

## Read-only public contract

`GET /api/v2/forecasts/:symbol?horizon=1m` returns one strict `forecast-v2` record.
Symbols are the existing eight allowlisted pairs. Horizons are case-sensitive
`1m`, `15m`, `1h`, `1M`; omitted horizon defaults to `1m`. Unknown symbols, horizons
or query keys return 400. This domain is independent of chart candle intervals.
`shared/forecasts.ts` is the canonical schema. `/api/predictions/:symbol` remains
the daily v1 endpoint for compatibility with native clients and bookmarks.

| Field | Meaning / units |
|---|---|
| referencePrice / predictedPrice | Positive USDT per base unit, or null |
| predictedLogReturn | Natural log return; percentage is `100*expm1(value)` |
| sourceCandleTime | Inclusive UTC close of the last completed input minute |
| marketUpdatedAt | Time completed live candle response was retrieved |
| generatedAt | Actual forecast generation time, never refreshed on a cache hit |
| targetTime | Source close plus this model's validated direct horizon |
| algorithm / modelVersion | Selected frozen candidate identity, or null |
| featureSchema / datasetFingerprint | Ordered feature version and data SHA-256 |
| evaluationMetrics | Validation/holdout log-return RMSE, baseline holdout RMSE, directional fraction |
| status / stale / reason | Experimental or unavailable, freshness flag and stable machine reason |

Unavailable records contain null numeric forecasts, model and metrics. Monthly
requests always return `monthly_insufficient_independent_outcomes`. Missing,
oversized, corrupt or invalid publications fail closed. No baseline is presented
as a selected model. A publication contains exactly 32 unique symbol/horizon pairs
inside a SHA-256 envelope, written atomically. HTTP only reads the bounded file;
it never loads Python, models, SQLite or training dependencies for v2.

The reader coalesces concurrent reads and validates on file-signature changes.
It checks time freshness on every response, even cache hits. Inputs older than
90 seconds, expired targets and future generation times cannot be live. Publication
age also has a 90-second limit. The web independently expires displayed prices
every second and polls its selected pair every 15 seconds while visible.

## Dynamic worker and failure behavior

Frozen models and a bounded 256-candle history per symbol live in one optional
worker. It requests at most 257 Binance candles per eligible symbol/cycle, drops
only the final uncompleted candle, validates the entire remaining tail and uses
the exact offline feature code. A horizon refreshes once per completed input minute,
regardless of whether its target is one or sixty minutes ahead. Repeated origins
reuse their original generation timestamp and numbers. No models are retrained.

Polling was chosen over WebSockets: at most eight bounded requests/minute is
simple to supervise/recover and needs no durable stream/gap repair infrastructure.
Only coins with selected eligible models cause network requests. Timeout is five
seconds, with one retry and short exponential backoff. HTTP 418/429 triggers a
shared Retry-After cooldown (at least 60 seconds); there is no tight retry loop.
Provider failures, short/gapped/stale histories, missing/corrupt registries and
inference errors publish unavailable records and structured logs. A file lock
prevents two workers publishing to one destination. The supervisor restarts a
failed worker after 60 seconds and terminates it with HTTP on shutdown.

All current pairs are unavailable; the worker consequently makes no provider
calls for this study. Real Binance provider validation was executed independently.
The numeric inference lifecycle is covered with explicitly synthetic test models.
There is no validated deployable numerical winner in this research run.

## Railway assessment and operator gate

No Railway environment, IaC source branch, volume, database or deployment was
changed. `ML_MINUTE_ENABLED=false` remains the Docker default. An operator can
later install only `registry-v2/registry.json` and referenced selected numeric
artifacts under `/data/ml`, and enable the worker after reviewing evidence.
`FORECAST_REGISTRY_PATH=/data/ml/registry-v2/registry.json` and
`FORECASTS_EXPORT_PATH=/data/ml/forecasts-v2.json` are separate from v1 paths.
The supervisor enforces these persistent paths when enabled. Existing daily jobs
and SQLite backups remain active and independent. Rollback: disable minute worker.

No raw CSV/Parquet/training runs are in Docker or Git. V2 inference imports
NumPy/Pandas but not sklearn, Torch, LightGBM, XGBoost, PyArrow or psutil. The current
image retains existing daily runtime dependencies, including Torch/sklearn,
because that path has not been replaced. Removing those would be premature.
No additional training dependencies were added to the production image.

CPU inference timings, artifact sizes and training RSS are measured in the study
report. These are Windows CPU research measurements; Railway Linux startup, RSS,
image size and latency remain unmeasured until a container can be built and tested.
The local Docker daemon was unavailable, so no image-size or container-smoke claims
are made. Network cost is bounded by eight requests/minute (plus one failure retry)
and absent when no models qualify. There is no added database/service subscription.
Budget a separate worker's Python/NumPy/Pandas overhead and recent candles; measure
actual Linux peak RSS before enabling with an operator-selected memory limit.

## Sources checked during implementation

- [Binance public-data schema, microsecond timestamps and archive checksums](https://github.com/binance/binance-public-data)
- [Binance Spot market-data endpoints](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- [scikit-learn chronological split guidance](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
- [LightGBM parameters](https://lightgbm.readthedocs.io/en/stable/Parameters.html)
