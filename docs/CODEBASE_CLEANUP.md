# Codebase cleanup audit and verification

Audit date: 2026-11-15. Baseline: `07cfb99`. Work is isolated on
`refactor/codebase-cleanup`; no deployment, merge, production-data operation,
training run against existing data, or scheduler installation is authorized by
this work. The initial working tree was clean.

## Phase A: architecture and evidence

The audit inventoried all 299 tracked files, application and CLI entry points,
static/dynamic imports, package exports, manifests/locks, native resources,
Docker contexts, Compose, Railway IaC, CI, scripts, tests and documentation.
Generated dependencies, ignored datasets and private environment contents were
not treated as source or read for credentials.

| Component | Entry points and responsibilities |
| --- | --- |
| Web | `webapp/src/main.tsx` -> `App.tsx`; lazy dashboard, portfolio, predictions and learning routes; React Query public data; browser guest storage and separate in-memory account sessions. |
| Backend | `backend/src/server.ts` composes configuration, optional Mongo/auth/email/FCM and lifecycle; `app.ts` installs HTTP policies, routes, SPA serving and sanitized errors. Market provider/cache/service and prediction publication reader are already separate. |
| Shared | Explicit package exports for Zod contracts, Decimal portfolio replay, analysis, API client, localization and prediction validation; built before API/web/mobile imports. |
| Mobile | Expo Router discovers `mobileapp/app/*`; platform-specific entry, token and notification files are resolved dynamically. Gradle, Expo plugins and native resources participate without application imports. Separate lock preserves Expo/React compatibility. |
| ML | `pipeline.py`, `run.ps1` and the opt-in scheduler drive ingestion, features, chronological training, selection, immutable forecasting, reconciliation and atomic publication in existing SQLite tables. Eight daily assets and four real model candidates are active. |
| Deployment | Root Dockerfile and `deploy/railway` supervisor serve web/API plus finite daily jobs on one volume. Separate Compose images, mobile Mongo override and `.railway/railway.ts` remain supported. CI verifies changes but does not deploy. |

Authentication, verification, Brevo precedence/SMTP fallback, Mongo collections,
Decimal writes, public Binance data, charts, educational content and prediction
contracts are active. No API, schema, environment-name or schedule change is
needed. The root already contains appropriate project-level entry/configuration
files; relocating them would add path churn without a navigation benefit.

### Findings and proposed changes

1. **Confirmed obsolete asset:** `webapp/src/assets/images/candlestick-chart-definition.png`
   is an old educational chart illustration (22,112 bytes). Repository-wide
   filename searches, asset/import inventory and Vite/public/static configuration
   checks find no consumer. Learning uses `components/CandleDiagram.tsx`, verified
   by existing browser coverage. Remove only this unused image.
2. **Mixed HTTP responsibilities:** `app.ts` mixes composition/routes with static
   asset fallback/cache policy and error serialization. Extract those two cohesive
   responsibilities without changing middleware order, status codes or headers.
3. **Large UI module:** `Portfolio.tsx` combines portfolio operations with a
   self-contained transaction dialog. Move that dialog to `components`, keeping
   its props, validation, localization, state and callbacks unchanged.
4. **Training imported by production CLI paths:** `forecast.py`, `publication.py`
   and `pipeline.py` import `train.py` for constants, selection or metrics, eagerly
   loading sklearn and Torch. LSTM artifact inference also imports its training
   scaler. Separate selection, evaluation and LSTM inference responsibilities;
   load fitting only for the explicit `train` command. Preserve numerical
   algorithms and artifact formats, and include extracted source in future fit
   fingerprints. Add fresh-process dependency-boundary regression coverage.
5. **Hygiene gaps:** root ignores omit general logs, alternative virtualenv/cache
   names and market datasets/model outputs outside the existing ignored data
   directories. Extend targeted patterns without ignoring small inference JSON
   or removing tracked datasets/artifacts.
