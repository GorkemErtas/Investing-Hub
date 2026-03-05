# Investing Hub

A web-only cryptocurrency analytics and learning demo. Explore public exchange data, manage a local simulated portfolio, inspect reproducible forecasting research, and learn the foundations. **No real trading, paid AI, account registration or database is required.**

The rebuild lives entirely in the working tree on the existing `webapp` branch. No branches, commits, staging, pushes, Git configuration or remote deployments were changed. Original contributor attribution and six legacy ONNX/scaler artifacts are preserved.

## Local development

Use **Node.js 24 LTS** (26 LTS is also accepted), npm, and outbound HTTPS access to the public data provider. Python 3.13 is needed only for offline research.

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. The API listens on port 5000. `npm run dev` starts both services; Ctrl+C stops both. For separate terminals use `npm run dev -w backend` and `npx vite`.

There are no required credentials. The API uses validated process environment variables; **tracked legacy `.env` files are intentionally not loaded**. Vite uses a separate empty environment directory and same-origin `/api`, so old `VITE_API_URL` files are ignored. To use optional configuration, create a newly reviewed `.env.local` from `.env.example` and explicitly load it after a production build:

```powershell
npm run build
node --env-file=.env.local backend/dist/backend/src/server.js
```

In another terminal run `npm run preview` and open port 3000. `npm start` starts the compiled API alone. All commands run from the repository root. Do not install the old backend lockfile; there is now one npm workspace lockfile.

| Process variable       | Default                                       | Meaning                                                           |
| ---------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`             | `development`                                 | `development`, `test` or `production`                             |
| `PORT`                 | `5000`                                        | API listener port                                                 |
| `CORS_ORIGINS`         | `http://localhost:3000,http://127.0.0.1:3000` | Exact comma-separated HTTP origins, no wildcard or paths          |
| `MARKET_TIMEOUT_MS`    | `5000`                                        | Per-attempt upstream timeout, 100?10,000 ms                       |
| `MARKET_CACHE_SECONDS` | `30`                                          | Cache TTL, 15?300 seconds                                         |
| `MARKET_STALE_SECONDS` | `900`                                         | Maximum stale response age, 60?3,600 seconds and greater than TTL |

Changing the backend port also requires changing Vite's local proxy target. Public production CORS origins must use HTTPS. No JWT, Gemini, CryptoPanic, email or MongoDB setting is used by the new app.

## What works

- Responsive dashboard, dark/light appearance, asset search, sortable markets and a persistent watchlist.
- Eight explicit USDT spot pairs: BTC, ETH, SOL, BNB, XRP, ADA, DOGE and LINK. Prices are quoted in **USDT**, not fiat USD. The overview totals only these pairs' quote volumes; it is not total crypto capitalization or global trading volume.
- Real OHLCV candlestick/area charts, base-asset volume, six intervals, UTC labels, completed/forming status, descriptive SMA 20/Fibonacci overlays and an accessible exact-data table. Calendar-month candles are validated as calendar months.
- Multiple local guest portfolios with fictional starter transactions, add/edit/delete simulated trades, rename/delete portfolios, JSON export, allocation, fee-aware weighted average cost and realized/unrealized P/L. Full-history replay prevents overselling or invalid backdated edits. There is no cash balance constraint or exchange execution.
- Clear loading, empty, failure and stale states. Saved data can still be managed while providers are down. Missing prices are never replaced with invented values.
- Learning articles, retained educational candle imagery and an interactive quiz with explanations.
- A research page that explicitly shows **no approved forecast**. Legacy models and fabricated news are not served.

Portfolio state, watchlist and appearance use versioned browser storage. They are local to this browser/origin; there is no account ownership, cloud sync, automatic legacy-database migration or private server data. Changing browsers/ports or clearing storage loses access to that local state. Export a portfolio before clearing storage. Concurrent tabs use last-write-wins persistence; avoid editing the same portfolio in several tabs. Invalid saved data is left untouched until a deliberate new save; a warning explains recovery behavior.

## Architecture and API

React 19 + TypeScript + Vite, TanStack Query, Lightweight Charts, a TypeScript Express 5 API, shared Zod contracts and a Decimal.js accounting ledger. Route views load lazily. One batched market request replaces the old per-asset historical fan-out. Market cache entries and in-flight requests are shared; provider timeouts, one retry, 418/429 cooldown, concurrency and request limits bound failure costs.

