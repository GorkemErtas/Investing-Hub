# News Intelligence and Research Lab verification

> Archived implementation record. Standalone News Intelligence was retired by [Future Analysis](FUTURE_ANALYSIS.md). The commands, routes and tests below describe earlier versions; use [current verification](FUTURE_VERIFICATION.md).

The Research Lab implementation record below predates the separate Gemini SDK investigation at the end of this document. That investigation was initially delivered unstaged and made no live Gemini requests. The owner subsequently requested commits and a push.

Implementation follow-up: **2026-11-07**, on the existing `main` branch. The implementation was initially delivered unstaged. The owner subsequently requested separate commits and a push. No merge, history rewrite, deployment or scheduler registration is included.

## Audit and resulting behavior

The initial audit covered `backend/src/news/`, `shared/news.ts`, Research Lab, the React Query client, existing UI/styles/tests and the previous verification record. Collection/optional analysis were already independent and public reads were already cache-only. Missing pieces were web integration, useful source diagnostics, Ethereum-specific fallback and Research wording that incorrectly suggested an untouched historical test.

| Changed files                                                                                      | Result                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/news.ts`, `shared/tests/news.test.ts`                                                      | Additive v2 Lighthouse provider and nullable HTTP/duration diagnostics; compatible defaults for older v2 cache records; stronger display-link validation and regressions.                                                                                                          |
| `backend/src/news/sources.ts`, `evidence.ts`                                                       | Fixed public Lighthouse releases endpoint, stable-release metadata validation and attribution; separate empty/filtered/invalid results; transport HTTP status and elapsed time.                                                                                                    |
| `backend/src/news/requests.ts`, `service.ts`, `store.ts`, `types.ts`                               | One-attempt GDELT/GitHub requests, persistent cooldowns, sanitized failure reasons and latest source checks that survive total outage without extending headline freshness.                                                                                                        |
| `backend/src/config.ts`, `backend/.env.example`                                                    | Independent Lighthouse toggle and bounded 30-day release window; Foundation RSS stays disabled.                                                                                                                                                                                    |
| `backend/tests/news.test.ts`                                                                       | Source metadata, diagnostics, slow/rate-limited/invalid responses, independent fallback, both read-only assets, disabled AI and cache-state regressions. Existing balanced BTC/ETH tests remain.                                                                                   |
| `webapp/src/lib/api.ts`, new `components/NewsIntelligence.tsx`, `pages/Research.tsx`, `index.css`  | Shared-schema React Query reads, BTC/ETH selection, headline/source/date/freshness/coverage UI and explicit stale/unavailable/insufficient states. Disabled AI adds no classifications. Research describes historical development/selection and prospective validation accurately. |
| New `webapp/tests/news-fixtures.ts`, `news.test.ts`, `news.spec.ts`                                | Synthetic-only API/unit/browser scenarios for both coins, timestamp semantics, safe links, optional AI, outages, keyboard/mobile behavior and no browser provider/model requests.                                                                                                  |
| Root/backend/web READMEs, `NEWS_INTELLIGENCE.md`, this file, architecture/deployment/security docs | Current Windows operation, source terms, cache/UI behavior, actual results, limitations and future hybrid steps.                                                                                                                                                                   |

No dependency or lockfile changes were needed. ML code/data/artifacts, `shared/hybrid.ts`, financial/accounting logic, market API, mobile code, disabled prediction endpoint and backend scheduling are unchanged. Tests still exercise market/portfolio flows. Public GETs and the UI cannot collect news, call Gemini or train/promote models.

## Source investigation and real read-only checks

The [official DOC 2.0 documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) confirms the existing HTTPS endpoint and `query`, `mode=artlist`, `format=json`, `maxrecords`, `timespan` and `sort` parameters. The production BTC query was tested once, with a 20-second deadline, redirects rejected and a 1 MiB response bound. No alternative endpoint, geography bypass, proxy or aggressive retry was introduced.

| Actual request on 2026-11-07                     | HTTP result   | Measured elapsed time | Observed outcome                                                                                          |
| ------------------------------------------------ | ------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| GDELT production BTC ArticleList query           | **429**       | **7,654 ms**          | Rate-limited response, 444 bytes. No successful ArticleList retrieval. No further GDELT request was sent. |
| Lighthouse public releases API, initial probe    | **200**       | **588 ms**            | Ten release records returned as JSON; no authentication.                                                  |
| Lighthouse API, subsequent end-to-end collection | **200**       | **631 ms**            | Three stable releases accepted; seven prerelease/old records excluded.                                    |
| Bitcoin Core RSS, end-to-end collection          | **200**       | **2,069 ms**          | Seven accepted, 112 excluded before deduplication/selection.                                              |
| Federal Reserve all releases                     | **200**       | **123 ms**            | One accepted, 19 excluded.                                                                                |
| Federal Reserve monetary policy releases         | **200**       | **24 ms**             | One accepted, 14 excluded; overlapping announcement deduplicated.                                         |
| SEC press-release RSS                            | **200**       | **97 ms**             | No accepted crypto/date-relevant records; 25 excluded. Reachability is distinct from useful coverage.     |
| Ethereum Foundation RSS                          | Not requested | Not applicable        | Remains disabled pending appropriate automated-access permission.                                         |

The prior **2026-11-06** record reported a bounded GDELT timeout. This run observed an actual HTTP rate limit instead. Neither result establishes the underlying network/geographic cause or successful GDELT availability. A local one-hour GDELT cooldown was seeded in the isolated smoke state after the observed 429, so the later collector reported all three GDELT checks as **local cooldown**, without making another request. The initial probe and five subsequent real collection requests are separate checks; the collector's persisted source counter is five, not a claim that only five HTTP requests occurred across both phases.

[Lighthouse's official repository](https://github.com/sigp/lighthouse), its [Apache 2.0 license](https://github.com/sigp/lighthouse/blob/stable/LICENSE), [public-release API documentation](https://docs.github.com/en/rest/releases/releases#list-releases), [API terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms), [information-use policy](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#7-information-usage-restrictions) and [unauthenticated rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) were reviewed. The bounded use is short, non-personal release metadata with original attribution, not republication of release bodies, assets or software. Full source-policy details are in [the operator guide](NEWS_INTELLIGENCE.md).

## Real cache, API and browser outcomes

The real source-only collection produced **6 BTC events** (five coin-specific plus one macro event) and **4 ETH events** (three Lighthouse releases plus one macro event). The ETH-specific items were stable releases published **2026-10-19, 2026-10-22 and 2026-10-23**, retained under an explicit 30-day software-release window. They are not presented as newly published market stories. RSS retains its fourteen-day window; GDELT uses 72 hours.

Both compiled API routes returned HTTP 200, `available`, fresh cache and `analysisStatus=not_configured`, with null AI model/summary and unknown sentiment/impact. Source and model dependencies were instrumented: both GETs made **zero source/model calls**, and stored state remained byte-for-byte unchanged. Repeated collection returned `cache_hit`; explicit `analyze` returned `not_configured` with zero Gemini requests/tokens/cost.

The actual React page was then connected through a temporary local Vite proxy to that real compiled API and cache, without mocking news responses. Desktop BTC displayed six events and mobile ETH displayed four. Dark desktop and light 390-pixel-wide mobile views were inspected; no horizontal overflow occurred. Browser reads made zero source/model calls and did not change state. The unrelated market ticker was isolated during this visual smoke; actual market/portfolio behavior was covered by the unchanged browser regressions.

Smoke scripts, provider probe output, private local state and screenshots live only in ignored `backend/.news-data/research-smoke-2026-11-07/`; production snapshot persistence still retains metadata only. Temporary QA API/Vite/browser processes were closed. No persistent server, scheduled worker or deployment was installed.

## Checks actually executed in this follow-up

These results were executed for this change, rather than copied from the earlier 140-test report.

| Command                                 | Actual final result                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run build`                         | Passed shared, backend and production web build.                                                         |
| `npm run typecheck`                     | Passed shared, backend and web.                                                                          |
| `npm test`                              | **167 passed**: shared **39**, backend **115**, web **13**.                                              |
| `npm run lint`                          | Passed with zero warnings.                                                                               |
| `npm run test:browser`                  | **15 passed**: 11 news scenarios plus 4 retained dashboard/portfolio/Learning/mobile-outage regressions. |
| `npm run check:mobile`                  | Passed; mobile implementation unchanged.                                                                 |
| `npm run test:mobile`                   | **3 passed**.                                                                                            |
| Real collection + compiled HTTP smoke   | Passed; BTC 6 / ETH 4, zero model calls and byte-identical state after GETs.                             |
| Real-cache React visual/isolation smoke | Passed; desktop/mobile rendering, no overflow, zero source/model calls or state writes.                  |