6. **Documentation drift:** the quarantined-model README incorrectly says every
   Docker context excludes all ML, while Railway copies active Python code.
   Historical report wording can be mistaken for current model approval rules.
   Clarify labels and document the actual dependency boundaries.

### Candidates intentionally retained

- `ml/archive/legacy-models/*`: inactive for inference, but deliberately retained
  historical material with original hashes and unknown reproducibility value.
  Previous migration records explicitly preserve them. No deletion is justified.
- `ml/reports/*`, historical docs, exact anomaly-review records and ignored
  datasets/SQLite/model records: research/provenance, not disposable generated
  clutter. Nothing reads or mutates existing runtime data during this cleanup.
- `.idea`, `.vscode`, `.nvmrc` files: developer configuration; no evidence they are
  abandoned. Native Android assets, Firebase client configuration, debug keystore,
  Gradle wrapper and platform adapters are build inputs and remain intact.
- All declared dependencies: runtime, tests, build, Expo plugin/autolinking or
  transitive runtime use is present or cannot safely be excluded. In particular,
  Expo Router loads `query-string` internally. No dependency/lock change is planned.
- Web public fetch and shared authenticated client have different cancellation,
  caching, error and session policies. Superficially similar response parsing is
  preserved to avoid changing those behaviors through a generic transport layer.

## Baseline checks

Executed locally with Node 26.13.0, npm 11.20.0 and Python 3.13.14:

| Check | Baseline |
| --- | --- |
| `npm test` | 169 passed: shared 46, backend 111, web 12; backend has two explicit skips. |
| Python unittest discovery | 58 passed, synthetic/isolated data only. Expected negative-case logs occur. |
| Root typecheck / web lint / root production build | Passed; existing >500 kB web bundle warning. |
| Mobile typecheck / unit tests / lint | Passed; seven tests. |
| Railway IaC typecheck | Passed. |
| Web Playwright | 20 passed. |
| Mobile fixture export + Playwright (`EXPO_NO_DOTENV=1`) | Passed; two workflows. |
| `python -m pip check` | Passed. |
| PowerShell scheduler mocks | Passed (`scheduler_mocks_passed`); no real task installed. |
| `docker compose config --quiet` | Passed. |
| `npm ls --all --json` | Pre-existing `ELSPROBLEMS`: Mongoose's MongoDB driver optionally requests `gcp-metadata@^5.2.0`, while the Firebase/Google auth tree supplies 9.2.3. Both requirements are already recorded in the lockfile. |
| Real Mongo integration / graceful SIGTERM | Skipped: no explicit disposable Mongo port; Windows does not support the Linux signal case. |
| Docker image builds/smoke | Not run: Docker CLI exists, but Docker Desktop Linux daemon pipe is absent. |

Initial sandboxed Vitest runs failed before tests with `spawn EPERM`. The same
commands passed with authorized child-process access; this is an environment
restriction rather than an application failure. No production Mongo, email,
Firebase, Binance download or Railway service was contacted for verification.

## Phase B: implemented changes

### Before/after structure

Only affected paths are expanded below. Root manifests, workspaces, native
project, deployment entry points, data paths and public contracts stay in place.

```text
Before                                  After
backend/src/                            backend/src/
  app.ts (routes + static + errors)        app.ts (HTTP composition + routes)
  server.ts                               server.ts
                                          web.ts (static + SPA fallback)
                                          errorHandler.ts (HTTP errors)
webapp/src/                             webapp/src/
  pages/Portfolio.tsx (page + form)        pages/Portfolio.tsx (page operations)
  assets/images/candlestick-...png         components/TransactionDialog.tsx
ml/                                     ml/
  train.py (fit + metrics + selection)     train.py (fitting/evaluation orchestration)
  lstm.py (fit + network + inference)      lstm.py (fitting/scaling)
  forecast.py -> train.py                  selection.py (frozen ranking + identity)
  publication.py -> train.py               evaluation.py (shared scoring)
  pipeline.py -> train.py eagerly          lstm_inference.py (network + inference)
                                          forecast.py -> selection/evaluation
                                          publication.py -> selection
                                          pipeline.py -> train only for train
```

