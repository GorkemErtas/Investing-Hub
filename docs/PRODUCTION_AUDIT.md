# Production engineering audit

Audit date: 2026-11-14. Baseline: `ba78673` (includes Brevo PR #6).
Scope: tracked application, shared contracts, mobile client, Python lifecycle,
deployment and CI source. No production account, credential, environment variable,
database, volume or service was changed or queried. Findings below distinguish
reproduced defects, verified code paths and recommendations requiring measurement.

## Actual architecture and trust boundaries

- React/Vite serves Guest Demo first. Public portfolios/watchlists/preferences use
  existing `ih:*` browser keys. Optional account data and one-hour bearer tokens
  stay in a separate in-memory store with session epochs, expiry and `/me` checks.
  Public TanStack Query caches never contain private account responses.
- Express implements shared Zod contracts. Public market and prediction endpoints
  stay independent of Mongo, Firebase and email. Helmet, exact CORS origins,
  32 KiB JSON limits, per-client limits and sanitized errors are already present.
  Railway proxy mode uses validated `X-Real-IP`; arbitrary forwarding chains do
  not identify a client. Keep the Railway edge as the sole public ingress.
- Optional Mongoose accounts reuse existing `users`, `settings`, `portfolios`
  collections. bcrypt cost 12, HS256 JWT issuer/audience/subject/expiry checks,
  six-digit hashed codes, ten-minute expiry, five attempts and one-minute cooldown
  are retained. Portfolio operations include owner IDs, decimal replay and atomic
  optimistic revision checks. Mongo is not a market-data dependency.
- Brevo uses fixed HTTPS POST, `api-key`, a ten-second abort, status checks and
  redirect rejection. SMTP is selected only without a Brevo key. Provider errors
  become `EMAIL_UNAVAILABLE`; no automatic cross-provider send retries occur.
- Binance uses one eight-pair ticker request, supported 180-candle queries,
  schema validation, four concurrent requests, one transient retry, shared caches,
  bounded stale data and provider-wide 429/418 backoff.
- Python imports only missing completed UTC daily candles from official allowlisted
  Binance archives/REST. It validates hashes, provenance, continuity and exact
  reviewed extremes. Past-only features and purged chronological splits precede
  separate selection/final evaluation. Numeric, checksum-verified artifacts avoid
  executable pickle loading. Daily jobs do not train or select models.
- SQLite uses parameterized queries, primary/unique keys, full synchronization,
  transactions and an OS-released single-writer lock. The backend validates the
  immutable all-eight-coin JSON publication against the database stamp, checksum,
  numeric contract and current UTC day. HTTP does not load models or run Python.
- Railway runs one Docker service/replica/region and `/data` volume. A lightweight
  Python supervisor runs Node continuously and a finite daily child at 00:15 UTC,
  persists one-hour failure backoff, and exits on HTTP failure. Logs retain at
  most 60 files/30 days; successful backups retain seven integrity-checked copies.
  Local Compose is a separate supported deployment. CI exercises JS, Python,
  browser and disposable-volume Docker behavior; it does not deploy.
- Mobile web tokens are memory-only; native uses Expo SecureStore. Mobile has its
  own lockfile and Expo SDK 53 toolchain, separate from production web/API packages.

## Prioritized findings

No Critical defect was verified. Severity reflects the demonstrated issue, not a
claim that production was exploited. Implementation results and checks follow below.

| ID / severity / evidence                                                                                                                                                                                                                                                                                               | Impact and proposed action                                                                                                                                                                                                                                                             | Regression risk / measurement                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 High: mobile dependency advisories. Baseline `npm audit --prefix mobileapp` reports 28 affected packages: 4 high, 23 moderate, 1 low. Expo Router's `build/fork/getPathFromState.js` imports the directly declared `query-string` despite no application imports.                                                   | Retain the required router dependency and apply compatible advisory fixes only. Review remaining Expo/build-tool findings separately; do not force an SDK migration or an incompatible decoder override. The production root and Railway IaC dependency audits report zero advisories. | Moderate for build-tool patches; verify the full Expo web export/browser flows as well as mobile tests, lint and types. Source import searches alone cannot establish whether a native dependency is unused. Native SDK migration requires device/release evaluation. |
| A2 Medium, reproduced defect: `backend/src/mobile/auth.ts` checks pending codes before awaiting bcrypt, then inserts the pending entry. The new concurrent regression failed against baseline: two sends instead of one. In-flight requests also do not reserve the 1,000-entry budget.                                | Reserve an email during hashing/delivery and count distinct pending/in-flight emails against the existing bound. Release on every outcome; preserve known-account responses, rate limits, expiry and provider errors. Reduces duplicate emails and wasted password hashing.            | Low; deterministic concurrent registration, delivery-failure cleanup and verification regressions. Expect one send for simultaneous requests to one email.                                                                                                            |
| A3 Medium, measured repeated work: `backend/src/predictions/service.ts` reads, hashes and validates the full eight-coin file for every symbol request, even unchanged files. Baseline synthetic 2,000-read benchmark: 2,415.43 ms total, p50 0.9023 ms, p95 2.8143 ms (Windows, Node 26.13.0, 4,926-byte publication). | Keep one validated publication in memory, coalesce concurrent reads, and invalidate on publication/database metadata changes. Recheck registry and time-based validity on every request. No public HTTP response caching or model changes.                                             | Medium: cache must fail closed on file replacement, registry changes, corruption and UTC expiry. Measure disk reads and the same synthetic benchmark; no claim about production latency or billing.                                                                   |
| A4 Medium, reproducible by state fixture: `deploy/railway/runtime.py:load_state` accepts nonfinite `nextAttempt`; Python JSON accepts `NaN`/`Infinity`. `should_run` then remains false indefinitely.                                                                                                                  | Reject nonfinite, boolean and negative retry values and malformed success dates. Recover from invalid state using the existing sanitized event/default-state path.                                                                                                                     | Low; isolated scheduler fixtures must prove catch-up and persisted successful/retry state remain intact. No schedule or model changes.                                                                                                                                |
| A5 Medium, verified configuration gap: Mongo pool has `maxPoolSize: 5` and selection/connect limits but no pool-wait or socket timeout. A query's server `maxTimeMS` does not bound waiting for a client connection or an unresponsive socket.                                                                         | Add bounded pool-wait/socket limits. Add opt-in real Mongo repository/API tests against a uniquely named loopback test database, and run them with an ephemeral CI Mongo service.                                                                                                      | Low/moderate; slow legitimate operations may fail sooner. Keep existing 3 s server query budgets and document bounds. Verify persistence, revisions, settings and cross-user isolation without mocking the repository.                                                |
| A6 Medium, verified test gap: existing HTTP tests instantiate Express directly; Docker smoke exists but routine JS tests do not execute server startup/configuration failure/shutdown.                                                                                                                                 | Add process-level startup/health/configuration failure tests, including unreachable Mongo. Exercise SIGTERM on Linux where Node supports graceful signal delivery.                                                                                                                     | Low; child processes use isolated environment/ports and never production settings. Distinguish Windows forced cleanup from Linux graceful shutdown.                                                                                                                   |
| A7 Medium, verified resource cleanup gap: `backend/src/market/provider.ts` throws/retries non-2xx responses without consuming or cancelling their streams.                                                                                                                                                             | Cancel error bodies before retry/backoff so connection resources are released, preserving status handling and request budgets. [Undici's guidance](https://github.com/nodejs/undici/blob/main/README.md#garbage-collection) explicitly requires consumption or cancellation.           | Low; HTTP 400/403/418/429/500/503 tests verify discarded bodies and one/two-attempt bounds. No provider payload logging is added.                                                                                                                                     |
| R1 Medium, recommendation: case-insensitive anchored regex lookup in `mongo.ts:findUser` does not benefit from a plain email index as exact normalized equality would. Settings owner index is not unique; concurrent initial upserts may duplicate rows.                                                              | Inspect `explain` and actual index/data shape in an approved maintenance environment. A normalized unique field or unique owner index needs duplicate/case review before any migration.                                                                                                | Data compatibility risk: document, do not automatically modify production indexes/data or email identity semantics.                                                                                                                                                   |
| R2 Medium, residual security boundary: registration responses are non-enumerating, but existing-account, cooldown and provider timing are distinguishable. Per-client limits and pending bounds do not constitute a global bcrypt admission policy.                                                                    | Keep generic responses and current limits. Measure distributed abuse and timing in staging before changing admission policy or delivery architecture.                                                                                                                                  | Blanket timing delays/hash work can amplify denial of service; queues/new storage would change semantics and cost. No speculative implementation.                                                                                                                     |
| R3 Low, storage planning: immutable datasets, forecasts, events and performance history grow; seven full backups multiply storage. Current backup/log counts are bounded; underlying ledger growth is intentional.                                                                                                     | Monitor SQLite page counts and backup sizes, verify disk headroom before daily runs and test an off-volume restore. Propose archival only from observed growth.                                                                                                                        | Automatic history deletion/vacuum/retraining is excluded. No production storage measurements or cost savings are claimed.                                                                                                                                             |
| R4 Low, portfolio-scale performance: all account portfolios/ledgers are returned together; no user portfolio-count cap/pagination exists. Transactions per ledger are bounded to 5,000.                                                                                                                                | Measure representative user payloads before proposing pagination or policy changes.                                                                                                                                                                                                    | Existing API/data compatibility makes truncation or new account limits inappropriate without review.                                                                                                                                                                  |
| R5 Low, observability: health is deliberately process liveness; account readiness is `/api/capabilities`, and prediction freshness is per prediction response. Backups are on the same disk and failure waits until the next daily success.                                                                            | Document which signals to inspect and restore/backup procedures. Recommend independent backup storage and backup alerting for review; do not add paid monitoring automatically.                                                                                                        | No readiness outage should remove Guest Demo. External monitoring/storage requires an approved budget/configuration.                                                                                                                                                  |
| R6 Low, potential optimization: `pipeline.py` imports training modules, and `lstm.py` imports Torch even for non-training commands. This affects finite CLI startup/peak memory, not the idle supervisor.                                                                                                              | Profile import time and selected-model requirements before splitting numerical inference/training imports. Retain the CPU dependency needed by existing LSTM workflows.                                                                                                                | No measured production RAM saving is claimed. Avoid changing artifact/code identity or model behavior solely to reduce image size.                                                                                                                                    |

## Session decision

Retain browser memory-only JWTs. A public portfolio demonstration does not require
refresh-persistent login. The existing one-hour token, explicit login after refresh,
session epochs, `/me` bootstrap, expiry and 401 handling are appropriate and avoid
creating long-lived browser credentials. XSS remains a bearer-token threat; CSP and
safe rendering still matter. Logout discards local state; it cannot revoke copied
tokens server-side. Do not imply server revocation exists.

An HttpOnly cookie/BFF design is a separate review: it needs Secure and explicit
SameSite policy, CSRF protection for every mutation, origin checks, rotation/expiry,
server logout/revocation, mobile compatibility and migration tests. No persistent
localStorage tokens or cookie/session redesign is introduced here.

## Verification and measurements

Baseline Python: 57 tests passed in 58.231 s with synthetic datasets and temporary
SQLite files; test-owned models only were trained by the existing test suite.
Production models/data were not loaded, trained or changed. Root npm audit: 0.
Docker CLI is installed, but its Linux engine is unavailable; container builds,
image-size measurements and local Mongo integration require a running engine.
`pip-audit` is not installed; Python dependency vulnerability scanning is unverified.

Verified changes: A2, A3, A4, A5 (bounded connection options), A6 and A7 are implemented
with targeted regressions. The A2 test reproduced duplicate sends before the fix;
the A4 test reproduced eight accepted invalid-state cases before the fix. A5's real
Mongo integration uses only an explicit loopback port and a fresh UUID database,
with guarded cleanup; CI provides a temporary Mongo 8.0 service. It never accepts
an arbitrary URI or reuses `MONGO_URI`. Pool-wait is now bounded to 3 s and socket
inactivity to 5 s, alongside the existing connection/query limits; these are not a
single whole-operation deadline. See [driver timeout semantics](https://www.mongodb.com/docs/drivers/node/v6.x/connect/connection-options/).

A1 applies only compatible lockfile patches: brace-expansion 1.1.11 → 1.1.22 and
node-forge 1.4.2 → 1.4.3. The final mobile report is 26 affected packages (3 high,
22 moderate, 1 low), down from 28 (4 high, 23 moderate, 1 low). Remaining high
entries are decode-uri-component/query-string and image-size. The required
query-string declaration and SDK versions remain unchanged. No blanket force
upgrade or incompatible override was applied. Android/iOS release/device checks
were not run; mobile web export is an additional regression check, not a substitute.

| Local check                                                                        | Result                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                         | 169 passed: shared 46, backend 111, web 12. Two backend cases skipped locally: real Mongo (no engine/server) and graceful SIGTERM (Linux-only); CI enables both.                                  |
| `npm run typecheck`, `npm run check:mobile`, `npm --prefix .railway run typecheck` | Passed.                                                                                                                                                                                           |
| `npm run lint`, `npm --prefix mobileapp run lint`                                  | Passed.                                                                                                                                                                                           |
| `npm run test:mobile`                                                              | 7 passed with the final compatible dependency patches; mobile typecheck and lint also passed again.                                                                                               |
| `npm --prefix mobileapp run test:browser`                                          | Expo web export succeeded and 2 browser tests passed. CI now includes this check to exercise implicit router dependencies. Native builds/devices remain unverified.                               |
| `npm run test:browser`                                                             | 20 passed, including Guest Demo, account isolation, expiry and outage behavior.                                                                                                                   |
| Python full suite                                                                  | 58 passed in 58.072 s; expected negative-case logs accompany passing tests.                                                                                                                       |
| `npm run build`                                                                    | Passed, 15.823 s observed wall time including TypeScript and Vite, while another export was running; no speedup claim. Existing 500 kB chunk warning remains.                                     |
| `docker compose config --quiet`                                                    | Passed. Actual container build/smoke/image scanning require the unavailable local engine or CI.                                                                                                   |
| Tracked-file secret pattern scan                                                   | No private-key blocks, long Brevo-key literals or credential-bearing Mongo URI matches. This limited pattern check is not a full history/secret audit and does not revoke historical credentials. |

### Reproducible performance results and limits

`node --import tsx backend/scripts/benchmark-predictions.ts sample` creates and
removes its own synthetic temporary files. It uses a fixed current fixture clock,
40 warmups and 2,000 sequential reads across eight symbols. It performs real disk
metadata/read operations but no HTTP, database queries, network or model loading.

| Same host / fixture              |                 Before |                                                   After |
| -------------------------------- | ---------------------: | ------------------------------------------------------: |
| Reader total, 2,000 reads        |            2,415.43 ms |                                               335.31 ms |
| Reader p50 / p95                 |     0.9023 / 2.8143 ms |                                      0.1192 / 0.3389 ms |
| Unchanged publication file reads | One per symbol request | One shared cold read, zero warm reads (regression test) |
| Observed process RSS             |             103.99 MiB |                                               79.03 MiB |

This is a single-run synthetic comparison: approximately 86.1% less elapsed reader
time, not a production HTTP latency, sustained-memory, ML-accuracy or billing
guarantee. RSS varies with GC/runtime timing; do not infer a stable memory saving.
The cache retains at most one validated publication and one pending load, keyed by
file/database device, inode, size and nanosecond timestamps. Each request still
checks database identity and clock validity; returned records are copied.

Frontend source/bundles are unchanged: entry `index-Phm8YlRW.js` is 540,652 bytes
(173.24 kB gzip in Vite output), with existing lazy page/chart chunks. Splitting
additional code without profiling is deferred. An unchanged bundle is not a
claimed frontend performance improvement.

Other measurements require an isolated representative deployment:

- Docker image/build: on a host with an engine, time `docker build -t investing-hub-audit .`
  and inspect `docker image inspect investing-hub-audit --format '{{.Size}}'`.
  Run the existing disposable-volume smoke harness against its expected test tag.
  No production volumes or image pruning are part of this procedure.
- Startup/HTTP latency/RAM: use the built server in an isolated environment with
  known fixtures, time process launch to first successful health response, sample
  process RSS and p50/p95 latency for health/cached markets/predictions separately.
  Keep provider state, request count, Node version and concurrency identical.
  The process tests exercise startup behavior, not production latency benchmarking.
- ML duration/peak RAM: copy an approved backup to a test-only disk, disable every
  scheduler for that copy, and measure one explicit `daily` invocation with the
  same input/model registry. Existing tests use synthetic models; do not run a
  production daily job or retrain merely to collect a benchmark.
- SQLite growth: record read-only `PRAGMA page_count`, `page_size`, `freelist_count`,
  table row counts and total backup/log bytes on the isolated copy over successive
  days. Plan headroom for the live DB plus seven full copies and atomic temporary
  files. Do not delete immutable history or run production VACUUM for this audit.
- Python advisory scan: use a separate temporary tooling environment with
  `pip-audit -r ml/requirements.txt`, including the CPU Torch index, and record
  unresolved package/index results. No scanner was installed in the ML environment.

## Manual action and rollback

No production configuration or data migration is required for the selected fixes.
Retain existing secrets, volume paths, replica count, schedule and model registry.
Merge/deploy only after review. Roll back the code/image to the prior release;
there is no destructive schema change to reverse. Never restore a database merely
to roll back these code changes. Follow `RAILWAY.md` for any separate volume restore.

For remaining dependency SDK work, email timing, indexes, pagination, backup storage
and capacity changes, obtain the separate evaluation/configuration/budget approval
described above. Previous secret exposure in removed legacy history still needs
owner review/rotation per `SECURITY.md`; this audit does not inspect or print secrets.
