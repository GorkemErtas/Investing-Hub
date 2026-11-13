# Railway Docker deployment

This is a deployment preparation, not a live deployment. Review the PR before connecting production. The VPS work in PR #2 is independent and is not required.

## Architecture

Use **one always-on Railway service, one replica, one region and one persistent volume at `/data`**. The root `Dockerfile` builds React/Vite and Express and installs the existing pinned Python CPU dependencies. Express serves the built frontend, SPA routes and `/api` on `0.0.0.0:$PORT`. Railway terminates HTTPS. Local Compose and Nginx remain available separately.

```text
Browser -- HTTPS --> Railway edge --> Express ($PORT): React + /api
                              Python supervisor --> finite daily Python job
                                         |
                                  /data/ml/ volume
                                  lifecycle.sqlite3 (including model artifacts)
                                  predictions.json, scheduler.json
                                  logs/daily/, backups/
```

The supervisor loads no ML libraries; the daily child exits between runs. HTTP handlers never perform inference. There is no automatic training or model selection. Existing model weights, metadata and forecast history are stored inside SQLite; the ignored `ml/artifacts` directory is not needed at runtime.

A separate Railway cron/API service cannot access this disk. Copying JSON without the matching database would fail the API's registry stamp checks. Co-locating them avoids a synchronization protocol and extra services. Do not add replicas or another writer. Railway volumes prohibit replicas and overlapping mounted deployments, so redeployments have brief downtime. [Volume constraints](https://docs.railway.com/volumes/reference).

Start with one CPU, approximately 1 GiB RAM and a 1 GiB volume, then measure the daily memory/storage peak before reducing limits. The CPU Torch dependency supports existing LSTM models but makes the image larger. Only the small supervisor and Node stay resident between jobs. Configure spending alerts and watch storage: the ledger and seven retained local backups grow over time. No Redis, PostgreSQL, queue or paid data/AI service is added.

## GitHub connection and service settings

1. After approval, create an empty Railway project and a service named `investing-hub`. Grant the Railway GitHub app access to `GorkemErtas/Investing-Hub`. Connect the approved branch (`main` after merge). Pause automatic deployments until the volume and settings are ready; connecting a source can start a build immediately.
2. Keep the source root at the **repository root**. Railway detects the root `Dockerfile`. Do not select a workspace subdirectory, the individual frontend/backend Dockerfiles or Railpack. Leave build/start/pre-deploy overrides empty: Docker's entrypoint and CMD supervise both processes.
3. Attach a volume named `investing-hub-data` at **`/data`**, in the service's region. The example IaC uses `europe-west4`; check Binance availability and terms in the chosen region. The image refuses an ephemeral `/data` directory. Volumes are mounted only at runtime, not during builds or pre-deploy commands. [Volume setup](https://docs.railway.com/volumes).
4. Configure these settings:

| Setting | Value |
| --- | --- |
| Builder / Dockerfile | Docker / root `Dockerfile` |
| Replicas / regions | exactly one replica in one region |
| Healthcheck | `/api/health`, timeout 120 seconds |
| Restart | On Failure, maximum 10 retries |
| Deployment draining / shutdown grace | 20 seconds |
| Serverless / App Sleeping | disabled |
| Railway cron schedule | unset |
| Volume mount | `/data` |
| Start / pre-deploy command override | empty |

The Docker healthcheck also calls `/api/health` on the runtime port. Health deliberately remains successful without predictions/accounts, preserving guest/demo mode. Monitor prediction freshness separately. Railway's healthcheck gates deployment and does not continuously probe live services. Child process crashes make the supervisor exit nonzero for the restart policy. [Healthcheck behavior](https://docs.railway.com/deployments/healthchecks).

### Optional Infrastructure as Code

