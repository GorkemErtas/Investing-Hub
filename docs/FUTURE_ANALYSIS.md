# Future Analysis: architecture and operation

One report combines a next UTC daily close ML estimate with an optional Gemini interpretation of that exact forecast, model details and historical evidence, without live research. The web report defaults to **Experimental / Not validated**; the mode selector retains the separate approved publication view. BTC, ETH, SOL, BNB, XRP, ADA, DOGE and LINK come from `shared/contracts.ts`; Python reads the bounded literal catalog rather than maintaining another list. The dashboard links each asset to `/future-analysis?symbol=...`. `/research` opens the same report for existing navigation.

## Experimental estimates without promotion

Experimental generation and display require **none** of the historical/prospective performance gates: no 2% baseline improvement, 3/4 fold wins, 30 forward observations, or approved/active status. Losing, candidate-status models with zero forward observations can supply point estimates. Existing algorithms, features, daily frequency, model expiry and independent approval thresholds remain unchanged. Performance metrics stay available in Analytics Lab and the report's evidence details; they do not establish validated accuracy.

Use the existing offline generation command and the separate read-only export:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py predict --shadow-all
.\.venv\Scripts\python.exe ml/pipeline.py export-experimental
```

These commands reuse immutable current forecasts on repeated runs. They do not train or promote models. `predict --shadow-all` also checks the active path and may record `disabled_unvalidated` for assets without an active model; this does not prevent candidate forecasts or experimental export. If data is stale, explicitly synchronize the completed daily candles before prediction. Never use `weekly` as an export prerequisite: it includes training. Generation/export are offline operator commands, with no Python invocation in API handlers or automatic background training. Regenerate/export after the next UTC day; an expired forecast is unavailable until current, verified data and a genuine new forecast exist.

`export-experimental` opens the existing SQLite database read-only and writes `ml/data/experimental-forecasts.json` atomically. Missing databases are not created. It checks all eight symbols and exports an explicit unavailable state when essential checks fail. The optional `--db` and `--output` paths must identify the same operator-owned registry and its separate JSON snapshot; configure `FUTURE_ML_DATABASE_PATH` and `FUTURE_EXPERIMENTAL_EXPORT_PATH` accordingly. This operation does not modify model statuses, predictions, events, datasets or approval evidence. Rollback-journal SQLite locking holds the read snapshot through checksum/stamp capture and atomic replacement; WAL is rejected because main-file stamps cannot represent WAL changes.

The deterministic display rule is `lowest_selection_return_rmse_then_model_id_v1`: among existing current pending forecasts from compatible, unexpired candidate/approved/active models, choose the lowest finite historical selection **return** RMSE, breaking exact ties by ascending model ID. Rejected/archived models are excluded. No minimum improvement or successful-fold count applies. The report exposes the selected model/algorithm/history window, eligible candidate count, selection dates/samples, RMSE and baseline, fold wins, and forward sample count. Eligible historical windows may have different selection dates; this is a transparent display ranking, not an equal-period scientific comparison or proof of predictive superiority. Selection bias and reuse of development history remain limitations.

Essential checks remain mandatory: verified Binance rows and reviewed anomaly policy, current dataset fingerprint, completed latest UTC daily candle, gap-free history, model/artifact feature compatibility and checksums, source retrieval before forecast generation, training/evaluation labels available by the source close, source < generation <= export time < target, model expiry, exact forecast identity, reference closing price and return/price parity. The exporter never runs inference, clips prices, edits ledger rows or backdates predictions. It displays the original stored model-derived interval only when valid; absent/invalid interval evidence becomes `null` without blocking the point estimate. No range or confidence percentage is invented.

`GET /api/future-analysis/:symbol?mode=experimental` reads the bounded checksum/schema/registry-stamped snapshot and returns `mode: experimental`, `ml.status: experimental` and `validation.status: experimental_not_validated`. Ordinary GETs never call Gemini or persist anything. The default API request without a mode remains the approved contract. The web defaults to experimental explicitly and includes that mode in consented review POSTs (`{allowPaid:true,requestId:<uuid>,mode:"experimental"}`). Both mode and selected evidence bind the fingerprint, including unavailable states. Changing coin/mode clears the in-memory review and consent. Gemini receives the exact original numeric evidence and experimental status; it may critique the ranking and risks, but cannot change values, approve a model or invent an interval. Consent, request/cost controls and the absence of a shared AI-report cache are preserved.

See [actual eight-asset verification](EXPERIMENTAL_FORECAST_VERIFICATION.md). UI support does not guarantee every future day has a fresh usable dataset/model/forecast.

## Authority and approved publication

Python alone produces reference/predicted prices in USDT, expected return, sign-derived direction, and the interval. No inference or training runs in Express. The existing immutable SQLite datasets, source hashes, candidate registry, independent Ridge/Random Forest/Gradient Boosting fits, chronological purging, prospective forecasts, approval, promotion and rollback remain authoritative. Inspected history through 2026 is development/selection evidence, never a new untouched test.

The interval uses absolute **out-of-sample** return residuals from development folds. A finite-sample rank `ceil((n+1)*0.9)` fixes its radius before the final selection fold. That later fold measures coverage; below 90% is experimental and withheld. Price bounds are reference times `(1 + predictedReturn ± radiusReturn)`; impossible/nonpositive bounds are withheld rather than clipped. Calibration samples, dates, empirical coverage and method are frozen with the model and original forecast. This is historical empirical coverage, not a guarantee or a calibrated future probability. Reconciliation records subsequent interval outcomes without changing the original bounds.

Approved publication additionally requires current, gap-free verified data, an unexpired active model, the historical gates and at least 30 genuinely prospective outcomes meeting configured baseline thresholds. A candidate-origin shadow remains withheld after promotion; wait for the next active-origin forecast. For approved publication, models without interval evidence must undergo a new independently reviewed lifecycle; no old ledger entry is repaired or relabeled automatically.

From the repository root, follow [ML setup and review gates](../ml/README.md). After independently reviewing/approving a model and generating a current active forecast, explicitly export:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py export-analysis
# With a custom database, both consumers must point to the same file:
.\.venv\Scripts\python.exe ml/pipeline.py export-analysis --db C:\private\ml\lifecycle.sqlite3 --output C:\private\ml\future-forecasts.json
```

