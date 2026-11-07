# Free news verification

Verification date: **2026-11-06**. Work stays on the existing `main` branch. On **2026-11-07**, the owner requested separate commits and a push. No merge, scheduler registration or deployment is included.

## Change inventory

| Files                                                                                                                                   | Result                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/news/sources.ts`, `evidence.ts`                                                                                            | Keyless GDELT DOC 2.0 ArticleList, fixed reviewed official RSS adapters, metadata-only parsing, publisher/index attribution, distinct publication/index/retrieval times, filtering, deduplication and bounded balanced selection. |
| `backend/src/news/service.ts`, `analysis.ts`, `provider.ts`, `types.ts`, new `requests.ts`                                              | Independent collection and optional model-only analysis, source-only snapshots, provenance-bound structured analysis, per-provider fallback, durable separate budgets and courteous GDELT pacing/cooldowns.                       |
| `backend/src/news/store.ts`                                                                                                             | Bounded version-2 collection/snapshots, persisted source pacing, legacy snapshot invalidation with validated budget preservation; existing checksum, atomic publication and exclusive lock retained.                              |
| `shared/news.ts`, `shared/tests/news.test.ts`                                                                                           | News-only v2 schemas and source-only/unknown publication contract checks.                                                                                                                                                         |
| `backend/tests/news.test.ts`, `backend/package.json`                                                                                    | Deterministic provider/service/API regressions and separate finite collect/analyze/status/prune commands.                                                                                                                         |
| `backend/src/config.ts`, root/backend `.env.example`                                                                                    | Free collection with no source secret, independent AI opt-in, RSS permission gate and bounded operational settings.                                                                                                               |
| Root/backend READMEs, `docs/NEWS_INTELLIGENCE.md`, this file, architecture/deployment/security docs and historical audit/security notes | Current setup, source conditions, keyless Windows workflow, limitations and removal of obsolete paid-source configuration references.                                                                                             |

No dependencies were added and `package-lock.json` is unchanged. The existing pinned XML parser remains necessary for RSS, and the existing pinned Gemini SDK remains necessary for explicit optional analysis. ML code/artifacts, `shared/hybrid.ts`, financial logic, numeric prediction endpoints, web/mobile implementations and backend server scheduling are untouched.

## Deterministic checks

Synthetic, explicitly marked fixtures test realistic ArticleList shapes and official RSS records; they are never a production news fallback. Coverage includes:

- Nullable publication time versus GDELT first-seen time, invalid/missing/future dates and original publisher attribution.
- Empty/index-error/throttling payloads, official BTC/ETH/SEC/Fed parsing and rejection of article bodies, external entities, unsafe links and injection headlines.
- Keyless collection and cached HTTP responses with zero Gemini calls; configured collection also never invokes Gemini.
- Separate optional analysis, evidence/quote validation, high uncertainty, no search/tools or invented numerical forecasts.
- BTC/ETH balancing with skewed inputs and market-wide records counted against both eight-event limits; event deduplication.
- Provider failure fallback, retained evidence, stale/expired behavior, source/Gemini budgets, 429 versus local cooldown, persistent GDELT pacing and timeout handling.
- Checksums, atomic publication failure, mutual exclusion, version-1 invalidation without budget reset and existing API compatibility.

Final checks passed:

| Command                | Result                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run build`        | Shared, backend and production web builds passed.                                                         |
| `npm run typecheck`    | Shared, backend and web type checks passed.                                                               |
| `npm test`             | **140 passed**: 31 shared, 107 backend (62 news + 45 existing), 2 web.                                    |
| `npm run lint`         | Passed.                                                                                                   |
| `npm run test:browser` | **4 passed**: dashboard, portfolio accounting/history, Learning Hub and responsive/provider-outage flows. |
| `npm run check:mobile` | Mobile type check passed.                                                                                 |
| `npm run test:mobile`  | **3 passed**.                                                                                             |

Live source checks are separate from these tests. The final backend/shared selection and cooldown refinements were covered by the final unit/build/type checks; the browser/lint checks had already passed and those refinements do not change web implementation.

