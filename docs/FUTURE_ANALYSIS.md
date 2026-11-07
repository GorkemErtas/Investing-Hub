# Future Analysis: architecture and operation

One report combines an independently validated next UTC daily close forecast with a critical Gemini review of that exact forecast and current Google Search context. BTC, ETH, SOL, BNB, XRP, ADA, DOGE and LINK come from `shared/contracts.ts`; Python reads the bounded literal catalog rather than maintaining another list. The dashboard links each asset to `/future-analysis?symbol=...`. `/research` opens the same report for existing navigation.

## Authority and publication

Python alone produces reference/predicted prices in USDT, expected return, sign-derived direction, and the interval. No inference or training runs in Express. The existing immutable SQLite datasets, source hashes, candidate registry, independent Ridge/Random Forest/Gradient Boosting fits, chronological purging, prospective forecasts, approval, promotion and rollback remain authoritative. Inspected history through 2026 is development/selection evidence, never a new untouched test.

The interval uses absolute **out-of-sample** return residuals from development folds. A finite-sample rank `ceil((n+1)*0.9)` fixes its radius before the final selection fold. That later fold measures coverage; below 90% is experimental and withheld. Price bounds are reference times `(1 + predictedReturn ± radiusReturn)`; impossible/nonpositive bounds are withheld rather than clipped. Calibration samples, dates, empirical coverage and method are frozen with the model and original forecast. This is historical empirical coverage, not a guarantee or a calibrated future probability. Reconciliation records subsequent interval outcomes without changing the original bounds.

Publication additionally requires current, gap-free verified data, an unexpired active model, the historical gates and at least 30 genuinely prospective outcomes meeting configured baseline thresholds. A candidate-origin shadow remains withheld after promotion; wait for the next active-origin forecast. Models without interval evidence must undergo a new independently reviewed lifecycle; no old ledger entry is repaired or relabeled automatically.

