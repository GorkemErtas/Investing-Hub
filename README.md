# Investing Hub

A modular monolith with a guest React web demo, an Expo mobile app, one TypeScript API, universal contracts/accounting, and an offline Python research pipeline. All trading is simulated. Market quotes are in **USDT**, not USD. No forecast is published.

| Directory   | Responsibility                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `webapp`    | Modern responsive dashboard, charts, guest portfolios, Learning Hub and research status                     |
| `mobileapp` | Expo Router screens, native app/assets, secure session and storage adapters                                 |
| `backend`   | Public cached market API and optional authenticated mobile services                                         |
| `shared`    | Zod contracts, Decimal chronological ledger, analysis and typed HTTP client; no React/platform dependencies |
| `ml`        | Incremental daily datasets, offline training/registry, prospective forecast history and a quarantined archive |
| `docs`      | Audit, architecture, endpoint migration, security and actual verification results                           |

## Web and public API

Use Node 24 or 26 and npm. From the repository root:

```powershell
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. The web dev server proxies `/api` to the root backend on port 5000. The guest demo requires no account, MongoDB, SMTP, Firebase or paid API key. Guest portfolios stay in the browser under the existing `ih:*:v1` keys.

Run independently in two terminals with `npm run dev:api` and `npm run dev:web`. For production: `npm run build`, then `npm start -w backend`; serve `webapp/dist` with the documented reverse proxy. `npm run dev:web` alone still needs a running API for live quotes.

## Mobile

The Expo SDK 53 install is intentionally isolated from the web workspace, so native React 19.0 does not resolve the web's newer React installation. First install/build shared code with the root instructions, then:

```powershell
npm --prefix mobileapp ci
Copy-Item mobileapp/.env.example mobileapp/.env.local
# Edit EXPO_PUBLIC_API_URL for your emulator/device/backend.
npm --prefix mobileapp start
```

Use `http://10.0.2.2:5000` for the Android emulator, your computer's LAN origin for a physical device, and HTTPS for a production build. The app validates the URL. Run a native development build with `npm --prefix mobileapp run android`; Firebase native modules require a development build rather than Expo Go. Public mobile market/learning screens work without account services. See [mobile setup](mobileapp/README.md) for account, EAS, native and notification requirements.

## Optional mobile accounts

Set a private `MONGO_URI` and a strong `JWT_SECRET` of at least 32 random bytes in the backend process environment. Nothing loads historical `.env` files automatically. Use [backend configuration](backend/README.md) and its safe example. Registration additionally requires SMTP; existing verified users can log in without it. Firebase delivery and price-alert polling are separately opt-in.

The API keeps the existing `users`, `portfolios` and `settings` collections. Existing bcrypt hashes, ownership IDs and transaction field names are read compatibly; no database records are deleted or migrated automatically. Private requests authenticate the caller and constrain every operation to their ownership. Mongo failure does not stop public market data.

## Verification

```powershell
npm run build
npm run typecheck
npm test
npm run lint
npm run test:browser
npm --prefix mobileapp run typecheck
npm --prefix mobileapp test
npm --prefix mobileapp run doctor
```

Python setup, incremental sync, manual/weekly training, explicit model review, rollback and Windows scheduling are in [ml/README.md](ml/README.md). This local lifecycle does not enable public forecasts or register jobs. See its [architecture audit](docs/ML_LIFECYCLE.md) and [actual verification](docs/ML_VERIFICATION.md). Docker files use the root build context; `docker compose up --build` serves the guest web app on loopback port 8080 without Mongo. See [deployment](docs/DEPLOYMENT.md) before enabling mobile services or exposing a host publicly.

Read [audit/plan](docs/MIGRATION_AUDIT.md), [architecture](docs/ARCHITECTURE.md), [every legacy endpoint](docs/API_COMPATIBILITY.md), [security](docs/SECURITY.md), [verification and remaining limitations](docs/VERIFICATION.md), and [review/staging groups](docs/REVIEW_GUIDE.md). Historical web-only reports are labeled under `docs/historical-web`.
