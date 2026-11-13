# Railway preparation verification — November 13, 2026

Work started from `origin/main` at `e68be94` on the separate `feat/railway-docker` branch. PR #2 was inspected and was closed/unmerged at verification time; none of its VPS commits were merged or reused as a base.

## Completed locally

| Check | Result |
| --- | --- |
| `npm test` | 100 passed: shared 46, backend 52, frontend 2 |
| `npm run typecheck` | Passed for shared, backend and frontend |
| `npm run lint` | Passed, zero ESLint warnings |
| `npm run build` | Shared, backend and production frontend passed |
| `npm run test:browser` | 12 Playwright tests passed |
| Python unittest discovery | 57 passed, including 5 Railway runtime/backup tests |
| Railway SDK typecheck | Passed against locked `railway` 3.17.0 |
| Railway configuration evaluation | Evaluated locally: one service/region/replica, one `/data` volume, healthcheck and restart settings; no API/project access |
| `docker compose config --quiet` | Passed |
| Python deployment source compilation | Passed |
| `git diff --check` | Passed |

The production frontend build reported the existing large-chunk warning. No bundle/algorithm refactor was included. The initial restricted Vite build failed with Windows `spawn EPERM`; the build and npm/browser checks subsequently passed outside that process restriction.

The Python suite includes deployment tests for persisted catch-up/retry state, atomic state replacement, backup contents/source timestamps/retention/failure, exclusion by the job lock, stopping a worker when HTTP fails, and daily success/failure/timeout handling.

## Real ML and HTTP validation

A consistent SQLite backup of the existing local database was placed in a new ignored verification directory. The existing `pipeline.py daily` command completed successfully with all eight valid forecasts. It did not run `train` or `select`.

The production-built API served all eight predictions through real local HTTP requests; each passed the shared schema, had experimental status, a positive numerical forecast and a future target. The same process served `/`, `/predictions` and `/portfolio` from the production frontend build. An integrity-checked backup of the verification database preserved its source timestamp and kept the publication valid.

The original database timestamp and SHA-256 of all **152 stored model records** were unchanged. Those model records also matched the verification copy after daily execution. Original data, private state, generated predictions and backups are excluded from commits/images.

## Not verified locally

Docker CLI is installed, but the Docker Desktop Linux engine pipe was absent. Both `docker compose build` and `docker build -t investing-hub-railway:test .` failed before building because the engine could not be reached. Therefore local image builds, container health, Linux container startup/UID, shutdown and volume restart/redeployment smoke checks were **not run successfully**. A Linux Docker CI job builds both Compose images and the combined Railway image and runs the disposable-volume smoke test; its run status must be checked on the PR.

No Railway resources, deployment, production domain/TLS, volume import/restore or actual Railway scheduled execution were performed. Destination-region Binance access, actual daily peak RAM, Railway permissions/settings and backup recovery still need operator verification following [the deployment guide](RAILWAY.md). The guide documents expected redeployment downtime, unavailable predictions during updates/expiry and independent backup requirements.
