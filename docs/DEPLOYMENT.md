# Local development and deployment

Root Node 24/26 and npm are required. Use `npm ci`, then `npm run dev`. API and web can be started separately with `npm run dev:api` and `npm run dev:web`. Mobile dependencies/configuration are under `mobileapp`; see its README. Shared builds are required before runtime imports; root dev/build/test scripts handle this. Rebuild shared after domain/contract edits.

## Docker guest demo

From root:

```powershell
docker compose config --quiet
docker compose up --build
```

This builds `backend/Dockerfile` and `webapp/Dockerfile` with the root context. The web proxy serves on `http://127.0.0.1:8080`; API remains internal. No database is started. Context excludes mobile, Python data/models, private env files, credentials, Git and local dependencies. Runtime API runs as the Node user; health checks and no-new-privileges are configured. Nginx includes CSP, browser security headers and `/api` routing. Public TLS and exposure remain host/operator responsibilities.

Docker Desktop was unavailable during verification: Compose syntax validation is distinct from actual image build/container startup. Consult VERIFICATION for actual results.

## Optional news worker

Optional news workers use the same backend build: `node backend/dist/news/cli.js refresh` and `... prune` are finite commands. No timer is registered. A future timer should run refresh every 4-6 hours and prune at least daily, sharing `NEWS_STORAGE_PATH` on a persistent local volume with the API. The default directory inside a container is ephemeral and may be unwritable under the unprivileged runtime user. Mount/configure an owned writable persistent directory explicitly before enabling news. Multiple replicas/hosts and network filesystems need a separately reviewed coordination/storage design. Existing guest Compose remains disabled and unchanged. See [news operations](NEWS_INTELLIGENCE.md).

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
