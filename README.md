# Investing Hub

A local ML cryptocurrency price prediction application with a modern React web interface, an Expo mobile client and one TypeScript API. All trading is simulated. Prices are in **USDT**.

Price Predictions shows a numeric next-day closing estimate and target UTC date for BTC, ETH, SOL, BNB, XRP, ADA, DOGE and LINK. Models run locally in Python; the API only reads already-generated predictions. There is no generative AI service, paid review, news feed or research-report dependency.

## Quick start

Node 24/26 and Python 3.13 are supported by the verified environment.

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml/requirements.txt
# Reuse the existing database. Sync downloads only missing completed daily candles.
.\.venv\Scripts\python.exe ml/pipeline.py sync
.\.venv\Scripts\python.exe ml/pipeline.py train
.\.venv\Scripts\python.exe ml/pipeline.py select
.\.venv\Scripts\python.exe ml/pipeline.py predict
npm run dev
```

Open the printed Vite URL, normally http://localhost:3000, then **Price Predictions**. Training can take several minutes on CPU. It is explicit and never runs in an HTTP handler. Daily updates use `powershell.exe -NoProfile -File ml/run.ps1 -Task Daily` without training or model selection. Refresh models only when you explicitly choose to. `status` and `evaluate` inspect frozen results without retraining.

The default SQLite database is `ml/data/lifecycle.sqlite3`; the single publication is `ml/data/predictions.json`. Override the CLI database with `--db` or `INVESTING_HUB_ML_DB`; point the backend's `ML_DATABASE_PATH` and `PREDICTIONS_EXPORT_PATH` at the matching files. Missing, stale or corrupt inputs produce an explicit unavailable state, never a placeholder price. Existing datasets, historical experiment records and archived artifacts are preserved.

## Optional daily updates

```powershell
powershell.exe -NoProfile -File .\ml\run.ps1 -Task Daily
powershell.exe -NoProfile -File .\ml\schedule.ps1 -Action Install
powershell.exe -NoProfile -File .\ml\schedule.ps1 -Action Status
powershell.exe -NoProfile -File .\ml\schedule.ps1 -Action Uninstall
```

The opt-in Windows task runs at 03:15 Europe/Istanbul / 00:15 UTC without application servers, daily training or reselection. The installing user must stay signed in; the computer must run or resume. See [daily updates, logs, recovery and backups](docs/DAILY_UPDATES.md).

## Models and evaluation

Ridge, Random Forest, Gradient Boosting and a trainable CPU PyTorch LSTM use the same next-day return target and chronological evaluation days for each coin. Three selection folds precede a separate final evaluation period. Selection minimizes out-of-sample price RMSE; candidates within 0.5% of the best error prefer the fixed simplicity order. A model does not need to beat the no-change baseline to produce an experimental forecast. No approval, promotion or predictive-quality threshold exists.

Features are past-only, labels are purged at boundaries, and scalers fit training inputs only. Numeric JSON artifacts are checksum-verified and tested against training-library inference. Historical performance does not establish future reliability. See [methodology, commands and safeguards](ml/README.md) and [actual eight-coin measurements](docs/PRICE_PREDICTIONS.md).

## Retained application features

- Market dashboard, public Binance quotes, real OHLCV charts and technical levels.
- Simulated portfolios, fees, history replay and existing browser storage.
- Learning Hub, themes and responsive navigation.
- Turkish-first web and mobile interfaces with instant optional English and saved language preferences.
- Existing optional mobile account, portfolio and notification services. The shared `/api/predictions/:symbol` response retains familiar numeric/timestamp fields and adds experimental availability.

`/predictions` is the single web prediction page. Old `/future-analysis` bookmarks redirect there; `/research` and all review APIs are removed. Existing mobile/market/account endpoints remain supported. No deployment or scheduled task is installed automatically.

## Verification

Language controls are available to guests and signed-in users. New and existing users without a saved choice start in Turkish, regardless of browser/device language. See [client localization](docs/ARCHITECTURE.md#client-localization) for dictionaries, formatting and content limitations.

See [final MVP verification](docs/MVP_VERIFICATION.md) for the actual results and operational limits.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py'
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
npm run check:mobile
npm run test:mobile
npm --prefix mobileapp run test:browser
```

Read [architecture](docs/ARCHITECTURE.md), [API compatibility](docs/API_COMPATIBILITY.md), [security](docs/SECURITY.md), [mobile setup](mobileapp/README.md) and [optional deployment notes](docs/DEPLOYMENT.md). Older experiment documents are historical records, not current operating instructions.
