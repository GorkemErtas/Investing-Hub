# Investing Hub web

Guest-only React + TypeScript application. Run `npm ci` from the repository root, then `npm run dev` to start this Vite app and the single root backend. To run only the frontend use `npm run dev:web`; the backend must be available on port 5000 for live data.

The dashboard, search/watchlist, actual OHLCV charts, technical analysis, simulated portfolio editor/export, Learning Hub, themes and disabled research status are retained. Portfolios and preferences stay in browser storage; no login, MongoDB or Firebase is required or called by this app. USDT is the quote currency. Fees enter weighted-average cost basis and realized P/L through `@investing-hub/shared/portfolio`.

Build with `npm run build -w webapp` after building shared (`npm run build -w shared`), or use root `npm run build`. Tests: `npm run test -w webapp`, `npm run lint -w webapp`, and root `npm run test:browser`. The browser suite uses controlled market fixtures; it verifies UI behavior independently of an exchange outage. Vite and Nginx route `/api` to `/backend`; there is no nested backend or web-only domain package.

Docker: `docker compose up --build` from the root. Deployment uses `webapp/Dockerfile` with the **root** build context and `webapp/nginx/default.conf`. Never build from a stale nested context. No forecast is approved; offline methodology and reports live in root `ml`.

See [root setup](../README.md), [architecture](../docs/ARCHITECTURE.md) and [actual verification](../docs/VERIFICATION.md).
