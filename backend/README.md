# Shared API

Express/TypeScript serves public market data, already-generated local predictions and the retained optional mobile services. `GET /api/predictions/:symbol` returns one experimental numerical next-day forecast or an explicit unavailable state. It reads `PREDICTIONS_EXPORT_PATH` and verifies the matching `ML_DATABASE_PATH` stamp, checksum, schema and UTC expiry. It never loads a model, spawns Python, trains or sends an AI request. No research/review API remains.


```powershell
npm ci
npm run build -w shared
npm run dev:api
# Production build, without deploying:
npm run build
npm start -w backend
```

Only the process environment is read. An ignored private file can be loaded explicitly with `node --env-file=backend/.env.local --import tsx backend/src/server.ts`; obsolete generative-AI settings are no longer recognized or used. Defaults need no credentials for public market data and no database service. The existing local SQLite file is consumed indirectly through generated JSON; Mongo is optional for authenticated mobile accounts/portfolios/settings.

Account JWT, owner scoping, decimal portfolio replay, SMTP verification and optional Firebase notifications retain their existing behavior. Keep original database/collections, external credentials and signing keys private. See [API compatibility](../docs/API_COMPATIBILITY.md), [security](../docs/SECURITY.md), [ML commands](../ml/README.md) and [optional deployment](../docs/DEPLOYMENT.md).
