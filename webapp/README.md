# Investing Hub web

Guest-only React + TypeScript application. Run `npm ci` from the repository root, then `npm run dev` to start this Vite app and the single root backend. To run only the frontend use `npm run dev:web`; the backend must be available on port 5000 for live data.

The dashboard, search/watchlist, actual OHLCV charts, technical analysis, simulated portfolio editor/export, Learning Hub and themes are retained. Future Analysis replaces standalone News Intelligence with one report for every shared asset. Portfolios/preferences keep their existing browser storage keys; no account, MongoDB or Firebase is required. USDT is the quote currency. Fees enter weighted-average cost basis and realized P/L through `@investing-hub/shared/portfolio`.

The report combines an independently approved ML price/interval/direction with a critical grounded review, qualitative scenarios, conditional monitoring guidance, sources and model provenance. Ordinary React Query GETs read ML only and never spend. An unchecked consent control enables a single private POST when server configuration permits. The returned review stays only in component memory; changing coins, leaving or reloading clears it. Original Search Suggestions render in a sandboxed iframe; sources come from validated grounding metadata. Missing ML permits research only; a Gemini outage preserves ML. See [setup and limitations](../docs/FUTURE_ANALYSIS.md).

The methodology describes chronological development/selection and prospective validation accurately: inspected history through 2026 is not an untouched test. Numeric publication requires explicit ML export and all historical, prospective, calibration and active-origin gates.

Build with `npm run build -w webapp` after building shared (`npm run build -w shared`), or use root `npm run build`. Tests: `npm run test -w webapp`, `npm run lint -w webapp`, and root `npm run test:browser`. Browser and unit Future Analysis tests use synthetic fixtures and mocked Google responses; [verification](../docs/FUTURE_VERIFICATION.md) separates those checks from actual model readiness. Market/portfolio browser regressions remain in the suite. Vite and Nginx proxy `/api` to the root backend; there is no nested backend or web-only domain package.

Docker: `docker compose up --build` from the root. Deployment uses `webapp/Dockerfile` with the **root** build context and `webapp/nginx/default.conf`. Never build from a stale nested context. No forecast is approved; offline methodology and reports live in root `ml`.

See [root setup](../README.md), [architecture](../docs/ARCHITECTURE.md) and [actual verification](../docs/VERIFICATION.md).
