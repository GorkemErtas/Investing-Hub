# Future Analysis verification and readiness

This records the original approved-publication migration. The later feature-branch experimental mode and actual eight-asset results are documented in [experimental verification](EXPERIMENTAL_FORECAST_VERIFICATION.md).

Verified 2026-11-07 on Windows/PowerShell, on `main` after inspecting existing work and fetching `origin/main` (`ec8c030` before this migration). The work continues the existing Python lifecycle and the Gemini SDK compatibility fix. No paid live Gemini request, real-data training, model approval/promotion, forecast publication, scheduler registration, merge or deployment was performed.

## Verification

| Check                                                                     | Result                                                                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                                           | Shared, backend and production Vite build passed                                                                  |
| `npm run typecheck`                                                       | All three workspaces passed                                                                                       |
| `npm test`                                                                | 155 passed: shared 45, backend 106, web 4                                                                         |
| `npm run lint`                                                            | Passed, zero warnings                                                                                             |
| `npm run test:browser`                                                    | 10 passed: six Future Analysis scenarios and four existing dashboard/portfolio/Learning/mobile-outage regressions |
| `.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py' -q` | 45 passed, including eight added calibration/listing/publication tests                                            |
| `npm run check:mobile`                                                    | Passed                                                                                                            |
| `npm run test:mobile`                                                     | 3 passed                                                                                                          |
| `git diff --check`                                                        | Passed                                                                                                            |

Tests use synthetic ML fixtures and mocked provider responses only. The real installed `@google/genai` SDK runs against a stubbed fetch: tests inspect its actual Search/JSON request, one-attempt behavior, HTTP 400/401/403/404/429/500/503 classification, Retry-After, safe timing diagnostics and network/SDK errors. The wire schema projects supported JSON keywords, translates literal constants to singleton enums and leaves full string/temporal/semantic constraints to local validation. The earlier successful minimal REST smoke establishes credential/model access only; it does not demonstrate paid Search plus structured-output behavior. No live success is claimed for this new combination.

Shared/backend tests cover all eight assets, valid/missing/unvalidated ML, approval-policy metrics, unit/price/direction parity, temporal/calibration bounds, registry revocation, stale/expired/tampered exports, exact forecast fingerprint, genuine metadata spans including Unicode byte offsets, missing/invalid sources, contradictions, unsafe suggestions, numeric overrides and recognizable prompt injections. They cover opt-in/default-off gates, durable reservations including failures, UTC daily/monthly rollover across service restarts, observed costs and unknown usage, concurrency, timeout, corruption, private response delivery and ML fallback. Ordinary GETs neither create accounting storage nor call research, and cannot retrieve previous grounded output.

Python tests retain chronological feature isolation, official-source bounds, integrity/atomicity, independent model candidates, artifact parity, prospective reconciliation, promotion and rollback. Added cases verify the shared asset catalog, official evidenced listing boundaries, no-network repeated sync, finite-sample residual quantiles, frozen calibration before later evaluation, insufficient/NaN/negative-bound refusal, all-asset atomic exports, exact database stamps and unchanged evaluation records. A candidate-origin shadow remains immutable and unpublished after promotion; only a later genuine active-origin forecast with eligible evidence can export.

Browser tests verify one coherent report, original ML values during contradictory review, all coin selections, `/research` compatibility, research-only state without direction/interval, explicit paid consent, default-off behavior, outage fallback, source URLs, visible sandboxed Google Search Suggestions, clearing on reload/coin changes and absence of grounded output in browser storage. Desktop and 390px mobile screenshots were inspected from ignored `webapp/test-results`; responsive layouts have no horizontal overflow. A screenshot's synthetic performance/forecast is test evidence only.

## Actual local model readiness

Read-only SQLite inspection at **2026-11-07 11:31 UTC** of the existing default local database returned:

| Asset | Verified stored daily rows | Most recent source close    | Registry / publication readiness                                                                   |
| ----- | -------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| BTC   | 3368                       | 2026-11-05 23:59:59.999 UTC | 12 candidates, zero historical passes, zero interval evidence, 12 pending shadows; no active model |
| ETH   | 3368                       | 2026-11-05 23:59:59.999 UTC | 12 candidates, zero historical passes, zero interval evidence, 12 pending shadows; no active model |
| SOL   | 0                          | None                        | No dataset/model                                                                                   |
| BNB   | 0                          | None                        | No dataset/model                                                                                   |
| XRP   | 0                          | None                        | No dataset/model                                                                                   |
| ADA   | 0                          | None                        | No dataset/model                                                                                   |
| DOGE  | 0                          | None                        | No dataset/model                                                                                   |
| LINK  | 0                          | None                        | No dataset/model                                                                                   |

The earlier integrity audit also verified the BTC/ETH dataset/source/artifact hashes and no interior gaps. Both datasets now need the completed November 6 candle; they are not current publication inputs. No `ml/data/future-forecasts.json` exists. All eight assets are implemented in the product, but **none currently has an eligible published numeric forecast**. Existing candidates were not retrofitted with synthetic interval evidence or approved to make the screen look ready. Ignored datasets, registry, artifacts, historical reports and old `.news-data` were preserved.

## Removal and retained compatibility

Removed standalone `backend/src/news`, its collect/analyze/status/prune scripts and routes, `shared/news.ts`, provisional `shared/hybrid.ts`, old news fixtures/tests, `NewsIntelligence.tsx`, the separate Research page and obsolete News Intelligence operator guide. The unused direct XML parser dependency was removed; npm retains any transitive optional use. Stale generated news/hybrid build outputs were cleared locally. Historical news verification remains archived with a clear link to current documentation.

The report is implemented through `shared/future-analysis.ts`, `ml/calibration.py` / `publication.py`, `backend/src/future`, the consented API route and `webapp/src/pages/FutureAnalysis.tsx`. Existing market, guest portfolio, authentication, private mobile APIs, themes, Learning Hub and legacy disabled prediction response remain compatible. Dashboard links select the corresponding asset. Read-only ML publication is the only cached report input; grounded output is private to the initiating POST/view and never redistributed.

## Operational limits

Paid Search remains disabled by default, with no automatic calls on page load. Current Google Search terms/pricing and Gemini 3 Search plus structured-output preview support were checked against official documentation, linked in [the operator guide](FUTURE_ANALYSIS.md). Live provider output can fail the strict grounding/presentation gate; that yields a safe ML fallback rather than invented research. Source publication dates remain unknown because verified dates are absent from grounding metadata. Structured validation cannot prove source truth or remove all prompt injection.

Request caps, accounting locks, IP limits, cooldowns and observed-cost thresholds are enforced. They do not constitute a hard dollar ceiling: Search may execute multiple queries, metadata may omit usage, and aborted requests may incur charges. Provider project quotas/billing controls and current pricing review are required before an operator enables public paid access. Multiple hosts, a separate licensing agreement for shared grounded-result redistribution, and commercial Binance data rights need independent review. No redistribution cache is implemented.

Docker/native device builds, EAS/store release, live Mongo/SMTP/FCM and live paid Search were not run for this change. The Nginx API timeout was adjusted for the bounded review request; it does not deploy or enable the provider. Follow [setup and limitations](FUTURE_ANALYSIS.md) for explicit publication, server paths, opt-in credentials, source presentation and accounting recovery.