| Endpoint                               | Behavior                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/health`                      | Process health and `guest-demo` mode; does not call external providers |
| `GET /api/markets`                     | Eight normalized tickers with quote volume and freshness metadata      |
| `GET /api/candles/:symbol?interval=1d` | Up to 180 actual OHLCV candles, including explicit completion status   |
| `GET /api/predictions/:symbol`         | BTCUSDT/ETHUSDT daily forecast status; null prediction until validated |

Intervals: `15m`, `1h`, `4h`, `1d`, `1w`, `1M` (calendar month). Invalid symbols, intervals, extra query parameters and refresh overrides return 400. Legacy auth, portfolio, settings, news, model-specific and force-refresh routes return 404. There are no server write endpoints. Cache defaults are 30 seconds fresh and up to 15 minutes old during provider failure. A cold outage returns 503; retries are suppressed for 30 seconds. The interface polls active resources every 60 seconds.

Provider: [Binance's public market-data-only endpoint](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only) and [documented spot market API](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints). Provider access may be restricted by region, availability or rate limits. There is no silent fallback to a different exchange/currency. Source timestamp means ticker close time or candle open boundary; fetch time is reported separately. A forming candle's last-trade publication timestamp is not supplied by this provider.

See [architecture](docs/ARCHITECTURE.md), [initial audit](docs/AUDIT.md) and [security actions](docs/SECURITY.md).

## Offline ML experiments

See [research setup and methodology](ml/README.md), [actual results](ml/reports/RESULTS.md) and [full metrics/provenance](ml/reports/latest.json).

The verified run used checksum-validated Binance Vision daily BTCUSDT/ETHUSDT candles from January 2021 through December 2025: 1,826 candles per pair, 1,811 usable samples after warmup/target filtering, no gaps or detected anomalies. Preparation uses past-only features, chronological 60/20/20 splitting with horizon gaps, train-only transforms, four expanding-window folds, fixed seeds, and versioned source/config/data fingerprints.

Ridge, Random Forest and Gradient Boosting were compared with no-change and historical-mean baselines. Gradient Boosting was best on validation for both pairs, but its return-RMSE improvement was only about **1.11% BTC / 0.81% ETH**. BTC won 2/4 walk-forward folds; ETH won 3/4. Neither met the preconfigured 2% validation improvement gate. **No candidate was selected for model inference or exported. Forecasts remain disabled.** The no-change baseline's held-out price RMSE was 2,130.97 USDT for BTC and 119.42 USDT for ETH; these are baseline errors, not AI performance claims.

No LSTM complexity was justified, no trading strategy was tested, and no trading returns are claimed. Historical results are not evidence of reliable future performance. Derived reports are attributed to Binance Vision under CC BY-NC-SA 4.0 and its published dataset terms; raw data and model files are excluded from Git. The original ONNX artifacts have no verifiable evaluation and remain inactive.

## Verification

```powershell
npm run build
npm run lint
npm test
npm run format:check
npx playwright install chromium
npm run test:browser
```

Browser tests start the local servers automatically unless they are already running. Synthetic market fixtures are isolated to tests and are never part of the app. Test coverage includes ledger edge cases and edit/delete replay, schema/security behavior, request limits, candle normalization/calendar intervals, shared cache/cooldowns, technical indicators, desktop/mobile navigation, theme/watchlist persistence, simulated transaction accounting, provider outage and the learning quiz.

Python checks and experiments:

```powershell
py -3.13 -m venv .venv
.venv/Scripts/python.exe -m pip install -r ml/requirements.txt
.venv/Scripts/python.exe -m unittest discover -s ml -p "test_*.py" -v
.venv/Scripts/python.exe ml/download.py
.venv/Scripts/python.exe ml/train.py
```

Use `.venv/bin/python` on macOS/Linux. The Python dependencies, including transitive scientific dependencies, are pinned. Tests prove past-only features, next-day target alignment, gap isolation, valid UTC boundaries, and rejection of malformed/incomplete data. See [verification record](docs/VERIFICATION.md) for actual commands/results and environment limitations.

## Local Docker workflow

```powershell
docker compose config --quiet
docker compose up --build
```

Open **http://127.0.0.1:8080**. Compose builds a static Nginx web image and a Node 24 API image, waits for API health and publishes only the loopback web port. The API runs as a nonroot user and is not publicly published; no Mongo service/volume is needed. Health checks are local and do not spend provider quota. `.dockerignore` excludes environment files, raw data, artifacts, local tooling and Git metadata.

The Compose definition was validated, but container builds/startup were **not verified** because the local Docker Desktop Linux engine was unavailable. No remote deployment was attempted. The image tags track maintained release lines; production operators should pin reviewed image digests and configure TLS if a future public deployment is authorized.

## Required owner actions

**Rotate the previously exposed credentials and untrack legacy environment files before publishing.** Exact manual actions are in [docs/SECURITY.md](docs/SECURITY.md). The three tracked files remain unchanged; `.gitignore` alone does not remove them from the index or history. No credential was reproduced in the rebuilt code or documentation.

Remaining limits: one external market provider, device-local guest state, no authenticated accounts/cloud sync, no live news, no approved forecasting model, no production infrastructure or container-runtime verification. The patched `minimatch` override applies to development tooling; lint and core tests verify its current use. Dependency audits are point-in-time checks, not a permanent guarantee.

## Original project and contributors

Investing Hub originated as a software engineering undergraduate graduation project at **Ya?ar University**. This rebuild preserves its educational purpose, contributor attribution, historical Git provenance and unverified model artifacts.

- G?rkem Erta?
- Cem Arda Do?an
- Asil Demian ?zbay
- Taylan ?zg?r Elma

Advisor: **Dr. Bar?? Y?ld?z**.

Charting uses [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/); its attribution link remains visible on charts. Third-party packages/assets retain their own licenses. No new repository-wide license is asserted for the original contributors' work.
