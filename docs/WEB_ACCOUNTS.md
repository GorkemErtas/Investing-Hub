# Optional web accounts

The web app opens in **Guest Demo without login**. Public markets, candles, predictions, lessons and guest simulated portfolios work without MongoDB, email credentials or a JWT secret. Sign In opens an optional responsive dialog with Turkish/English login, registration and email-code verification. There is no first-visit redirect or automatic guest-data import.

## API and data separation

The web app reuses shared Zod contracts and `createApiClient` with the existing `/api/capabilities`, `/api/auth/register`, `/api/auth/verify`, `/api/auth/login`, `/api/me`, `/api/me/settings`, `/api/portfolios` and transaction endpoints. Backend hashing, verification, bearer validation, ownership checks, ledger rules and optimistic revision checks are retained.

Account portfolios use server-generated IDs and authoritative responses. CRUD and trade edits never replace a whole portfolio array on the server. Failed writes remain errors; there is no fabricated successful save or automatic write retry. Reload data before retrying an ambiguous timeout or revision conflict.

Guest portfolios, watchlist and theme keep their existing `ih:*` localStorage keys. Signed-in data/preferences come from the account API and stay in memory. They never overwrite guest storage. Account watchlist changes preserve historical unsupported favorites; only supported assets display market prices. Logout, expiry or refresh restores Guest Demo. No import UI/migration is included; a future import must require an explicit user action.

Account outages show translated errors and a retry option when loading fails. Public pages remain usable; Log Out restores Guest Demo even while account storage is down. Unknown account data is shown as unavailable rather than as an invented empty portfolio/balance.

## Session policy

The existing bearer token stays **only in JavaScript memory**, in a client scoped to that login. It is never written to localStorage, sessionStorage, IndexedDB, cookies, URLs or Vite environment variables. `/api/me` must validate the session before the account workspace opens. Private responses never enter the public query cache.

The backend token expires after one hour. A timer, resumed-page checks and authenticated 401 responses clear private data and restore Guest Demo. Each login gets a distinct scope; delayed success/error responses from old sessions cannot populate another account or log out its owner. Closing the sign-in dialog cancels acceptance of a pending login.

