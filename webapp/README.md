# Investing Hub web

Guest-only React + TypeScript application. Run `npm ci` from the repository root, then `npm run dev` to start this Vite app and the single root backend. To run only the frontend use `npm run dev:web`; the backend must be available on port 5000 for live data.

The dashboard, search/watchlist, actual OHLCV charts, technical analysis, simulated portfolio editor/export, Learning Hub, themes and disabled prediction status are retained. Research Lab now adds cached BTC/ETH News Intelligence. Portfolios and preferences stay in browser storage; no login, MongoDB or Firebase is required or called by this app. USDT is the quote currency. Fees enter weighted-average cost basis and realized P/L through `@investing-hub/shared/portfolio`.

Research uses React Query and the shared `news-insight-v2` schema. BTC/ETH caches are independent queries, rechecked every five minutes while visible; “Check cache” only repeats the read. Provider collection and optional Gemini analysis run separately in finite backend commands. Known publication dates, explicitly labeled GDELT index dates, stale/unavailable/insufficient states and source coverage remain visible. With AI disabled, headlines display normally and no classifications are invented. External links are schema-validated, open with `noopener noreferrer`, and never fetched by the page. See [Windows setup and source limitations](../docs/NEWS_INTELLIGENCE.md).

The methodology describes chronological development/selection and prospective validation accurately: inspected history through 2026 is not an untouched test. Prediction publication remains disabled.

Build with `npm run build -w webapp` after building shared (`npm run build -w shared`), or use root `npm run build`. Tests: `npm run test -w webapp`, `npm run lint -w webapp`, and root `npm run test:browser`. Browser and unit news tests use explicitly synthetic fixtures; backend/live checks are reported separately in [news verification](../docs/NEWS_VERIFICATION.md). Market/portfolio browser regressions remain in the suite. Vite and Nginx proxy `/api` to the root backend; there is no nested backend or web-only domain package.

Docker: `docker compose up --build` from the root. Deployment uses `webapp/Dockerfile` with the **root** build context and `webapp/nginx/default.conf`. Never build from a stale nested context. No forecast is approved; offline methodology and reports live in root `ml`.

See [root setup](../README.md), [architecture](../docs/ARCHITECTURE.md) and [actual verification](../docs/VERIFICATION.md).
