# Local Windows execution

Use Node 24 or 26, npm and Python 3.13. Railway and Docker are not required.
From PowerShell in the repository root:

```powershell
# First use: install dependencies, reuse/create .venv, select existing models and start.
.\dev.ps1 -Install
# Subsequent starts:
.\dev.ps1
# Validate dependencies and configuration without starting servers or training:
.\dev.ps1 -Check
# Web/API guest mode without Python:
.\dev.ps1 -NoML
```

If PowerShell's script policy blocks the file, the per-process invocation is
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\dev.ps1`.
Open **http://localhost:3000**, select a coin on the chart and use its direction /
volatility panel. Price projection is expandable. All numerical outputs are
experimental. Ctrl+C stops the API, frontend and the single ML worker together;
the launcher kills only process trees it created. No service or scheduled task is
installed. `npm run dev` and `npm run local:check` are equivalent underlying commands.

## Configuration and persistence

The launcher reads only root **`.env.local`**, if present; existing shell values
take precedence. Copy `.env.example` only when you need overrides. Do not overwrite
an existing private file or commit credentials. Direct API execution continues to
read only its process environment. Invalid configuration stops startup without
printing secrets. The local launcher binds the API and frontend to loopback.

Defaults: API 5000, frontend 3000. An alternate `PORT` is passed automatically to
Vite's API proxy. The web port is strict; close an existing local instance if it is
occupied. For native-device/LAN testing, explicitly set `BIND_HOST=0.0.0.0` and
configure the existing mobile client URL and CORS origins.

Guest portfolios remain in browser storage. Existing authentication, private
portfolios and settings use optional MongoDB. An installed MongoDB Community
Windows service or an existing Atlas database works with:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/investing_hub
JWT_SECRET=<private random secret of at least 32 bytes>
```

Generate a secret locally, for example:
`node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
Keep the original database URI and signing secret when retaining existing accounts.
Registration/email verification needs the existing Brevo or SMTP configuration;
see [backend setup](../backend/README.md). Push notifications retain their separate
Firebase configuration. The launcher never provisions databases, sends mail,
creates users or changes cloud services. Missing/unreachable Mongo does not block
public market pages or local forecasts.

The existing daily SQLite database, archived models and source CSV/Parquet data are
unchanged. Local minute publications use `ml/data/forecasts-v2.json` and
`ml/data/objective-forecasts.json`; matching path overrides are in `.env.example`.
The daily publication stays `ml/data/predictions.json`. Daily execution remains
explicit: `powershell.exe -NoProfile -File ml/run.ps1 -Task Daily`.

## Models and inference

Startup runs `forecast_v2.py local-prepare`: it ranks **existing** trained
artifacts and copies their exact checksum-verified bytes into ignored
`ml/artifacts/local`. It does not fit, tune, rescore a holdout, download historical
archives or modify the original research. Source defaults are the existing
`objectives-study-2026-11-16` directory and `multihorizon/study-final.json`.
`local-prepare --help` documents overrides for moved/private datasets and studies.

Direction minimizes calibrated three-class development log loss, then Brier.
Volatility minimizes development QLIKE, then MAE. Price minimizes development
return RMSE. Metrics rounded to 12 decimals break numerical ties using fixed
algorithm simplicity order, then candidate ID. Ablation fits are eligible; binary
conditional-on-nonzero controls and GARCH without a verified live-state artifact
are excluded. Corrupt/missing artifacts are skipped for another valid trained
candidate, with exclusions recorded in `ml/artifacts/local/selection.json`.

No 1% improvement, significance, all-fold-win or future-confirmation threshold
blocks **experimental** local outputs. Historical gated decisions and uncertainty
remain preserved in the earlier reports. Shared contracts distinguish
`experimental` from the old `validated` state; neither is relabeled by changing
historical evidence. All monthly forecasts remain disabled.

One worker shares completed Binance candles and feature computation across
objectives/horizons, with two fetch threads, two bounded history pages, single
numerical threads, model/origin caching and a 60-second failure cooldown.
It aligns updates shortly after each UTC minute. API requests only read snapshots;
they never fit models or start Python. Initial startup can take a cycle before
forecasts appear. One-minute values expire at their target; longer horizons also
expire 90 seconds after the source candle. The UI removes expired numbers.

If models are missing, startup still works and shows unavailable objectives;
restore the ignored original artifacts or explicitly run research to obtain new
ones. It never invents weights or substitutes a baseline/current price. Missing
historical data does not prevent inference with complete artifacts, but historical
risk categories become unavailable. Internet failure produces unavailable/expired
values, while cached forecasts remain usable only until their original expiry.

## Research and tests

[Turkish ML summary](ML_YEREL.md) lists actual selected models and performance.
[Local selection evidence](../ml/reports/local-selection.json) records metrics,
artifact hashes and exclusions. Earlier [Phase 2 findings](OBJECTIVE_FINDINGS.md)
and the original price benchmark are historical evidence under the previous
activation policy. Their negative conclusions about robust predictive value are
not reversed by local availability.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py'
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

Browser regression fixtures test UI states; a separate real-provider check records
actual trained-artifact outputs and a screenshot without intercepting the API.
With the full stack running, use `npx playwright install chromium` once, then
`npm run verify:local` in another terminal. This waits for actual fresh forecasts,
compares displayed numbers against API responses, disconnects only its browser,
checks expiry without a fake clock and checks reconnection. Evidence is saved
under ignored `.npm-cache/local-real-ui`; it may take two minutes. Model availability
and internet access are required for this opt-in check, which is not run in CI.
See [local verification](LOCAL_VERIFICATION.md) for results and limitations.
The retained Docker/Railway files are optional compatibility/test infrastructure.
