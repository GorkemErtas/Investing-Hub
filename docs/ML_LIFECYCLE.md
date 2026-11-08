# Local forecast architecture

The single command surface is `ml/pipeline.py`; [ml/README.md](../ml/README.md) is the current execution and methodology guide. [Actual measurements](PRICE_PREDICTIONS.md) record the completed eight-coin run.

1. `sync` reuses verified Binance daily candles and fetches only missing intervals into the existing SQLite tables. Source hashes, UTC completion, gap and reviewed-extreme checks remain mandatory.
2. `train` evaluates Ridge, Random Forest, Gradient Boosting and a CPU LSTM on common purged chronological selection windows plus a separate final period. It freezes metrics, then fits the forecast artifacts on currently available labels.
3. `select` ranks each coin's comparable candidate set by selection price RMSE, preferring simplicity within the fixed relative tolerance. Final-period results are excluded from selection. No predictive-performance threshold or promotion workflow remains.
4. `predict` runs the selected local artifact, records an immutable next-day price and atomically publishes one `predictions.json`. Missing/corrupt data or artifacts return unavailable, without substitute values.
5. The API validates the publication and serves `/api/predictions/:symbol`; the web and mobile clients display experimental numerical results. There is no training/inference in HTTP handlers.

`status`/`evaluate` inspect frozen evidence; `reconcile` appends actual outcomes without changing original forecasts. Existing source, dataset, model, experiment and ledger records are retained. Old registry status names can still be read as historical data, but no approval/promotion code is used for new forecasts.

Numeric JSON artifacts contain only checked feature contracts, bounded arrays and weights. There is no pickle/ONNX execution or generative-AI dependency. Fixed seeds and recorded versions support reproducibility within the recorded CPU/numerical environment; cross-platform bit identity is not promised.

`daily` orchestrates sync, freshness/integrity validation, reconciliation and all-eight prediction publication under one OS job lock; it does not train or select. `daily-status` reads bounded operational logs. The optional Windows task is installed explicitly; see [operations](DAILY_UPDATES.md).
