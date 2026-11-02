# Daily forecasting research

Python 3.13 is the verified runtime. Research is isolated from the web server. There is no Python HTTP service and no automatic model promotion. Original ONNX artifacts in `backend/models` remain untrusted and inactive.

From the repository root, on Windows:

```powershell
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
.venv/Scripts/python.exe -m unittest discover -s ml -p "test_*.py" -v
.venv/Scripts/python.exe ml/download.py
.venv/Scripts/python.exe ml/train.py
```

On macOS/Linux, create the environment with `python3.13 -m venv .venv` and use `.venv/bin/python` instead. If ensurepip is unavailable, a current system pip can target the environment with `python3.13 -m pip --python .venv/bin/python install -r ml/requirements.txt`.

The download spans January 2021–December 2025 for BTCUSDT and ETHUSDT, one-day UTC spot candles from Binance Vision monthly archives. Each archive is checked against the publisher's SHA-256 checksum. A separate checksum pins each normalized CSV, and `data/provenance.json` records source URLs, retrieval time and archive hashes. Spot archive timestamps from January 2025 are microseconds and are normalized to milliseconds. No key is needed.

Source: [Binance public-data documentation](https://github.com/binance/binance-public-data). Usage: noncommercial academic/open educational research under [Vision Dataset Terms and CC BY-NC-SA 4.0](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md). Raw datasets and artifacts are ignored. Redistributed derived results in `reports/` are attributed to Binance Vision and carry CC BY-NC-SA 4.0; do not use this pipeline as a commercial data product. Review the source terms for your intended use.

The target is `close[t+1] / close[t] - 1`, predicted after day t closes. Predicted price is `close[t] * (1 + predicted_return)`. Features consist of lagged returns, rolling volatility/mean returns, close-to-moving-average ratios, daily range/body and log-volume change. All transforms end at t. Scaling is inside the Ridge pipeline, fitted exclusively on the corresponding training fold.

Malformed OHLCV, nonfinite values, duplicates, negative volume, invalid UTC boundaries, forming candles and extreme one-day returns are rejected. Missing days start new segments; rolling windows and targets cannot cross those gaps. Prices are never forward-filled and extreme observations are never silently clipped. A manually reviewed replacement source is needed if the anomaly gate rejects a dataset.

The 60/20/20 chronological split has a one-sample horizon gap at each boundary. Models and hyperparameters are fixed before evaluation. Ridge, Random Forest and Gradient Boosting compete on validation return RMSE against no-change (zero return) and historical-mean returns. Four expanding-window folds with a one-day gap use only the pretest period. Promotion eligibility requires at least 2% lower validation return RMSE than no-change and wins in at least three of four folds. This is a conservative research gate, not statistical proof.

Only the selected approach and no-change baseline are then evaluated on the untouched final test. We do not choose a candidate using its test score. Reports include return and price MAE/RMSE, directional accuracy, sample counts, boundaries, all candidate validation/fold results, full hyperparameters, seeds, software versions, source/config/data hashes and status. Zero-return baseline direction is neutral, so its exact sign-match accuracy is 0 when the observed return is nonzero; this is not a 50% random directional classifier.

`artifacts/<version>/report.json` stores full metadata. The version includes dataset, config and source-code fingerprints. A complete fitted sklearn pipeline is saved with joblib **only if a candidate passes the gate**, then reloaded and checked for prediction parity to 1e-12. There is no ONNX conversion and no preprocessing reimplementation in Node. A qualifying artifact is still disabled until manual held-out review. No candidate qualified in the recorded experiment; consequently no new inference model was exported.

For a future qualifying, locally created artifact only:

```powershell
.venv/Scripts/python.exe ml/predict.py --artifact ml/artifacts/<version>/pipeline.joblib --csv ml/data/BTCUSDT.csv
```

Never load an untrusted joblib file. Offline inference uses the same feature function and enforces saved feature order; the final source candle must have a complete feature window. Deployment would additionally require recency checks, a reviewed artifact manifest and a consistent inference adapter; none is enabled by this demo.

See [actual experiment results](reports/RESULTS.md) and [machine-readable report](reports/latest.json). No trading strategy is evaluated; no cost-adjusted returns or execution-at-close assumptions are claimed. No LSTM was justified by the simpler candidates. The held-out period is historical, exchange-specific and cannot establish future performance. Repeated research tuned on these reports requires a new independent holdout.
