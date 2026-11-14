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

Account JWT, owner scoping, decimal portfolio replay, Brevo/SMTP verification and optional Firebase notifications retain their existing behavior. Keep original database/collections, external credentials and signing keys private. See [API compatibility](../docs/API_COMPATIBILITY.md), [security](../docs/SECURITY.md), [ML commands](../ml/README.md) and [optional deployment](../docs/DEPLOYMENT.md).

## Isolated Mongo integration tests

The default unit suite needs no database. CI additionally runs a real Mongo 8.0
service and the repository/API persistence tests. To run them locally with Docker,
start a disposable server in one terminal:

```sh
docker run --rm --name investing-hub-test-mongo -p 127.0.0.1:27018:27017 mongo:8.0
```

In another PowerShell terminal at the repository root:

```powershell
$env:MONGO_TEST_PORT='27018'
npm run test -w backend -- tests/mongo.integration.test.ts
Remove-Item Env:MONGO_TEST_PORT
docker stop investing-hub-test-mongo
```

The test accepts only a loopback port, creates a random `investing_hub_test_*`
database and drops only that exact test-owned database. It does not read
`MONGO_URI` or private env files. Do not substitute a production URI. Tests cover
registration/verification/login, exact decimal trades, settings, revision conflicts,
owner isolation and persistence after connection reopen. Provider email is a
fixture; Mongo queries and auth are real. Without the explicit port the integration
case is reported as skipped, not passed. Process startup tests use isolated child
environments and cover unavailable Mongo; graceful SIGTERM is verified on Linux.

See the [production audit](../docs/PRODUCTION_AUDIT.md) for evidence, remaining
risks and the synthetic prediction-reader benchmark.