From the repository root, follow [ML setup and review gates](../ml/README.md). After independently reviewing/approving a model and generating a current active forecast, explicitly export:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py export-analysis
# With a custom database, both consumers must point to the same file:
.\.venv\Scripts\python.exe ml/pipeline.py export-analysis --db C:\private\ml\lifecycle.sqlite3 --output C:\private\ml\future-forecasts.json
```

Export does not train, promote or activate forecasts. It emits all eight assets, including explicit unavailable reasons. A SQLite writer lock covers evidence reads and atomic JSON publication, without writing evaluation events. The envelope checksum detects corruption; the backend also verifies the database size/mtime before and after every read. Any subsequent database change revokes the export until a new export. A checksum is not a signature: both files must remain operator-owned on persistent local disk, outside cloud/network sync. Do not restore/copy a live database or enable WAL/replace the database outside this lifecycle. Registry/model/evaluation hashes and dates remain visible in the report.

`GET /api/future-analysis/:symbol` validates this file and returns ML plus research readiness only. It never writes, calls Gemini, or returns somebody else's grounded review. ML publication is fresh for six hours by default; a still-current forecast may be marked stale thereafter, with expiry checked separately. Missing, expired, tampered or revoked files yield explicit unavailable data. The original `/api/predictions/:symbol` stays disabled and preserves mobile compatibility.

## Critical review and deterministic gate

The browser sends `POST /api/future-analysis/:symbol/review` with only `{ "allowPaid": true, "requestId": "<uuid>" }`, after an unchecked consent control is selected. Express selects/validates ML evidence itself. The structured Gemini prompt includes model/version, exact numeric forecast, historical/prospective metrics and policy, calibration, quality, timestamps and freshness. Gemini researches the selected coin and relevant macro/regulatory context; it can challenge weak/stale evidence and identify invalidation conditions.

Gemini returns a structured summary, critical review, developments/risks/events, qualitative bullish/base/bearish scenarios and conditional monitoring recommendations. `SUPPORTED_BY_CONTEXT`, `CONFLICTING_EVIDENCE`, `INSUFFICIENT_EVIDENCE` and `HIGH_UNCERTAINTY` describe external context, not predictive accuracy. The backend checks symbol, 1d horizon, model ID and exact ML fingerprint, original JSON consistency, genuine grounding URLs, UTF-8 byte spans, source indices, source times and claim support. Numerical forecast fields are never accepted from Gemini. New price targets/percentages/guaranteed trades and recognizable injection instructions fail closed. Shape/reference checks cannot prove source truth or eliminate all prompt injection; prose remains attributed research.

The SDK request uses Google Search plus the documented structured JSON subset, an explicit official endpoint, one attempt and cancellation/timeout. Full local Zod validation runs after decoding. The configured model is not silently replaced. This combined tool/output mode is documented for Gemini 3, including the configured `gemini-3.5-flash-lite`, but is preview functionality and has not been tested here with paid live calls. Invalid/unsupported grounding or Search Suggestions variants are withheld. See [model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [structured output](https://ai.google.dev/gemini-api/docs/structured-output) and [grounding metadata](https://ai.google.dev/api/generate-content#GroundingMetadata).

If research fails, validated ML survives. If ML is absent, the same request can produce research only, without a price interval or predicted direction. Conflicts preserve both the original ML result and the critical review. If the registry/evidence changes during research, the interpretation is withheld and the new ML state is returned.

## Search presentation, privacy and cost

Grounded output is delivered only in its initiating POST response and component memory. It is never written to disk, Redis, React Query, browser storage or a shared per-symbol cache; GET/reload/navigation cannot retrieve it. Changing coins/leaving the report clears it. Original Search Suggestions HTML/CSS is displayed with the report in a sandboxed iframe without scripts or same-origin access; validated Google links open separately. Sources come only from grounding metadata and have `noopener noreferrer`. Publication dates are unknown/null because this metadata does not supply verified dates; retrieval and review times are separately labeled. Unsafe HTML/links or missing suggestions reject the report, without rewriting provider presentation. Original byte spans and source references remain inspectable. See [Google Search guidance](https://ai.google.dev/gemini-api/docs/generate-content/google-search) and [Developer API grounding terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search). Shared result redistribution needs separate authorization and is not implemented.

Provider credentials stay exclusively on the server. Only request hashes, usage counters, cooldowns and bounded diagnostic fields persist. Status/errors never include provider bodies, prompts, evidence, keys, raw exception messages or private headers. Diagnostics contain safe HTTP status, category and elapsed time. API key syntax supports current `AQ.` auth keys and legacy opaque keys; Google determines actual validity and permissions. A successful minimal REST call does not establish Search/structured-output permissions or compatibility.

There is one exclusive paid request across processes sharing the same owned local accounting directory, plus 4 POST attempts/IP/hour and the existing global limit. Defaults reserve at most 8 calls/day and 64/month before contacting Google; duplicate IDs are denied rather than served from cache. Success/failure and unknown usage remain durably counted. HTTP 429 and Retry-After impose cooldowns. Failed/corrupt accounting prevents spending. A crash lock is not stolen: after verifying its recorded host/PID is no longer running, the operator may remove that specific stale lock. Do not reset counters to bypass budgets. Multiple replicas/independent disks require separately designed coordination.

Observed-cost thresholds default to $1/day and $10/month. Standard estimates use $0.30/M input, $2.50/M output including thinking and $0.014/observed Search query, conservatively ignoring the shared free allowance. These are **not hard dollar ceilings**: a request can run multiple searches, there is no documented per-request hard query cap, usage may be unknown and an aborted request can still incur charges. The prompt's three-search request is advisory. Set provider project quotas/billing controls before enabling public paid access. Review [current pricing](https://ai.google.dev/gemini-api/docs/pricing) before operation.

## Configuration and safe local setup

Defaults need no key and make no paid calls. Node reads only the process environment; it does not implicitly load private env files. Copy `backend/.env.example` to an ignored private file if needed, set paths explicitly and run `node --env-file=backend/.env.local --import tsx backend/src/server.ts`. `npm run future:status -w backend` is read-only; use the same environment file when checking a configured instance. There is no paid CLI, background Search job or automatic publication.

| Variable                                                              | Default / purpose                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `FUTURE_GEMINI_SEARCH_ENABLED`                                        | `false`; operator must opt in, then each browser request requires consent |
| `GEMINI_API_KEY` / `GEMINI_KEY_ROTATED`                               | Private fresh credential / `false` acknowledgement; both required         |
| `GEMINI_MODEL`                                                        | `gemini-3.5-flash-lite`; another model stays unverified/disabled          |
| `FUTURE_ML_EXPORT_PATH`                                               | `ml/data/future-forecasts.json`                                           |
| `FUTURE_ML_DATABASE_PATH`                                             | `ml/data/lifecycle.sqlite3`; same registry used by export                 |
| `FUTURE_STORAGE_PATH`                                                 | `backend/.future-data`; counters only, persistent owned local directory   |
| `FUTURE_REVIEW_TTL_SECONDS`                                           | 900; initiating view discards expired review                              |
| `FUTURE_CACHE_TTL_SECONDS` / `FUTURE_STALE_SECONDS`                   | 21600 / 86400; ML publication only, never grounded-result caching         |
| `FUTURE_TIMEOUT_MS`                                                   | 30000; bounded to 60000                                                   |
| `FUTURE_MAX_DAILY_REQUESTS` / `FUTURE_MAX_MONTHLY_REQUESTS`           | 8 / 64                                                                    |
| `FUTURE_MAX_DAILY_ESTIMATED_USD` / `FUTURE_MAX_MONTHLY_ESTIMATED_USD` | 1 / 10; observed spend stop thresholds, not hard provider caps            |

For containers, mount the DB/export read-only at matching configured paths and an owned private accounting directory read-write. Python stays outside the API image. Default Compose mounts none of these and enables no spending/publication. HTTPS, provider billing quotas, source licenses, backups, access controls and clock synchronization remain operator responsibilities.

Standalone GDELT/RSS/News Intelligence routes, source collectors, schemas, scripts, tests and direct XML dependency were removed. Ignored `.news-data`, existing ML datasets/models and historical audit documents were preserved. See [actual verification and readiness](FUTURE_VERIFICATION.md); UI support for an asset is not evidence that its ML model is ready.