Export does not train, promote or activate forecasts. It emits all eight assets, including explicit unavailable reasons. A SQLite writer lock covers evidence reads and atomic JSON publication, without writing evaluation events. The envelope checksum detects corruption; the backend also verifies the database size/mtime before and after every read. Any subsequent database change revokes the export until a new export. A checksum is not a signature: both files must remain operator-owned on persistent local disk, outside cloud/network sync. Do not restore/copy a live database or enable WAL/replace the database outside this lifecycle. Registry/model/evaluation hashes and dates remain visible in the report.

`GET /api/future-analysis/:symbol` without a mode validates this approved file and returns ML plus review readiness only. It never writes, calls Gemini, or returns somebody else's AI report. ML publication is fresh for six hours by default; a still-current forecast may be marked stale thereafter, with expiry checked separately. Missing, expired, tampered or revoked files yield explicit unavailable data. The original `/api/predictions/:symbol` stays disabled and preserves mobile compatibility.

## AI interpretation of ML evidence

The browser sends `POST /api/future-analysis/:symbol/review` with explicit `{allowPaid:true,requestId:<uuid>,mode:"experimental"}` consent. The server selects and validates the immutable ML evidence; no numeric payload is accepted from the browser. One Gemini request sends that prediction, model details, historical/forward metrics, baseline comparisons, interval evidence, freshness and limitations. No Google Search or other tool is configured. Missing ML returns `ml_unavailable` without reserving or spending a request.

Gemini returns structured JSON for the executive summary, critical analysis, qualitative bullish/base/bearish scenarios, ML risks/uncertainty, conditional recommendations and limitations. The report has `provider: gemini_ml_review` and `basis: ml_only`. It is labeled **AI interpretation of experimental ML data, without live research**. It contains no source list, citations, Search Suggestions, developments or upcoming events. These fields are rejected by the strict contracts rather than populated with placeholders. Status/outlook labels assess only the supplied ML assumptions and cannot establish predictive accuracy or model approval.

The SDK uses the configured official endpoint, JSON MIME type and projected response schema, one attempt and cancellation/timeout. Full local validation checks the original structured response, selected asset/model/horizon and exact approved/experimental forecast fingerprint. Prose is qualitative; invented numbers, prices, probabilities, URLs, common current-news claims, trade guarantees and recognizable injection instructions fail validation. Prompt and shape checks cannot prove that every sentence is correct. The model is instructed to use only supplied evidence and never remembered or invented external facts. ML numbers/direction remain exclusively in the original ML payload and display.

A provider, timeout, parse, schema or identity failure preserves the ML forecast. There is no automatic paid retry, second formatting call or Search fallback. Registry/export changes during a request withhold the interpretation and return the current ML state.

## Privacy and usage budgets

