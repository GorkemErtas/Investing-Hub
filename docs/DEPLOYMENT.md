# Local development and deployment

For a single-service Docker deployment with persistent ML storage, follow the [Railway guide](RAILWAY.md). Local Compose below remains a separate guest-demo option.

Root Node 24/26 and npm are required. Use `npm ci`, then `npm run dev`. API and web can be started separately with `npm run dev:api` and `npm run dev:web`. Mobile dependencies/configuration are under `mobileapp`; see its README. Shared builds are required before runtime imports; root dev/build/test scripts handle this. Rebuild shared after domain/contract edits.

## Docker guest demo

From root:

```powershell
docker compose config --quiet
docker compose up --build
```

This builds `backend/Dockerfile` and `webapp/Dockerfile` with the root context. The web proxy serves on `http://127.0.0.1:8080`; API remains internal. No database is started. Context excludes mobile, Python data/models, private env files, credentials, Git and local dependencies. Runtime API runs as the Node user; health checks and no-new-privileges are configured. Nginx includes CSP, browser security headers and `/api` routing. Public TLS and exposure remain host/operator responsibilities.

Docker Desktop was unavailable during verification: Compose syntax validation is distinct from actual image build/container startup. Consult VERIFICATION for actual results.

## Optional local prediction publication

Training/inference run separately in Python, never inside HTTP containers. Mount the already-generated `predictions.json` and matching SQLite database read-only and configure `PREDICTIONS_EXPORT_PATH` / `ML_DATABASE_PATH` to those paths. A database mutation invalidates the snapshot until `daily` (or an explicit `predict`) republishes. No numerical file means an explicit unavailable response. No external generative-AI key, consent flow or paid API service is required. See [local generation order](../ml/README.md). No deployment was performed by this refactor.

## Optional accounts

Use an existing secured Mongo database by setting the backend process environment. Keep its original database/collections; no automatic data migration runs. Never point a fresh empty database at the app while assuming existing users were migrated. SMTP is optional for existing logins but required for new verified registrations. For Firebase, use Application Default Credentials from a private external path; no credential is copied into an image.

The optional local Compose override starts Mongo only when explicitly selected:

```powershell
# Set JWT_SECRET in the current process to a privately generated random value.
docker compose -f docker-compose.yml -f docker-compose.mobile.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.mobile.yml up --build
```

The override retains the legacy `mongo_data` volume name and keeps Mongo's port private. Do not run `down -v` or change database versions against an existing volume without a reviewed Mongo upgrade and backup plan. The override uses Mongo 6 to preserve the original local image major; a supported production Mongo version/upgrade is an operator task. For physical mobile devices, explicitly expose the API through an appropriate TLS proxy/network binding; the default Compose API publication is loopback-only. Native clients use the same API origin; browser preview origins must be allowed explicitly by CORS.

Do not deploy the old JavaScript backend alongside the new API: new decimal-string transaction writes require the new adapter. Existing fallback-signed JWT sessions are intentionally rejected. One-hour access tokens have no refresh token; logout clears the native secure session and detaches push when online, but an already copied token remains valid until expiry. Rotate signing keys after suspected compromise.

## Production native builds

Run EAS from mobileapp with the full repository context. Production API URLs require HTTPS. Private values never belong in `EXPO_PUBLIC_*`. Verify Firebase client configuration for the owner's project. The inherited debug signing assignment was removed from the native release variant. Release artifacts remain unsigned until owner-managed signing is configured. iOS compilation requires macOS/Xcode and iOS Firebase configuration when push is enabled. No EAS build, app-store release, Docker deployment or public hosting was performed in this task.

## Optional host daily job

The Windows host can run the explicitly installed [daily task](DAILY_UPDATES.md) independently of Node, React and containers. It uses the repository `.venv`, current selected models and one local SQLite store. It is not installed by build/deployment/startup. Mount the publication directory and database read-only if using containers; replacing a single bind-mounted file atomically may leave a container on the previous inode, so mount the directory. Restart/reconfigure consumers after moving data paths. The installing Windows user must remain signed in and power/network policies must permit execution or catch-up. No deployment or scheduled-task installation was performed by this change.