The first browser run passed 14/15: its provider-monitor regex incorrectly counted Google Fonts as Gemini. The corrected monitor targets actual model/source hosts and the complete final suite passed. The separate initial visual harness used an incorrect relative Vite root; correcting that local harness path produced the successful real-cache result above. Neither initial harness failure is counted as passing evidence. Windows sandbox child-process restrictions required the authorized local test commands to run outside that restriction.

No live Gemini test, ML Python rerun, Docker/native-device build or deployment was performed. Deterministic model fixtures test validation/gating only and are never production fallback news.

`git diff --check` also passed. Before the owner's subsequent commit/push request, the index was empty and `HEAD` was at the pre-task `c1d2f8a` commit on `main`.

## Remaining limits and next work

- GDELT still has no successful live ArticleList retrieval in this work; healthy RSS/releases remain independent. The new diagnostics distinguish timeout, actual HTTP limit, local suppression, no matches, filtered records and invalid input.
- Lighthouse adds narrow Ethereum software-release coverage, not broad or comprehensive ETH reporting. Foundation RSS stays off, SEC can be irrelevant/unavailable, and source freshness does not establish article recency or factual truth.
- Gemini remains disabled and untested with a live private key. There is no price target, public forecast, automatic training/promotion or hybrid inference.
- Local storage/locking assumes one host with persistent owned disk. The isolated ignored smoke directory is QA state, not a production deployment.
- Future hybrid work must preserve observation-time provenance, freeze candidates, compare with ML-only/no-change baselines using real prospective outcomes and keep approval/publication explicit. Inspected 2026 history is development evidence, not an untouched test.