The repository still has the same top-level `backend`, `webapp`, `mobileapp`,
`shared`, `ml`, `deploy`, `docs`, `.github` and `.railway` responsibilities. No empty
future-feature directory, replacement framework or generic service layer was
introduced. The obsolete image's directories disappear naturally when empty.

### Removal and consolidation ledger

| Original location | Result and reason |
| --- | --- |
| `webapp/src/assets/images/candlestick-chart-definition.png` | Deleted: confirmed orphan educational image, replaced by the active inline candle diagram; no import, stylesheet, dynamic path, public copy, test or deployment consumer. This is the only deleted file. |
| Static hosting in `backend/src/app.ts` | Moved to `backend/src/web.ts`; relative path resolution, asset cache headers, GET/HEAD SPA fallback and API/dotfile/missing-asset exclusions preserved. |
| Error handler in `backend/src/app.ts` | Moved to `backend/src/errorHandler.ts`; four-argument Express middleware, validation/body/Mongo errors, sanitized logging and response contracts preserved. Installed after the same 404 middleware. |
| Transaction dialog in `webapp/src/pages/Portfolio.tsx` | Moved to `webapp/src/components/TransactionDialog.tsx`; form state, validation, localized decimals, date conversion, IDs, accessibility and account/guest callbacks preserved. |
| Selection/constants in `ml/train.py` | Moved to `ml/selection.py`; same pipeline version, candidate order, comparable-run filters, RMSE/tolerance ranking and registry writes. |
| Metrics in `ml/train.py` | Moved to `ml/evaluation.py`; same sklearn functions and numerical operations, loaded on demand for scoring. |
| Network/weight inference in `ml/lstm.py` | Moved to `ml/lstm_inference.py`; same Torch network, array/scaler validation, weight loading and numerical operations, without training's sklearn scaler import. |

No dependencies were removed, added or upgraded. All manifests, locks, pinned
Python requirements, Dockerfiles, Compose definitions, CI and environment names
are unchanged. Root Docker's existing `COPY ml/*.py` includes the extracted
modules. Production retains Torch for existing LSTM models and sklearn for
reconciliation; import separation is not a claim of smaller images or changed
inference algorithms.

Root `.gitignore` now covers general logs, SQLite runtime files, alternate Python
virtualenv/caches, and ML CSV/Parquet/NumPy datasets and common checkpoint formats.
Checks confirm example environment files, small inference JSON and quarantined
ONNX remain eligible for tracking. No tracked archive, dataset, model, migration,
native resource or user content was removed. Existing on-disk state was not moved.
Historical reports are explicitly labeled; the archive README now distinguishes
Railway's active Python context from Compose's ML exclusion.

## Phase C: final validation

The baseline commands were rerun after implementation, with these results:

| Check | Final result |
| --- | --- |
| `npm test` | **Passed: 169** (shared 46, backend 111, web 12); same two explicit backend skips. |
| `python -m unittest discover -s ml -p 'test_*.py'` | **Passed: 60**, up from 58. Final run: 74.878 seconds. |
| Root typecheck, web lint, root production build | **Passed**; same pre-existing bundle warning. |
| Mobile typecheck, unit tests, lint | **Passed: seven tests**. |
| Railway IaC typecheck | **Passed**. |
| Web Playwright | **Passed: 20**. |
| Mobile fixture export + Playwright | **Passed: two workflows**, with dotenv disabled. |
| Python dependency consistency / scheduler mocks / Compose configuration | **Passed**. |
| Root and Railway `npm audit --json` | **Passed: zero advisories** in each; executed read-only against the registry. |
| Mobile `npm audit --json` | **Failed, pre-existing:** 26 affected packages (three high, 22 moderate, one low), matching the production audit. Dependencies/locks unchanged. |
| `npm ls --all --json` | **Failed, pre-existing:** the same optional Google metadata peer mismatch; confirmed before and after with unchanged locks. |
| Source identity / ignore policy / `git diff --check` | **Passed**. |
| Real Mongo integration, Linux graceful shutdown | **Not executed locally:** same two explicit test skips. |
| Docker image builds and disposable-volume smoke | **Not executed locally:** Docker daemon unavailable. |
| Native Android/iOS build/device checks, live Brevo/SMTP/FCM/provider/production requests | **Not executed**; no live credentials/services used. |

