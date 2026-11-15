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
| `npm ls --all --json` | Pre-existing `ELSPROBLEMS`: optional `gcp-metadata` peer conflict in the Firebase dependency tree. |
| Real Mongo integration / graceful SIGTERM | Skipped: no explicit disposable Mongo port; Windows does not support the Linux signal case. |
| Docker image builds/smoke | Not run: Docker CLI exists, but Docker Desktop Linux daemon pipe is absent. |

Initial sandboxed Vitest runs failed before tests with `spawn EPERM`. The same
commands passed with authorized child-process access; this is an environment
restriction rather than an application failure. No production Mongo, email,
Firebase, Binance download or Railway service was contacted for verification.

## Phases B-D

Implementation details, before/after structure, final check results and future
pipeline recommendations will be recorded here after verification.
