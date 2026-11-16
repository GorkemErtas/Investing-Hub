# Local price forecasting

Current Windows startup is `.\dev.ps1` from repository root. It selects existing
direction, volatility and optional price artifacts by development loss and runs
one frozen minute worker, without training or statistical activation thresholds.
Outputs are explicitly experimental; old gated research decisions are preserved.
See [local operations](../docs/LOCAL_WINDOWS.md), [Türkçe ML summary](../docs/ML_YEREL.md)
and [local selection metrics](reports/local-selection.json). The daily system below
remains supported independently; Railway is legacy reference only.

Minute multi-horizon v2 now lives in `multihorizon/` with the separate
`forecast_v2.py` command surface. See [operations and reproduction](../docs/FORECAST_OPERATIONS.md),
[validation fingerprints](reports/historical-v2-validation.json) and
[real-data benchmark/selection evidence](reports/FORECAST_BENCHMARK.md).
The daily pipeline below is retained until replacement quality and operations
are verified; v2 never mutates its SQLite lifecycle.

One offline Python pipeline reuses the existing verified Binance daily OHLCV SQLite dataset. It trains/evaluates four candidates, selects one per coin, writes immutable next-day forecasts and atomically publishes `ml/data/predictions.json`. HTTP handlers never load models or run Python. There is no third-party generative AI integration.

All supported commands run through `ml/pipeline.py` (or `ml/run.ps1` on Windows); training and forecasting modules contain the implementation. Stored model metadata retains the training-source hash from its original fit. Source cleanup does not change those historical records or require retraining; a future explicit fit records the updated source hash.

## Module responsibilities

- `provider.py` / `ingestion.py` acquire and verify completed source candles;
  `store.py` retains the existing SQLite schema and immutable records.
- `features.py` defines the current daily feature contract for both fitting and
  inference. `train.py` / `lstm.py` own chronological fitting and train-only scaling.
- `selection.py` selects from frozen comparable evaluations and defines the current
  pipeline version/candidate order without importing training libraries.
- `artifact.py` / `lstm_inference.py` validate and run bounded numeric artifacts.
  LSTM keeps its existing CPU Torch implementation; it does not import sklearn or
  fitting. Non-LSTM generation does not load Torch or sklearn.
- `evaluation.py` preserves the same sklearn scoring formulas, imported when
  training or reconciling actual outcomes needs metrics.
- `forecast.py` generates/reconciles immutable predictions; `publication.py`
  validates and publishes the single HTTP-facing snapshot; `daily.py` coordinates
  daily operations. `pipeline.py` imports fitting only for the explicit `train`
  command. No training runs at import time, during inspection, or in HTTP.

All extracted fitting, selection, metric and inference source files contribute to
future training fingerprints. Existing artifact identities and recorded hashes
remain readable without migration. The full requirements remain installed for
the supported CLI and existing LSTM/scoring behavior; this cleanup does not claim
a smaller container or a Torch-free LSTM runtime.