## Conventional Commit groups

Following the owner's explicit commit/push request, related contracts, implementation and regression tests are grouped together. Documentation and configuration examples form a separate commit.

1. `feat(news): improve source diagnostics and add official Ethereum releases` — shared v2 additions, backend collection/storage/config and their shared/backend regressions together.
2. `feat(web): integrate cached news into Research Lab` — React Query client, news UI/styles, accurate Research content and web unit/browser regressions.
3. `docs(news): record keyless workflow and live Research Lab verification` — configuration example, READMEs, operator/source-policy guide, architecture/security/deployment notes and this evidence record.

## Gemini SDK investigation — 2026-11-07

The owner reported successful official REST model metadata (HTTP 200) and `generateContent` (HTTP 200, one output token). Those live results were supplied by the owner, not executed again in this task. No private credential, provider response or real cached evidence was inspected. The starting tree already contained a local `AQ.` validation fix in `backend/src/config.ts`; it was preserved and extended to bounded opaque auth/legacy syntax.

Audited `provider.ts`, `requests.ts`, `service.ts`, `cli.ts`, `config.ts`, the strict analysis/state contracts and the installed **@google/genai 3.0.0** source. An offline test through the real SDK confirms its unconfigured `generateContent` route is **v1**; a second confirms the adapter now uses the explicit official **v1beta** route with the original configured model and unchanged key header, despite ambient SDK routing variables. No SDK/dependency/model upgrade or alternative model was used.

The previous request transmitted raw `z.toJSONSchema(analysisSchema)` output, including `$schema` and string pattern/length constraints absent from Google's documented JSON-schema subset. The adapter now projects only the supported constraints used by this schema, preserving full strict Zod/evidence validation after generation. The former failure handler discarded HTTP status and all useful context. Version/schema/options mismatch is a **probable request-compatibility cause**, not a proven historical HTTP 400: unsupported schema keywords can be ignored, and the old `PROVIDER` code alone cannot distinguish a request rejection from authentication, access, resource, network or server failures.

Changed files: `backend/src/config.ts`, `news/provider.ts`, `news/requests.ts`, `news/service.ts`, `news/cli.ts`, `news/types.ts`, `news/store.ts`, new `backend/tests/gemini.test.ts`, and the news operator/verification guides. Error output and latest-attempt persistence contain only HTTP status, an allowlisted category, elapsed milliseconds and (in state/status only) attempt time. No raw exception, message, headers, prompt, evidence or key is copied into diagnostics. Old v2 files remain readable with null diagnostics and unchanged usage. Existing source-only reads, snapshots, budgets, quota cooldowns and bounded retry ownership are preserved.

Tests use synthetic keys/content and fully mocked HTTP, including the actual installed SDK serialization and typed API error path. They cover 400, 401, 403, 404, 429, 500/502/503, malformed error JSON, pre-HTTP SDK failures, transport/timeouts, safe key formats, strict output rejection, CLI redaction, old cache compatibility, durable reservations/cooldowns, and valid constrained analysis. The model/source network is never used. The final malformed-5xx refinement preserves bounded retries even if SDK error parsing fails.

Checks executed for this follow-up: root `npm run build`, `npm run typecheck`, `npm test` (**202 passed**: 39 shared, 150 backend, 13 web) and `npm run lint` passed. After the final malformed-5xx refinement, backend build/typecheck/tests were rerun; final backend results are recorded below. Browser/mobile suites were not rerun because this follow-up changes backend analysis only; their earlier results above remain historical. No collection/analyze command was run against real providers or private state, and no Git mutation or deployment was performed.

Final backend verification: `npm run build -w backend`, `npm run typecheck -w backend` and `npm run test -w backend` passed, with **151 backend tests**, including **36 new Gemini cases**. Shared/web implementations are unchanged by that final refinement. `git diff --check` passed. Before the owner's subsequent commit/push request, the index was empty and `HEAD` was at `d7409df` on `main`.

After review, the owner requested commits and a push, and made that the default for future completed tasks in this repository. `AGENTS.md` records this workflow, with explicit task-specific instructions taking precedence. No live Gemini test or deployment is implied by committing the fix.
