# Rebuild handoff

All work is local on the original `webapp` branch. No staging, commits, pushes, branches, merges, history edits, Git date/configuration changes or remote infrastructure changes were performed. The existing tracked environment files are untouched; their cleanup is an owner action.

## Phase record and changed-file groups

| Phase                      | Files and decisions                                                                                                                                                                                                               | Verified behavior                                                                                                                                                          | Remaining limits                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Audit                      | `docs/AUDIT.md`; inspected web modules, Express routes/jobs, Mongo schemas, model/scaler inventory, dependencies and deployment configuration before changes                                                                      | Confirmed route shadowing/auth bypass, expensive data fan-out, flawed cost basis and unverifiable ML                                                                       | Audit cannot establish legacy model training provenance or remove historical credentials          |
| Security and backend       | `backend/src/{app,server,config,errors}.ts`, `backend/src/market/*`, `backend/src/predictions/service.ts`, `shared/contracts.ts`, safe env examples; retired monolithic server, Mongo schemas/logger and old runtime dependencies | Strict config/query validation, exact CORS, Helmet, rate limits, sanitized errors; legacy routes absent; provider batching/cache/retries/cooldowns                         | Single provider and one in-memory instance; conservative shared rate limit behind Nginx           |
| Portfolio domain           | `shared/portfolio.ts`, `src/pages/Portfolio.tsx`, storage hook and financial tests                                                                                                                                                | Decimal weighted basis/fees, stable chronological replay, negative-holdings prevention, edit/delete safety, local multi-portfolio state and export                         | Device/origin-local data, last-write-wins across tabs, no cash simulation or cloud migration      |
| Web interface              | `src/App.tsx`, `main.tsx`, route views, reusable chart/table/status components, typed query client, CSS/favicon/index; retired coupled JSX/context implementations                                                                | Responsive dark/light dashboard, search/sort/watchlist, real candles and indicators, accessible price table, learning/quiz, honest disabled-model UI                       | No live news, login, automatic alerts, fiat conversions or fabricated global market statistics    |
| Research                   | `ml/{download,features,train,predict,test_pipeline}.py`, pinned requirements/config, methodology and generated reports                                                                                                            | Verified archive hashes, past-only features, missing-data isolation, chronological splits/gaps, candidates/baselines, walk-forward selection and held-out baseline results | Neither pair passed the gate; no deployed/exported candidate model; no simulated trading strategy |
| Build and local deployment | Root npm workspace/lock, TypeScript/Vite/ESLint/Prettier/test configs, Dockerfiles/Compose/Nginx, README/security/architecture/verification docs                                                                                  | Production build, API startup, 46 unit/API tests, 4 browser tests, 6 Python tests, lint/format and audit all passed; Compose syntax valid                                  | Docker engine unavailable, so container build/runtime unverified; no deployment                   |

The main architectural change is a guest-only browser workspace with a read-only public-data API and an entirely separate offline research pipeline. Remote account data has no surface in this demo. One batched ticker call and shared candle cache replace the previous frontend/model/provider duplication. No extra database, Redis, queue or model HTTP service was introduced. See [architecture details](ARCHITECTURE.md).

## Actual research outcome

Each pair has 1,826 checksum-validated daily candles (Jan 2021–Dec 2025), 1,811 usable samples, no gaps or detected anomalies. Train/validation/test samples: 1,085 / 361 / 363 after horizon-gap exclusions. Validation candidate selection was fixed before test evaluation.

| Pair    | Best validation candidate | Return-RMSE improvement over no-change | Walk-forward wins | Gate result                                    |
| ------- | ------------------------- | -------------------------------------- | ----------------- | ---------------------------------------------- |
| BTCUSDT | Gradient Boosting         | 1.1098%                                | 2/4               | Fails 2% improvement and 3/4-fold requirements |
| ETHUSDT | Gradient Boosting         | 0.8116%                                | 3/4               | Fails 2% improvement requirement               |

Both select the no-change baseline for the held-out evaluation. Its test price MAE/RMSE is 1,556.09 / 2,130.97 USDT for BTC and 82.64 / 119.42 USDT for ETH. These are baseline errors, not approved model scores. Directional accuracy, return errors and all candidate validation/fold results are in [the full report](../ml/reports/latest.json). Forecast values remain null and the API explicitly says `disabled_unvalidated`. No candidate pipeline is exported when the gate fails. No deep learning model or trading-return claim is justified.

## Owner actions and known limits

Rotate exposed Google/Gemini, CryptoPanic, mail and any database/JWT credentials; review old logs/deployments. Manually untrack `.env`, `.env.production` and `backend/.env` after private backup/review. Exact provider-specific actions and the owner-only `git rm --cached` command are documented in [SECURITY.md](SECURITY.md). Current ignore rules do not erase earlier commits or stop tracking existing files.

The demo depends on one geographically restricted public-data provider. Guest state is browser-local and has no multi-device synchronization or authenticated owner. Existing Mongo account/portfolio records are not migrated. No model qualified; no news/paid AI is enabled. Docker runtime and Node 24 execution remain unverified on this Windows host; Node 26 development/production processes passed. Deployment/TLS and secret rotation remain owner work, not silently completed actions. Original contributors and legacy model artifacts remain credited/preserved.

See [VERIFICATION.md](VERIFICATION.md) for exact check results and environmental constraints.

## Suggested commit boundaries — owner only

These are suggestions, not executed commands. Review the broad coupled rewrite before choosing how to stage it; some phases depend on each other and are best combined to keep each commit runnable.

1. **`refactor: replace legacy server with a secure guest market API`** — workspace/toolchain foundation, read-only TypeScript API/shared contracts, provider adapter/cache, removed auth/DB/news/model runtime, env examples and security/audit docs. Owner may include env untracking after rotating credentials.
2. **`feat: add decimal guest portfolio accounting and persistence`** — ledger, local persistence, transaction validation/replay and deterministic financial tests.
3. **`feat: rebuild the crypto dashboard and learning workspace`** — TypeScript UI, shared queries, chart/technical analysis, market table, guest portfolio views, learning quiz and dark/light responsive styles. Combine with phase 1 if needed to avoid an intermediate broken browser build.
4. **`research: add reproducible daily BTC and ETH baseline experiments`** — Python pipeline, config/pins/tests, generated text reports and documented disabled forecast gate. Exclude raw data, `.venv`, model artifacts and caches.
5. **`build: add verified local workflows and container configuration`** — Docker/Nginx/Compose, browser tests, README, formatting and final architecture/verification/handoff documents.

Review, stage, date and commit these yourself on `webapp`. The agent has left all changes unstaged.