## Commands and execution order

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/requirements.txt
# Optional non-destructive backup; destination must not already exist:
.\.venv\Scripts\python.exe ml/pipeline.py backup --output C:\private\before-training.sqlite3
.\.venv\Scripts\python.exe ml/pipeline.py sync
.\.venv\Scripts\python.exe ml/pipeline.py validate
.\.venv\Scripts\python.exe ml/pipeline.py train
.\.venv\Scripts\python.exe ml/pipeline.py evaluate
.\.venv\Scripts\python.exe ml/pipeline.py select
.\.venv\Scripts\python.exe ml/pipeline.py predict
.\.venv\Scripts\python.exe ml/pipeline.py status
```

All commands accept `--db PATH`; the default is `INVESTING_HUB_ML_DB` or `ml/data/lifecycle.sqlite3`. `--symbol BTCUSDT` restricts training, synchronization, selection or generation. Publication always contains all eight symbols, with unavailable entries where needed. `predict --output PATH` selects the single publication destination. Backend `ML_DATABASE_PATH` and `PREDICTIONS_EXPORT_PATH` must match. Missing databases are not created by read commands. `ml/run.ps1 -Task Daily|Sync|Train|Select|Predict|Status` provides an explicitly invoked Windows wrapper. All mutating CLI jobs share one OS-released file lock per resolved database, including the entire daily sequence; the wrapper registers no task.

For the next UTC day, run `powershell.exe -NoProfile -File ml/run.ps1 -Task Daily` (sync, validate freshness, reconcile, predict, publish and verify). Existing selected models can predict newly verified data without retraining every day. Run `train` and `select` when refreshing models. Training/evaluation are one operation; `evaluate` reads the stored evaluation, while `select` applies the deterministic ranking without another fit. `reconcile` optionally appends realized outcomes to the existing ledger without changing original forecasts.

## Evaluation and selection

The prediction target is the next completed daily close return `close[t+1]/close[t]-1`; price is the known reference close multiplied by one plus the predicted return. All candidates share fourteen past-only features and identical target dates. The LSTM additionally consumes fourteen consecutive feature vectors. The first thirteen usable feature rows are excluded as targets for **every** candidate so evaluation samples match.

Default configuration: three expanding chronological selection folds of sixty days, then a separate ninety-day final evaluation period. Purging requires every training target to precede the next evaluation feature timestamp. A gap separates selection from the final period. Each fold gets a fresh model; no random train/test shuffling or evaluation-driven early stopping is used. Final production artifacts refit on all labels available at the forecast origin, **after** evaluation scores are frozen. Their own training fit is never reported as out-of-sample performance.

Ridge uses a train-only StandardScaler and alpha 100. Random Forest uses one hundred shallow trees with fixed seeds. Gradient Boosting uses sixty shallow trees. The LSTM has one CPU recurrent layer with twelve hidden units, a linear output, twelve fixed Adam epochs, chronological batches of 128 and train-only input/target scaling. JSON stores only bounded numeric weights; no pickle, Torch checkpoint deserialization or legacy ONNX artifact is executed. Reconstructed artifacts must match library inference within absolute error `1e-12` on a parity sample.

Selection uses aggregate **selection-fold price RMSE in USDT**, separately for each coin and comparison ID. Every candidate must have the same data/config/code/environment and evaluation plan. Candidates within a relative 0.5% of the smallest RMSE are treated as effectively equivalent and prefer Ridge, Gradient Boosting, Random Forest, then LSTM; model ID breaks any remaining tie. This tolerance chooses simplicity, not minimum quality. Final-period errors, baseline outperformance, fold wins, prospective sample counts and old registry labels are never selection gates.

MAE/RMSE are stored in return fractions and price USDT, along with direction accuracy and an identical-date no-change baseline. The internal `evaluate` CLI exposes selection and final-period results separately; the machine-readable run report includes every model and date boundary. The final period is excluded from this run's ranking but is previously inspected historical data, **not a pristine unseen benchmark**. No model is deemed reliable merely because it was selected. Cross-platform BLAS/PyTorch differences may prevent bit-identical reproduction even with fixed seeds and deterministic CPU algorithms; the recorded environment scopes reproducibility. See [PyTorch reproducibility](https://docs.pytorch.org/docs/stable/notes/randomness.html).

## Integrity, history and availability

Keep verified source hashes, reviewed exact historical extremes, UTC completion, missing-data rejection, immutable source revisions, dataset fingerprints, feature order/version, model checksum and forecast chronology. Synchronization reuses local rows and requests only missing intervals. No history is downloaded again unnecessarily. The original source data, old models, archived ONNX files and historical experiment reports are retained. Existing legacy status names remain in SQLite only so historical records are readable; no approval/promotion API or state machine remains.

The selected model occupies the existing registry's one active slot. The database's original model and prediction tables are reused; there is no second registry. Predictions are immutable by symbol/model/target. Corrupt or missing models/data return unavailable; no naive baseline is silently substituted as a forecast. Baseline errors and weak performance are measurements only. No confidence, interval, probability or narrative is manufactured.

Publication holds a SQLite writer reservation through the atomic JSON replacement. The API verifies checksum, schema, all-eight coverage, model/price parity, registry file stamp, source day and expiry. Any subsequent database mutation requires `predict` to refresh publication. Use a local disk outside concurrent cloud/network synchronization for normal operation. The current checkout/database were preserved and backed up during verification; no records were reset.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py'
```

Tests cover actual trainable candidates for all eight synthetic assets, common chronological windows, scaler isolation, deterministic selection and LSTM weights, artifact parity/corruption, no future-feature leakage, explicit unavailable output, non-destructive source synchronization and the complete CLI. Actual market-data results and preserved-record checks are in [the measured run](../docs/PRICE_PREDICTIONS.md), with all 32 candidate measurements in the ignored `ml/data/price-predictions-verification.json`.

## Direction and volatility research

PR #9 extends the existing minute pipeline with independently calibrated direction
and future realized-volatility objectives. The complete 768-configuration study,
per-pair results, ablations, calibration figures and resource limits are in
[Phase 2 findings](../docs/OBJECTIVE_FINDINGS.md). Five candidates meet development
gates; none is accepted for live numerical publication. The genuinely future
confirmation period starts December 2026. Existing price research and the daily
SQLite lifecycle remain intact. See [objective operations](../docs/OBJECTIVE_FORECASTS.md)
for reproducible commands, separate objective gates and the strict v3 API.

## Daily operation

Use `pipeline.py daily` or `powershell.exe -NoProfile -File ml/run.ps1 -Task Daily` for the complete daily sequence, without training/reselection. `daily-status` reads the most recent structured execution record. Explicit schedule installation, UTC timezone handling, bounded retries/retention, lock behavior, backup and safe restore commands are in [daily operations](../docs/DAILY_UPDATES.md). Scheduler installation is opt-in and never runs in tests or startup.
