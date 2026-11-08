# Investing Hub web

The retained React/Vite design includes the market dashboard, real candles/charts, simulated portfolios, Learning Hub, themes, Analytics Lab and **Price Predictions**. Run `npm ci` and `npm run dev` from the repository root. Public quotes use USDT.

`/predictions` shows all eight coin names/symbols, locally generated next-day closing prices, target UTC dates and experimental labels. It uses only `GET /api/predictions/:symbol`. No consent, review, narrative, source iframe, confidence score or external AI request exists. Unavailable, corrupt or expired forecasts never become placeholder prices. `/future-analysis` redirects to this single page for old bookmarks; `/research` is removed.

Analytics Lab compares the latest four comparable model candidates and displays final-period performance separately. It is local-only and never blocks numerical forecasts. The market, portfolio and learning features preserve their existing storage keys and behavior.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run test:browser
```

See [local training and publication](../ml/README.md), [actual model measurements](../docs/PRICE_PREDICTIONS.md) and [architecture](../docs/ARCHITECTURE.md).