AI reports exist only in the initiating POST response and component memory. They are not persisted, cached by symbol, placed in React Query/browser storage or returned by ordinary GETs. Switching coin/mode or leaving clears the report and consent. The web interface shows the analysis basis and limitations without a source list or Search iframe.

Only request hashes, usage counters, cooldowns and safe diagnostics persist. Credentials, prompts, ML payloads, model output, raw exception messages and private headers are excluded. `lastFailure` keeps an allowlisted code/category/stage, HTTP status and duration; the legacy grounding field remains nullable for reading older accounting files and is null for this workflow. No existing counters or reservations are reset. Legacy search counters remain readable; new ML-only requests do not increment them or add Search fees.

The existing exclusive cross-process lock, duplicate-ID protection, request/cost budgets and cooldowns remain. Defaults reserve at most eight requests/day and sixty-four/month before contacting Gemini. Failed or aborted requests remain counted, with unknown cost retained when usage cannot be accepted. Known usage includes input, candidate and thinking tokens. Estimates retain the configured input/output token rates; there is no query charge. Observed-cost thresholds remain $1/day and $10/month and are not hard provider billing ceilings. Corrupt accounting prevents spending; do not reset state or remove a live process's lock to bypass limits. Multiple replicas need shared coordination.

Tests run the actual GoogleGenAI SDK with stubbed HTTP responses, including successful responses with absent/empty grounding metadata, strict JSON contracts, unchanged experimental forecasts, consent, disabled/missing-ML cases, failures, privacy and single-call token accounting. Browser tests exercise the citation-free report, all forecast sections, error fallback and mobile layout. No paid API request is made by verification.

## Configuration and safe local setup

Defaults need no key and make no paid calls. Node reads only the process environment; it does not implicitly load private env files. Copy `backend/.env.example` to an ignored private file if needed, set paths explicitly and run `node --env-file=backend/.env.local --import tsx backend/src/server.ts`. `npm run future:status -w backend` is read-only; use the same environment file when checking a configured instance. There is no paid CLI, background review job or automatic publication.

| Variable                                                              | Default / purpose                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `FUTURE_GEMINI_REVIEW_ENABLED`                                        | `false`; operator must opt in, then each browser request requires consent |
| `GEMINI_API_KEY` / `GEMINI_KEY_ROTATED`                               | Private fresh credential / `false` acknowledgement; both required         |
| `GEMINI_MODEL`                                                        | `gemini-3.5-flash-lite`; another model stays unverified/disabled          |
| `FUTURE_ML_EXPORT_PATH`                                               | `ml/data/future-forecasts.json`                                           |
| `FUTURE_EXPERIMENTAL_EXPORT_PATH`                                     | `ml/data/experimental-forecasts.json`; separate candidate snapshot        |
| `FUTURE_ML_DATABASE_PATH`                                             | `ml/data/lifecycle.sqlite3`; same registry used by export                 |
| `FUTURE_STORAGE_PATH`                                                 | `backend/.future-data`; counters only, persistent owned local directory   |
| `FUTURE_REVIEW_TTL_SECONDS`                                           | 900; initiating view discards expired review                              |
| `FUTURE_CACHE_TTL_SECONDS` / `FUTURE_STALE_SECONDS`                   | 21600 / 86400; ML publication only, never AI-report caching               |
| `FUTURE_TIMEOUT_MS`                                                   | 30000; bounded to 60000                                                   |
| `FUTURE_MAX_DAILY_REQUESTS` / `FUTURE_MAX_MONTHLY_REQUESTS`           | 8 / 64                                                                    |
| `FUTURE_MAX_DAILY_ESTIMATED_USD` / `FUTURE_MAX_MONTHLY_ESTIMATED_USD` | 1 / 10; observed spend stop thresholds, not hard provider caps            |

For containers, mount the DB/export read-only at matching configured paths and an owned private accounting directory read-write. Python stays outside the API image. Default Compose mounts none of these and enables no spending/publication. HTTPS, provider billing quotas, backups, access controls and clock synchronization remain operator responsibilities.

Standalone GDELT/RSS/News Intelligence routes, source collectors, schemas, scripts, tests and direct XML dependency were removed. Ignored `.news-data`, existing ML datasets/models and historical audit documents were preserved. See [actual verification and readiness](FUTURE_VERIFICATION.md); UI support for an asset is not evidence that its ML model is ready.

`FUTURE_GEMINI_SEARCH_ENABLED` remains a legacy enable-flag alias when `FUTURE_GEMINI_REVIEW_ENABLED` is absent. The explicit new flag takes precedence, including `false`; neither flag enables Search tools. Existing private env files need no forced edit.
