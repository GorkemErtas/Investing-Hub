# Investing Hub

Local-first cryptocurrency research, market charts and simulated portfolios, with
React web, Expo mobile and one TypeScript API. Prices are in **USDT**.

The coin chart prioritizes **direction probabilities** and **future realized
volatility** for 1m, 15m and 1h. Price projection is optional and experimental;
1M remains disabled. Existing daily predictions and historical evidence are retained.
All model outputs are experimental and may perform worse than a simple baseline.

## Windows quick start

Install Node **24 or 26**, npm and Python **3.13**, then run in PowerShell:

```powershell
.\dev.ps1 -Install   # first use: dependencies, existing model selection, API/web/worker
.\dev.ps1            # subsequent starts
.\dev.ps1 -Check     # environment validation only
```

Open **http://localhost:3000**. Ctrl+C stops the entire local stack. No Railway,
Docker, account, paid API or scheduled service is required. Startup selects existing
artifacts without retraining. Missing models or internet show unavailable states.
Use `.\dev.ps1 -NoML` for web/API guest mode without Python.

Optional configuration belongs in ignored root `.env.local`; copy `.env.example`
only if needed. Keep existing private files, database URIs and signing secrets.
MongoDB Community on Windows or Atlas is optional for accounts/private portfolios;
guest portfolios stay in browser storage. Email verification and notifications
retain their existing separate configuration.

[Windows setup and troubleshooting](docs/LOCAL_WINDOWS.md) ·
[Türkçe ML özeti ve gerçek model sonuçları](docs/ML_YEREL.md) ·
[Local verification](docs/LOCAL_VERIFICATION.md)

## Models and preserved features

Local experimental selection minimizes development log loss for direction,
MAE (then QLIKE) for volatility and return RMSE for price, with deterministic tie-breaking.
Final holdout results never select a model. Statistical diagnostics remain visible;
local availability does not imply baseline superiority or confirmed predictability.
[The 24-pair MAE-first comparison](ml/reports/selection-quality/COMPARISON.md) records
18 changed volatility models, lower recorded development MAE and worse QLIKE in
those pairs. [Stability and leakage diagnostics](ml/reports/selection-quality/STABILITY.md)
show regime/event sensitivity and uncertainty limitations; no candidate models were retrained.
[All local selections](ml/reports/local-selection.json) and the preserved
[Phase 2 research](docs/OBJECTIVE_FINDINGS.md) document the measured limitations.

Market/OHLCV charts, simulated portfolio accounting and history, Learning Hub,
Turkish/English, dark/light themes, responsive layouts and optional authenticated
mobile services remain supported. Source CSV/Parquet, trained weights, the daily
SQLite database and archived models remain local and outside Git.
Daily operations stay explicit: `powershell.exe -NoProfile -File ml/run.ps1 -Task Daily`.

## Development and checks

`npm run dev` starts the full local stack; `npm run dev:web-stack` starts web/API
only. HTTP reads completed snapshots and never trains. Run:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py'
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

See [architecture](docs/ARCHITECTURE.md), [API compatibility](docs/API_COMPATIBILITY.md),
[security](docs/SECURITY.md) and [mobile setup](mobileapp/README.md). The Railway
service has been removed; retained [hosting files](docs/RAILWAY.md) are legacy
reference and isolated test infrastructure. No external deployment is performed.
