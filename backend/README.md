# Shared API

Optional free news collection uses GDELT DOC 2.0, reviewed official RSS and the public Lighthouse releases API. Enable `NEWS_INTELLIGENCE_ENABLED=true` and run `npm run news:collect -w backend`; no keys are needed. `news:analyze` is separate and requires explicit AI enablement plus a new private Gemini key. `news:status` and `news:prune` are finite local operations. The React Research Lab reads `GET /api/news/insights/BTCUSDT` and `/ETHUSDT`; GETs perform no network calls or writes. Source-only results have unknown sentiment/impact and null AI summaries. Coverage includes distinct timeout/rate-limit/local-cooldown/filter reasons, HTTP status and elapsed time when measured; latest failed checks survive a complete outage. See [operations and source terms](../docs/NEWS_INTELLIGENCE.md). ML prediction routes remain unchanged.

Express 5 / TypeScript modular monolith. `src/app.ts` composes public market/status routes and optional private mobile routes. `src/server.ts` owns network/database/mail/Firebase lifecycle. There is one active backend.

```powershell
# From repository root
npm ci
npm run build -w shared
npm run dev:api
# Production
npm run build
npm start -w backend
```

Only the current process environment is read. Copy `.env.example` into a private ignored file **only if needed**, then explicitly pass it with Node, for example `node --env-file=backend/.env.local --import tsx backend/src/server.ts`. Environment examples contain no live secrets. Public-only defaults need no env file.

| Variable                                        | Default / purpose                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                          | 5000                                                                                                                  |
| `CORS_ORIGINS`                                  | Exact localhost/127.0.0.1 origins on port 3000, comma separated; no wildcard; public production origins require HTTPS |
| `MARKET_TIMEOUT_MS`                             | 5000, one bounded retry for transient provider failures                                                               |
| `MARKET_CACHE_SECONDS` / `MARKET_STALE_SECONDS` | 30 / 900, bounded cache and stale fallback                                                                            |
| `MONGO_URI`                                     | Unset disables account services; preserve the existing database name when connecting real data                        |
| `JWT_SECRET`                                    | Required with Mongo, at least 32 random bytes; no fallback; tokens last one hour with issuer/audience/HS256 checks    |
| `SMTP_URL` / `EMAIL_FROM`                       | Optional together; `smtps://...:465` or STARTTLS SMTP; required for verified registration only                        |
| `FIREBASE_ENABLED`                              | false; Firebase Admin uses Application Default Credentials, never a source-controlled service-account file            |
| `PRICE_ALERTS_ENABLED`                          | false; requires Mongo + Firebase, separate 60-second bounded worker                                                   |

`/api/health` reports public process liveness; it does not promise exchange or Mongo readiness. `/api/capabilities` reports current account/registration/notification availability. Optional private endpoints return 503 when disabled or storage is unavailable. HTTP errors are always `{ error: { code, message } }` with sanitized messages. Authentication endpoints have a separate 15-request/15-minute IP budget; public/global budget is 120/minute, with proxy trust disabled.

Persistence preserves legacy collection names and `_id`, `userId`, `action`, `date` fields. Old numeric quantities/prices are read as decimals; new values are stored as decimal strings in the existing fields, with `fee` added. Use the new API exclusively after migration: the retired numeric-only server is incompatible with new decimal-string writes. Full-history replay guards every trade mutation; version checks return 409 on overlapping writes. Existing malformed/unsupported ledgers are retained and return `LEGACY_LEDGER_REVIEW`; operator review is required, with no automated rounding, symbol remapping or deletion. Back up your existing database before operator maintenance.

Indexes are created non-destructively on connection: the legacy unique email index and owner lookup indexes. An index conflict prevents private readiness and preserves data. No destructive migration runs. Registration codes use cryptographic randomness, hashed storage, a 10-minute TTL, five attempts and a bounded in-memory map. Pending verification is intentionally lost on restart; this low-cost deployment assumes one API instance. Configure distributed rate limits/verification only if scaling beyond one instance.

Alerts use only fresh public quotes and supported symbols. A bounded batch of 100 users is checked per minute, advancing a cursor. Claim-before-send prevents concurrent duplicate sends; failed delivery restores the alert. A process crash after claiming can lose a notification: this is best-effort delivery, not a financial execution system. One token is stored per account, matching the original schema. SMTP/FCM live delivery needs operator credentials and separate verification.

See [endpoint matrix](../docs/API_COMPATIBILITY.md), [security](../docs/SECURITY.md), [verification](../docs/VERIFICATION.md).
