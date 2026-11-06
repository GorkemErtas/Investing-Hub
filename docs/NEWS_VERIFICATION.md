# News intelligence implementation and verification

Date: 2026-11-06. Environment: Windows/PowerShell, Node 26.13.0, npm 11.20.0. The current `main` commit was checked against remote `main` at the start; no other branch was inspected. Initial implementation and verification left the changes unstaged. Separate commits and push follow the repository owner's subsequent explicit request. No merge, deployment or scheduled-job registration was performed.

The user's accepted scope is **CryptoPanic API + permitted official RSS, with Gemini used only for analysis**. Google Search Grounding is absent. The previous ML lifecycle, prediction endpoint, web/mobile implementation, shared accounting and existing hybrid schema remain unchanged.

## Decisions and implementation

- Keep the existing TypeScript/Express backend. A finite worker collects fixed public sources; public GETs read a validated local snapshot and cannot trigger providers or training.
- Use CryptoPanic's documented v2 public mode, actual plan, BTC/ETH filter and one page; do not follow pagination URLs or request full article content. The optional token is confined to the outbound request.
- Use the official Federal Reserve all-press and monetary-policy RSS endpoints. Its Board-information reuse/attribution terms were checked. CFTC RSS was excluded because its official page says feeds are temporarily disabled.
- Validate API/RSS publication metadata, not model-authored dates/links. Reject missing/future/stale/invalid dates, source-domain inconsistencies, unsafe links, social posts and detectable injection. Record source-response hashes and separate publication/observation times. Deduplicate normalized URLs/content and syndicated headlines/excerpts.
- Use pinned official `@google/genai@3.0.0`, default `gemini-3.5-flash-lite`, bounded tools-free structured analysis. Model IDs and provider format were researched against current official docs and compiled SDK types. No Search, URL Context, tools, generated URLs, prices, probabilities or invented prose enter the public result. Exact quote/source/scope checks follow schema validation; provider metadata is not factual proof.
- Store only the latest pair of snapshots, short source excerpts/metadata, counters and sanitized diagnostics in bounded local JSON. Sync/rename publishes both snapshots atomically; checksums detect accidental corruption. Durable per-attempt budgets, cooldowns and an exclusive cross-process lock constrain cost and races. Expired retention data is hidden on read and physically removed by finite pruning.
- Use an additive focused shared news contract. Future hybrid composition remains separate from numeric ML inference and its approval rules.

## Changed files

Added:

- `backend/src/news/types.ts`: evidence and strict analysis types, hashes and sanitized error codes.
- `backend/src/news/sources.ts`: exact API/RSS destination allowlist, bounded HTTP, safe display URLs and rate-limit behavior.
- `backend/src/news/evidence.ts`: CryptoPanic/RSS parsing, provenance/date checks, injection rejection and deduplication.
- `backend/src/news/provider.ts`: isolated official Gemini SDK adapter and sanitized error classification.
- `backend/src/news/analysis.ts`: exact-quote, source/symbol/status checks and source-derived events/outlook.
- `backend/src/news/store.ts`: bounded/checksummed state, atomic file publication and exclusive refresh lock.
- `backend/src/news/service.ts`: cache reads, finite refresh/prune, separate durable source/Gemini budgets, retained UTC-day usage and cost estimates.
- `backend/src/news/cli.ts`: `refresh`, `status`, `prune`, sanitized output and exit codes.
- `backend/tests/news.test.ts`: 62 deterministic source/security/cache/provider/API/CLI tests.
- `shared/news.ts`, `shared/tests/news.test.ts`: focused shared contracts and four tests.
- `docs/NEWS_INTELLIGENCE.md`, `docs/NEWS_VERIFICATION.md`: setup, architecture, sources/terms, operations, limitations and actual verification.

Modified:

- `backend/src/app.ts`: additive read-only `/api/news/insights/:symbol` route and reader injection; existing policies and routes preserved.
- `backend/src/config.ts`: validated private credentials, model, source plan, TTL, budgets, timeout, retention, storage and new-key acknowledgement.
- `backend/package.json`, `package-lock.json`: pinned SDK/XML parser and news scripts. No mobile lockfile or Python dependency changes.
- `shared/package.json`: additive `./news` export; hybrid/financial exports remain intact.
- `.gitignore`, `.dockerignore`: exclude runtime news cache from Git and build context.
- `.env.example`, `backend/.env.example`: disabled defaults and safe configuration references, no credentials.
- Root/backend README, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`: new module boundary, private setup, persistence and operational requirements.

No tracked files were removed. No `ml/`, web/mobile implementation, original shared financial implementation, `shared/hybrid.ts` or ML prediction-service change was required.

## Commands and configuration

From the repository root after building shared/backend:

```powershell
npm run news:refresh -w backend
npm run news:status -w backend
npm run news:prune -w backend
```

Compiled equivalents: `node backend/dist/news/cli.js refresh|status|prune`. `GET /api/news/insights/BTCUSDT` and `/ETHUSDT` return explicit unavailable/fresh/stale/insufficient states. Refresh is not an HTTP operation.

Key variables are `NEWS_INTELLIGENCE_ENABLED`, `GEMINI_API_KEY`, `GEMINI_KEY_ROTATED`, `GEMINI_MODEL`, optional `CRYPTOPANIC_API_KEY`, `CRYPTOPANIC_PLAN`, `NEWS_CACHE_TTL_SECONDS`, `NEWS_MAX_DAILY_REQUESTS`, `NEWS_MAX_DAILY_SOURCE_REQUESTS`, `NEWS_PROVIDER_TIMEOUT_MS`, `NEWS_RETENTION_HOURS`, and `NEWS_STORAGE_PATH`. Defaults and Windows private-key instructions are in [the operator guide](NEWS_INTELLIGENCE.md).

## Actual test results

| Executed command/check | Actual result |
| --- | --- |
| `npm run build` | Passed shared/backend/web production build; final backend refinements also compiled successfully with `npm run build -w backend` |
| `npm run typecheck` | Passed shared/backend/web; final backend refinements separately typechecked successfully |
| `npm test` | **140 passed**: shared **31**, backend **107**, web **2** |
| `npm run lint` | Passed existing web lint |
| `npm run test:browser` | **4 passed**, including disabled forecasts and provider-outage behavior |
| `npm --prefix mobileapp run typecheck` | Passed |
| `npm --prefix mobileapp test` | **3 passed** |
| `node backend/dist/news/cli.js status` | Passed; availability `disabled`, zero provider attempts, no snapshots |
| `node backend/dist/news/cli.js refresh` with default config | Correctly returned sanitized `DISABLED`, exit **1**, without provider calls |
| Live official RSS metadata smoke | Both fixed feeds returned valid XML and were parsed successfully; **no Gemini call** |
| Dependency install/audit report | **0 known vulnerabilities** in the root workspace dependency audit at install time |
| `git diff --check` | Passed; no whitespace errors |

New deterministic tests cover genuine API/RSS links, absent/fabricated citations/URLs, original-domain validation, missing/future/old/invalid timestamps, publication vs observation, duplicate/syndicated records, XML external entities, unsupported sources/social posts, bounded bodies, unsafe URLs, exact evidence quotes, strict labels/extra numeric fields, scope/coin isolation, primary-vs-opinion uncertainty, injection attempts, provider timeout/transient/quota behavior, separate durable budgets, UTC rollover/usage history, unchanged-evidence analysis reuse, cache miss/hit/expiry, stale preservation during partial outage, retention/prune, atomic write failures, checksum corruption, cross-instance refresh prevention, disabled setup, HTTP/CLI secret isolation and preservation of existing APIs. All Gemini/CryptoPanic responses in automated tests are explicitly synthetic fixtures, never actual market news.

## Integration status and limits

The only live data-source test used the public Federal Reserve feeds. At the smoke-test time, all-press contained **1 accepted recent record and 19 excluded records**; monetary-policy contained **0 accepted recent records and 15 excluded records**. Exclusion uses the configured parser's date/content rules and the fixed 72-hour evidence window. No live sentiment or market conclusion was generated or persisted from these observations.

No valid private `GEMINI_API_KEY` or `CRYPTOPANIC_API_KEY` was present in the process environment. Therefore **live Gemini and authenticated CryptoPanic integration remain untested**. Their adapters were checked against current official documentation, SDK types and deterministic tests; no successful private-provider call is invented. Legacy exposed keys were neither read nor reused. No real source snapshot was populated with mock news.

Windows sandbox restrictions initially prevented Vite/esbuild/tsx process spawning (`EPERM`). The full build/tests/browser suite passed outside that restriction. Compiled CLI commands also ran directly without the tsx subprocess requirement. Early test runs caught an out-of-date shared build and a shared mock-fixture mutation; rebuilding shared and isolating mock implementations resolved those failures. These initial failed runs are not counted as passing evidence.

The ML Python suite was not rerun because neither the validated ML implementation/config/data nor Python dependencies changed. Existing browser/mobile and API regressions passed. No Docker deployment, container persistence trial, native device build or scheduler activation was performed.

Before production, issue private keys, select/review the actual CryptoPanic plan and linked-content rights, perform real provider smoke tests, review representative classifications and false-positive/negative behavior, configure persistent local storage/ownership, spending limits, retention-aware backups, finite refresh/prune timers and exit alerts. Crash lock recovery requires confirming the recorded process has stopped; no automatic lock stealing or distributed coordination is claimed. Ephemeral storage resets request budgets as well as the cache. Source provenance is not fact-checking, sentiment is not a forecast, and coverage is selective.

## Suggested Conventional Commit groups

The implementation was initially delivered unstaged. The owner subsequently requested separate commits and push. Review groups, in dependency order:

1. `feat(shared): add source-supported news insight contracts` — shared schema/export and tests.
2. `feat(news): add CryptoPanic RSS and cached Gemini insights` — source transport, evidence validation/deduplication, SDK adapter, constrained analysis, persistence, orchestration, CLI, config/API wiring, runtime exclusions and complete backend tests/dependencies.
3. `docs(news): document private setup source terms and verification` — configuration examples, README/architecture/security/deployment and verification documents.

The dependent backend implementation and its tests stay together so intermediate commits remain executable. Commit and push operations follow the owner's explicit request; no deployment or scheduled job is enabled.