The new fresh-process tests exercise real, previously fitted synthetic Ridge
artifacts for all eight symbols and the `status`, `evaluate`, `reconcile`,
`predict` and `select` commands while imports of fitting, sklearn and Torch are
blocked. A second fresh process executes saved LSTM numeric weights with sklearn
and fitting imports blocked, and checks numerical parity. Existing tests still
verify all four fitted candidates, train-only scaling, purged time windows,
selection, immutable forecasts, publication integrity, daily orchestration and
failure recovery. Reconciliation with realized observations continues to use the
same sklearn metrics, as exercised by the daily lifecycle tests.

One-off AST/text comparisons against `07cfb99` confirm selection, the LSTM
network/regressor/inference, transaction dialog, static hosting and HTTP error
handler bodies were preserved during extraction. Future explicit fits hash every
extracted ML source file; recorded historical hashes and stored artifacts are not
rewritten. No new model was trained against existing market data.

## Phase D: remaining risks and future integration

- The Expo SDK 53 advisory backlog needs a separate compatible SDK/native-device
  upgrade. The Mongo optional Google metadata peer conflict needs a focused
  dependency compatibility review if that authentication mechanism is required.
  Neither is safely solved by deleting a seemingly unimported package.
- The web main chunk remains 540.65 kB minified. Route loading is already lazy;
  further bundle changes require measurement and their own browser regression
  checks. Existing larger mobile JavaScript screens remain candidates for a
  separate native-tested refactor.
- Accounts retain existing single-process verification/rate-limit state; SQLite
  publication retains its single-writer/local-disk assumptions. Source cleanup
  does not change these operational limits. Live Mongo/email/push, native devices
  and Docker execution still require their appropriate environments.
- Quarantined ONNX/scalers, historical reports, IDE settings and native resources
  remain intentionally preserved for the evidence described in Phase A. No other
  file met the deletion criteria. The current daily training and all eight active
  prediction integrations remain available.

For the **future** Binance Public Data minute-candle pipeline (not implemented):

1. Keep acquisition, features/targets, offline fitting, frozen selection and
   bounded inference behind the existing logical boundaries. The current daily
   provider/feature contract cannot simply be pointed at minute files: explicitly
   version interval, feature order and target horizon when implementing it.
2. Start with BTCUSDT/ETHUSDT/SOLUSDT and approximately 12 months of completed
   one-minute candles in external storage. Preserve checksums/provenance, UTC
   completion, continuity and incremental synchronization; ignored CSV/Parquet
   and checkpoints must stay out of Git and image contexts.
3. Evaluate 1/5/15/60-minute targets chronologically, with horizon-aware label
   purging and train-only preprocessing. Do not reuse daily split sizes or compare
   overlapping/future labels as if they were independent observations.
4. Train explicitly offline, version artifacts/contracts, and publish lightweight
   numerical results for production readers. Preserve unavailable states,
   checksums and the existing daily API while introducing any future compatible
   contract deliberately. Avoid fitting, bulk downloads or new model runtimes in
   HTTP handlers.

No minute-data acquisition, new horizon, new endpoint, database migration,
retraining schedule or product feature was added by this cleanup.