Before committing on **2026-11-07**, `npm run build`, `npm run typecheck` and `npm test` were rerun successfully; all **140 tests** passed again.

## Live read-only provider smoke

These were actual HTTP GETs and an actual source-only collection, not mocked network responses. No original article or image URLs were requested. No Gemini key was used and no live model analysis was attempted.

| Source                            | Observed result                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bitcoin Core RSS                  | HTTP 200 `text/xml`, 119 feed items; seven accepted by the collector's fourteen-day/date/relevance rules, 112 rejected.                                                                                                                                                                                                                                                                           |
| Federal Reserve all releases      | Successful collection; one accepted, 19 rejected.                                                                                                                                                                                                                                                                                                                                                 |
| Federal Reserve monetary releases | Successful collection; one accepted, 14 rejected. The overlapping announcement is deduplicated.                                                                                                                                                                                                                                                                                                   |
| SEC press-release RSS             | HTTP 200 `application/rss+xml`; collection parsed 25 items, none passed the crypto/date relevance filter. Reachable does not imply relevant current coverage.                                                                                                                                                                                                                                     |
| Ethereum Foundation Blog          | Old `/feed.xml` returned 301; verified direct `/en/feed.xml` returned 200 XML. The feed declares all rights reserved and site terms restrict automated access. It was inspected for access/terms verification, but excluded from routine collection by the default permission gate.                                                                                                               |
| GDELT Project DOC 2.0             | Direct metadata GET and the collector's first query timed out at the bounded 20-second limit. Subsequent queries in the collector were suppressed by local cooldown. **No successful live ArticleList JSON retrieval was observed.** Parsing, empty responses and rate-limit behavior passed deterministic tests; this does not establish live index availability. No live HTTP 429 was observed. |

The real collection completed with **6 BTCUSDT events and 1 ETHUSDT event**, five source requests and **zero Gemini requests/tokens/cost**. Both cached responses were available, with `analysisStatus=not_configured`, null model/summary and unknown sentiment/impact. ETH's available item was market-wide macro evidence, not independent Ethereum-specific coverage. The model dependency was instrumented to fail if called; it was never called. A subsequent `analyze` reported `not_configured` and made zero model requests.

The final compiled API was also checked through local HTTP against that real stored state: both BTC/ETH routes returned HTTP 200 with the same 6/1 source-only event counts and fresh status. Instrumented source/model call counts remained zero and the state file was byte-for-byte unchanged after both GETs.

The smoke state lives only in ignored `backend/.news-data/free-smoke-2026-11-06`, separate from normal state. Early smoke output used the older generic rate-limit label for suppressed queries; final code explicitly distinguishes local `cooldown` from an actual provider `rate_limited` response. Do not interpret the smoke as a successful GDELT response or as any independent fact-checking.

## Remaining limits

GDELT availability remains a live validation gap. Its failure does not block healthy RSS. Ethereum automated ingestion remains default-off pending suitable permission/terms review, and SEC relevance/access varies. Balanced selection cannot supply absent evidence, and source-only outputs intentionally have no AI conclusions. All accepted content is headline metadata, not verified article content. Fourteen-day RSS windows include infrequent older Core announcements; cache freshness does not mean recent publication.

No private Gemini key was available for live analysis validation. Deterministic SDK request/response, gating, budgets and failure tests passed; they do not establish a particular key's permissions, quota or billing. Local persistence assumes a single host and persistent disk; distributed/ephemeral deployments need a different storage/locking strategy. Public reads never trigger collection or analysis.

## Conventional Commit groups

The owner requested separate commits and a push. The breaking v2 contracts, backend implementation and regression tests stay together so each commit remains executable.

1. `feat(news): add keyless collection and separate optional analysis` — v2 shared contracts, GDELT/reviewed RSS adapters, metadata validation, balanced selection, storage migration, independent collection/analysis, request budgets/pacing, configuration, CLI and shared/backend regression tests.
2. `docs(news): document free source terms and keyless operation` — setup examples, READMEs, architecture/security/deployment notes and live verification results with explicit limitations.
