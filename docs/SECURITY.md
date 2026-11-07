# Security boundaries and owner follow-up

The local ML lifecycle accepts only allowlisted Binance HTTPS sources, verifies archive sidecars, bounds requests/ZIP parsing, and commits datasets transactionally. Registry inference interprets bounded numeric JSON rather than loading joblib, pickle or legacy ONNX files. Local dataset/artifact checksums detect accidental edits; they do not authenticate an externally supplied database. Keep the research database operator-owned, outside concurrent cloud sync, and back it up with the CLI. No remote artifact import, Python service, Gemini calls or public forecast activation is introduced. See [ML lifecycle security and rollback boundaries](ML_LIFECYCLE.md).

## Implemented

Free news collection contacts only fixed GDELT DOC 2.0 queries, reviewed official RSS and the public `sigp/lighthouse` releases API. No source key is required. Article/model-generated/pagination/asset URLs are never fetched; redirects, XML DTDs/entities and oversized payloads are rejected. GitHub release bodies and author/asset metadata are discarded, with links restricted to that project's releases. GDELT indexing is not publication time or fact-checking; unknown publication dates remain null. React validates the shared v2 response, escapes text and opens validated HTTP(S) links with `noopener noreferrer`; it cannot initiate collection or analysis. Optional Gemini requires an explicit flag, new private key and rotation acknowledgement; it has no search/URL tools and returns only evidence-linked classifications. Atomic state, durable independent budgets, pacing/cooldowns, retention and a process lock constrain failures. Diagnostics contain bounded reason codes, HTTP status and elapsed time, never raw errors or credentials. See [news security and source terms](NEWS_INTELLIGENCE.md).

Private API identity comes solely from bearer JWT validation (HS256, issuer, audience, subject and expiry). Mongo is opt-in and requires a strong explicit secret. Every portfolio fetch/update/delete uses both owner and ID; settings/push are only `/me` operations. Client user IDs are rejected. Auth inputs are strict, password bytes are bounded to bcrypt's 72-byte limit, verification codes are cryptographically random and hashed in bounded expiring storage with attempt/rate limits. Only public profile fields are serialized.

HTTP bodies are bounded; malformed JSON and unexpected/driver errors are sanitized. Exact-origin CORS, Helmet and rate limits protect the service. Proxy trust stays disabled, so spoofed forwarding headers do not bypass limits. In Compose, clients behind Nginx share a conservative IP budget; scaling needs an explicit trusted-proxy/rate-limit design.

Public market routes never connect to a database or perform account/notification work. Provider URLs are fixed, queries validated, concurrency/timeouts/retries/cache sizes bounded and stale status visible. No unauthenticated refresh, push test or model-specific inference route remains. Optional cached news reads use the isolated local snapshot and never call Gemini. No numerical ML model is loaded in runtime containers or bundles.

Native session tokens use SecureStore; browser preview tokens remain in memory. Old plaintext AsyncStorage sessions are removed and require login. Native backup is disabled, notification handlers/tokens have cleanup, and sensitive token/message/user logging was removed. One FCM token per account matches the old schema; offline logout cannot guarantee remote push detachment. Access tokens expire after one hour; there is no refresh endpoint or instant server-side JWT revocation.

## Credentials discovered in removed legacy source

The old server embedded Google/Gemini and CoinGecko keys. Remove/revoke those credentials at their provider and review historical deployments/logs; source deletion does not revoke credentials or erase Git history. Review any SMTP password, Mongo credentials, old JWT secret and Firebase Admin private keys previously used with the legacy service. No credentials were rotated and no external account changes were made here.

The initial tracked inventory contained URL configuration and safe env examples, not the secret-bearing tracked env files claimed by the earlier historical web report. Private ignored files were not printed, copied into docs or implicitly loaded. `.gitignore` does not remove secrets from history. No Git history/index operation was performed.

Firebase `android/app/google-services.json` is retained mobile client project configuration, not an Admin service-account private key. Review API-key restrictions in the owner's Google project. Actual Admin credentials must stay outside source and image contexts. Never put secrets in public Vite/Expo variables.

## Residual limits

Root workspace dependency audit reached zero known vulnerabilities after compatible patches and explicit Nodemailer/Firebase updates. Expo SDK 53 retains inherited toolchain/transitive advisories after compatible fixes; see VERIFICATION for exact counts and the separate SDK upgrade requirement. No blanket force upgrade or incompatible transitive override was applied to native dependencies.

Live Mongo, SMTP, FCM, device push and iOS behavior require separately configured integration checks. Existing database contents were never changed. Pending email verification is in-memory and lost on restart. Alerts are best effort; a crash after claim and before send can lose delivery. The application records simulated trades and cannot promise exchange execution, investment returns or notification delivery.
