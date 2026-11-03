# Credential cleanup required before publication

Existing secrets must be treated as compromised even though their code paths have been removed. This rebuild has **not** rotated credentials, altered Git history, modified the three tracked environment files, staged files, or changed remote infrastructure. It never loads the legacy environment files. `.gitignore` does not untrack existing files.

Owner actions, in order:

1. Revoke the embedded Gemini/Google API key and every Gemini key stored in old environment files using Google AI Studio / the Google Cloud credential console. Review usage and billing. The demo does not need a replacement.
2. Rotate `CRYPTOPANIC_TOKEN` at CryptoPanic; remove access if unused. The demo does not need this integration.
3. Revoke/rotate `EMAIL_PASS` (including any Gmail app password), review the sender account's security activity, and remove unused email integration permissions. Do not publish `EMAIL_USER` unnecessarily.
4. Rotate database credentials embedded in `MONGO_URI`, restrict database network access, and review access to existing account/portfolio records. This demo does not connect to or migrate that database.
5. If any real JWT secret was used outside this checkout, rotate it and invalidate old sessions. The old fallback signing secret must never be used again. Registration, login, verification and JWT access have been removed from this demo.
6. Review old deployment/build configuration and logs for copies of these credentials. Do not put API secrets in `VITE_*`; those variables are browser-visible. The tracked root files contain a legacy API URL, which is also no longer used.
7. After creating any necessary private backups outside the repository, **you** can untrack the three files with the following exact command (it changes the Git index, so the agent has not run it):

   ```powershell
   git rm --cached -- .env .env.production backend/.env
   ```

   Keep only reviewed local configuration, or remove obsolete files yourself. `.env.example` contains variable names and safe non-secret values. Review all working-tree changes before staging your own commits.

8. Removing current files does not erase earlier commits, forks, clones, caches or deployments. Rotation is mandatory. Any future history cleanup is a separate owner decision and is outside this task.

# Guest-demo security boundaries

- No accounts, remote user data, database credentials, JWTs, mail or paid AI providers. Guest portfolio transactions remain in browser storage and are never submitted to the API. Local storage is not an authorization system, secure vault, synchronization service or backup.
- Only allowlisted read-only market and prediction-status endpoints exist. Legacy authentication, portfolio/settings mutations, news and force-refresh routes return 404. Tests verify both GET and POST removal.
- Exact-origin CORS, Helmet headers, strict symbol/interval/query validation, fixed provider hostname, public-request rate limiting, bounded provider concurrency, timeout/retry budget, provider cooldown, bounded cache and sanitized errors.
- `trust proxy` is disabled. In Compose, Nginx clients share the API's 120 requests/minute budget conservatively; spoofed forwarded headers cannot bypass it. Multi-user hosting would need an explicitly trusted proxy and edge-specific rate-limit review.
- Express accepts no bodies because there are no API writes. Nginx bounds request size. Do not restore old handlers or connect an old database to the public demo.
- Research artifacts use Python/joblib and are offline only. Loading an untrusted joblib file can execute code. No uploaded/downloaded model file is loaded by the web server.
- Docker publishes the web service on loopback only. Hosting is not deployed; public TLS, exposure and multi-instance controls remain operator responsibilities if a future deployment is requested.