**Refreshing/closing the page loses the sign-in.** Sign in again to access saved server portfolios. This avoids silently adding persistent token storage while retaining the bearer API. It does not eliminate XSS risk; retain CSP, HTTPS and dependency/security practices. See [OWASP's browser-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage).

Logout discards this browser's token. The existing backend has no revocation/refresh endpoint: a separately copied token can remain valid until its original expiry. Server revocation or an HttpOnly cookie/BFF session requires a separate auth design. Do not weaken verification, extend expiry or broaden CORS to work around sign-in errors.

## Railway account and email settings

Keep the [existing Railway architecture](RAILWAY.md): one Docker service/replica, one `/data` ML volume, the daily worker and `/api/health`. Accounts use the existing optional Mongo integration, not SQLite. This feature provisions no database/service and changes no ML storage, models, publication or scheduling.

Configure these **backend runtime Railway Variables**, never frontend build arguments or `VITE_*`:

| Variable              | Purpose                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGO_URI`           | Intended existing secured Mongo database, with TLS/network access and a least-privilege application user. Preserve existing database/collections; do not assume users migrated to an empty database. |
| `JWT_SECRET`          | Privately generated random value of at least 32 UTF-8 bytes. Keep stable across routine restarts. Rotation invalidates existing tokens.                                                              |
| `BREVO_API_KEY`       | Brevo transactional email API key. Preferred HTTPS provider on Railway; use an API key, not a Brevo SMTP key. Configure together with `EMAIL_FROM`.                                                  |
| `SMTP_URL`            | Optional fallback when `BREVO_API_KEY` is unset. `smtps` for implicit TLS (usually port 465), or `smtp` with required STARTTLS (usually 587). URL-encode special characters in credentials.          |
| `EMAIL_FROM`          | Bare sender email address authorized by the selected provider, such as `accounts@example.com`. Required with either provider. Display names are not accepted here.                                   |
| `CORS_ORIGINS`        | Exact public HTTPS origins, comma-separated, without paths/trailing slashes.                                                                                                                         |
| `TRUST_RAILWAY_PROXY` | True only when Railway's HTTP edge is the sole untrusted ingress; both public and auth limits use its overwritten `X-Real-IP`. No TCP proxy/untrusted direct private callers.                        |

The auth limit remains 15 requests per client per 15 minutes, in addition to the public API limit. Arbitrary `X-Forwarded-For` chains cannot change a client's identity. Direct/local deployment leaves proxy trust false.

Set secrets through Railway Variables; do not commit `.env` files, put credentials in screenshots/logs or bake them into images. The app does not automatically load `.env` files. When managing an existing service with IaC, import/preserve existing private variables before applying configuration; do not replace them with the minimal guest example.

Without Mongo, account affordances explain unavailability and Guest Demo remains active. With Mongo but no email provider/sender, verified users can sign in while registration is disabled with a helpful message. Capabilities report configuration/readiness, not proof of email delivery. Provider failures remain errors; verification is never bypassed.

Provider selection is deterministic:

| Runtime configuration                                             | Registration delivery                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `BREVO_API_KEY` + `EMAIL_FROM`                                    | Brevo HTTPS API; no SMTP URL required.                        |
| `SMTP_URL` + `EMAIL_FROM`, no Brevo key                           | Existing SMTP transport.                                      |
| Both provider credentials + `EMAIL_FROM`                          | Brevo takes precedence; SMTP is unused.                       |
| No provider credentials or sender                                 | Registration disabled; existing-user login remains available. |
| Provider credentials without sender, or sender without a provider | Startup rejects the incomplete configuration.                 |

Empty variables count as unset. Invalid sender addresses, whitespace in API keys, and malformed/non-SMTP URLs are rejected at startup. Every supplied provider is validated, including an unused SMTP URL, so remove stale invalid settings. SMTP is a configuration fallback: unset `BREVO_API_KEY` to select it. A Brevo error does not trigger an automatic SMTP resend or retry, which could duplicate delivery after an ambiguous timeout.

For Railway environments where SMTP TCP ports 587, 2525 and 465 time out despite working DNS, configure `BREVO_API_KEY` and an authorized `EMAIL_FROM` in backend runtime Variables. The backend sends a JSON `POST https://api.brevo.com/v3/smtp/email` with the `api-key` header, sender, recipient, subject and the existing plain-text verification message, following the [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email). Requests use HTTPS port 443 with a ten-second `AbortSignal.timeout` and reject redirects and non-2xx responses. Brevo 4xx/5xx responses (including rate limits), network failures and timeouts return HTTP 503 `EMAIL_UNAVAILABLE` through the existing auth error handling and discard the pending code. API keys, codes, SMTP credentials and provider payloads are never logged or returned in errors.

Registration retains the existing six-digit code, ten-minute expiry, five-attempt bound and one-minute request cooldown. Pending codes live in backend memory, so redeployment requires requesting a new code. Return to Create account and re-enter details after the cooldown to request another code. Verification does not automatically sign in. Existing emails receive the same non-enumerating registration response.

## Acceptance in an isolated configured environment

1. Leave account variables unset. Open `/`, `/portfolio`, `/predictions` and `/learn` without a forced login. Save a guest portfolio/watchlist/theme; refresh and verify persistence. `/api/health` stays healthy.
2. Configure the intended Mongo database and a strong JWT secret without any email provider or sender. Capabilities should report accounts true/registration false. Verify existing-user login, disabled registration and translated wrong-password errors.
3. Configure `BREVO_API_KEY` and `EMAIL_FROM` without `SMTP_URL`. Register a controlled test email, confirm actual delivery, reject a wrong/expired code, verify a valid code, then explicitly sign in. Passwords require at least 12 characters and at most 72 UTF-8 bytes. Confirm `/api/me` bootstrap. In an isolated environment with SMTP access, also test the SMTP pair with the Brevo key unset.
4. Create/rename/delete an account portfolio; add a buy, edit it, reject an oversell and remove a trade. Verify persistence after signing in again and through the existing mobile API. Preserve server IDs and decimal strings.
5. Compare guest storage before/after account edits/preferences: it must be unchanged. Logout restores Guest Demo. Refresh while signed in returns to Guest Demo; signing in again retrieves saved account portfolios.
6. Use a second verified account and confirm separate portfolios/settings. Backend integration tests also check unauthorized reads, rename/delete and every trade operation against another owner's IDs.
7. Expire a token or return an authenticated 401. Private dialogs/data should clear, Guest Demo should remain usable and no login modal should open automatically. Tokens/passwords must be absent from persistent browser storage.
8. Make Mongo unavailable in an isolated environment. Account operations should fail clearly while public markets, lessons and predictions stay usable. Retry after recovery, preserving guest data. Verify TR/EN, light/dark, keyboard Escape/focus and narrow screens.
9. Verify the Railway volume, daily job, selected models and prediction consistency are unchanged. Run the existing Docker smoke checks before any approved deployment.

No live Mongo/email-provider/Railway configuration or production deployment is part of this implementation. Browser tests use explicit HTTP fixtures; backend tests exercise real auth/portfolio services with isolated repository fixtures. Actual delivery and persistence against a configured Mongo instance require the steps above.

## Automated checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

Unit coverage includes `/me` bootstrap, expiry, cancellation, old-session responses, active server 401s, CRUD/precision/oversells, user isolation and outages. Browser coverage includes registration disabled, register/verify/login errors, CRUD/preferences, guest storage isolation, refresh/logout, expiry with an open private dialog, outage behavior and TR/EN/mobile accessibility, alongside existing Guest Demo regressions. Backend tests retain bcrypt/JWT, verification/ownership coverage and check per-client Railway auth limits. Email tests mock Brevo HTTPS to cover success, provider precedence, 4xx/5xx responses, timeout/network failure, sanitized `EMAIL_UNAVAILABLE`, pending-code cleanup and retries, invalid configuration, and SMTP TLS/credential/message regressions. These tests do not send real email or require production credentials.