[`.railway/railway.ts`](../.railway/railway.ts) describes the service and volume using the current `railway/iac` SDK. It avoids the deprecated `railway.json`/`railway.toml` format, whose documented legacy support ends December 1, 2026. [Current IaC reference](https://docs.railway.com/infrastructure-as-code/reference), [Config as Code deprecation](https://docs.railway.com/config-as-code/reference).

Run `npm ci --prefix .railway --ignore-scripts` and `npm --prefix .railway run typecheck`. With a current Railway CLI, authenticate/link the intended project and environment. Set the service's `CORS_ORIGINS` first; IaC preserves it. Run `railway config plan` from the repository root and inspect the proposed resources. Applying a plan can provision/deploy and requires explicit approval. Match existing names to avoid replacing a volume. Dashboard setup does not require applying IaC; the isolated SDK is excluded from the application image.

## Environment and HTTPS

For optional web accounts, SMTP variables, session behavior and live acceptance checks are in [Web accounts](WEB_ACCOUNTS.md). Guest Demo requires none of those private services.

Set variables in Railway using [the secret-free example](../deploy/railway/.env.example). `.env` files are neither loaded automatically nor copied into the image.

- `PORT`: defaults to 8080 in Docker; a Railway override is supported. Match the domain target port.
- `CORS_ORIGINS`: exact HTTPS public origins, comma-separated, without trailing slash/path. Include both generated and custom domains when needed. The frontend uses relative `/api`, so no API URL or private value is baked into Vite.
- `TRUST_RAILWAY_PROXY=true`: use Railway's overwritten `X-Real-IP` for client rate limits. Generic Express `trust proxy` remains disabled; client-supplied `X-Forwarded-For` chains are ignored. Enable only when Railway's HTTP edge is the sole untrusted ingress: no TCP proxy or untrusted private callers. Leave false for direct/local access. [Edge header contract](https://docs.railway.com/networking/public-networking/specs-and-limits).
- `WEB_DIST_PATH=/app/webapp/dist`, `ML_DATABASE_PATH=/data/ml/lifecycle.sqlite3`, `PREDICTIONS_EXPORT_PATH=/data/ml/predictions.json`: image defaults. The supervisor rejects mismatched data paths.
- `ML_DAILY_ENABLED=false` during import/maintenance; `true` for normal operation.
- `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=20`: also configure the service draining setting. Node drains within 10 seconds; the supervisor allows 12 seconds for its children.
- Leave Mongo/JWT/SMTP/Firebase secrets unset for guest/demo mode. Existing optional account integrations retain `backend/.env.example` configuration; no account database is provisioned. Keep future secrets in Railway Variables/private credential storage, never Git or `VITE_*`.

The entrypoint briefly initializes `/data/ml` ownership as root, then runs the supervisor, API and ML worker as UID/GID **10001**. Tini reaps children. Keep the default entrypoint/run UID so this ownership step can run; do not override it to an unrelated user.

In Settings → Networking, generate a Railway domain targeting the actual `PORT`, add its HTTPS origin to CORS and redeploy. For a custom domain, add it, install Railway's supplied DNS records, wait for the managed TLS certificate and add its HTTPS origin. Verify HTTPS and browser requests on both origins. No certificate server or Nginx/Caddy hop is needed in this architecture. [Domain setup](https://docs.railway.com/networking/domains/working-with-domains).

## Import the existing selected models without retraining

Preserve the original local database. Export a consistent SQLite backup into a **new** private destination using the existing CLI; do not copy an open live database:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py backup --output C:\private\railway-seed.sqlite3
```

1. Start the service on its empty volume with `ML_DAILY_ENABLED=false`. The guest demo works and predictions report unavailable. Nothing creates a substitute empty database or trains models.
2. With a recent authenticated Railway CLI linked to the intended environment, upload the backup to a new staging filename. Volume CLI paths start at the volume root: `/ml/...` maps to container `/data/ml/...`.

   ```sh
   railway volume files --volume investing-hub-data upload /private/railway-seed.sqlite3 /ml/lifecycle.seed.sqlite3
   railway volume files --volume investing-hub-data list /ml
   ```

   Substitute the actual local backup path; do not pass `--overwrite`. [Volume CLI commands](https://docs.railway.com/cli/volume).
3. Use `railway ssh --service investing-hub` to inspect the staging file with a read-only SQLite connection. Confirm `PRAGMA integrity_check` is `ok`, `PRAGMA user_version` is 1 and all eight symbols have an active model. Compare its SHA-256 with the local backup before installation. Model artifacts/checksums are subsequently inspected by `pipeline.py status` and daily verification.
4. **First import only:** confirm `/ml/lifecycle.sqlite3` does not exist, then rename the staging file. Existing data requires the restore procedure below.

   ```sh
   railway volume files --volume investing-hub-data rename /ml/lifecycle.seed.sqlite3 /ml/lifecycle.sqlite3
   ```

5. Restart/redeploy with the worker still disabled to repair imported file ownership. Through SSH, run `python ml/pipeline.py status --db /data/ml/lifecycle.sqlite3` and confirm the existing selections.
6. Set `ML_DAILY_ENABLED=true` and redeploy. With no scheduler success record, it immediately catches up using **daily**, never train/select. Inspect logs and all eight API responses before production traffic.

Do not upload an old `predictions.json`: SQLite backup/transfer changes its filesystem stamp. Publish on the destination disk. All selected weights/history are in SQLite. If no selected database exists, keep guest mode and explicitly prepare models outside the service following the ML guide.

## Daily consistency and restarts

The schedule matches the existing **00:15 UTC / 03:15 Europe/Istanbul** daily run. `/data/ml/scheduler.json` persists successful schedule dates and retry boundaries. Startup catches up a missed slot; failed/interrupted work retries at most hourly, including across redeploys. Missing seed data logs `ml_database_missing` without creating a database. Each daily child has a 25-minute deadline. Existing bounded network retries and the shared `<database>.job.lock` remain in force.

The existing daily command performs sync → freshness/integrity validation → reconciliation → predict → publication verification, requiring all eight symbols. Repeated runs are idempotent; they do not retrain/reselect. SQLite retains rollback journaling and FULL synchronization. Do not enable WAL or use a network-mounted database.

The publisher holds a SQLite writer reservation through checksum-envelope creation, file fsync, atomic replacement of `predictions.json` in the same directory, and directory fsync. The API validates checksum/schema, all-eight coverage, SQLite size/nanosecond timestamp before and after reading, source day and expiry. No files cross service boundaries.

During database updates and failed/incomplete runs, the API may return unavailable until a complete new publication exists. Previous bytes are preserved on incomplete generation, but database changes can invalidate them. There is an expected unavailable interval after UTC midnight until the scheduled run completes. Stale or mismatched numeric forecasts are never served.

SIGTERM stops scheduling and signals both Node and Python. After a bounded wait, remaining children are killed. SQLite rollback recovery and OS-released locks permit retry after interruption. Process failure exits the supervisor nonzero. Exhausted Railway restart retries require operator action. An image rollback does not roll back data.

For maintenance, disable the worker, redeploy and wait for it to exit before manual writes. Manual CLI writers use the same job lock; never delete a lock file to bypass ownership. After restoring/replacing a database, archive its old scheduler state so startup catches up against the replacement file. Do not edit database stamps/metadata to make invalid data appear current.

## Backups and restore

After a successful daily run, the supervisor uses SQLite's read-only online backup API into a unique temporary file, checks `PRAGMA integrity_check`, fsyncs and atomically promotes it under `/data/ml/backups`. It retains the seven newest verified backups and prunes only after a new backup succeeds. Source file stamps remain unchanged. `backup_failed` leaves existing backups intact and needs operator investigation; it does not take the guest app offline.

Same-volume backups do not protect against volume loss. Enable Railway's daily volume backup schedule in the service Backups tab, and periodically download a **completed backup** to private storage you control. Never download/copy the live database during writes. For example, list `/ml/backups` and use `railway volume files --volume investing-hub-data download /ml/backups/NAME.sqlite3 /private/NAME.sqlite3`. Never commit backups. [Railway backups and restore](https://docs.railway.com/volumes/backups).

Restore on an isolated environment/volume first. In the target service disable the worker, redeploy and wait for shutdown. Preserve the current database, publication, scheduler state and any journals. Upload/verify the chosen backup under a new staging name. Archive the old database under a distinct recovery name before installing the replacement; do not overwrite a running file. Archive the old publication and `scheduler.json`, restart with the worker disabled to repair ownership, inspect the database, then enable catch-up and verify all eight forecasts. Old filesystem stamps and old successful schedule dates do not describe a restored database.

## Verification and monitoring

```sh
curl --fail https://YOUR-DOMAIN/api/health
curl --fail https://YOUR-DOMAIN/api/capabilities
curl --fail https://YOUR-DOMAIN/api/predictions/BTCUSDT
```

Check every symbol from `shared/contracts.ts`: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT and LINKUSDT. HTTP 200 alone is insufficient: require `status: experimental`, positive `predictedValue`, current source day, future target and the expected existing model version. Before seeding/after expiry, unavailable with null prices is correct.

Verify `/`, `/predictions`, `/portfolio`, assets, refresh on SPA routes, guest portfolio persistence, CORS rejection and TLS. Missing API routes/assets must return 404. Restart/redeploy once and check data/selections/publication persist. Confirm each worker and Node run as UID 10001.

Railway logs show supervisor/daily/backup start, finish, failure and shutdown records. Through SSH, `python ml/pipeline.py daily-status --db /data/ml/lifecycle.sqlite3` reads detailed bounded logs (60 runs / 30 days). Watch stale predictions, provider restrictions, failed backups, timeouts, OOM restarts and volume growth independently of HTTP health. API unexpected-error logs contain a code/method, not credentials/request bodies or exception strings.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm ci --prefix .railway --ignore-scripts
npm --prefix .railway run typecheck
python -m unittest discover -s ml -p 'test_*.py'
docker compose config --quiet
docker compose build
docker build -t investing-hub-railway:test .
python deploy/railway/smoke.py
```

The Linux CI container smoke test uses a disposable volume and explicitly synthetic publication fixture. It checks custom PORT, health, routing, guest mode, all-eight API publications, invalidation, backup, restart/redeployment persistence and shutdown without live provider requests or training. Live provider availability, destination TLS and a production daily execution still require deployment verification.
