> Archived migration/verification record. Commands and branch statements below describe an earlier release. Current setup is in [README](../../README.md), [ML operations](../../ml/README.md) and [current verification](../MVP_VERIFICATION.md).

# Consolidation implementation report

Implemented locally on the initial `main` branch. All modifications remain unstaged and uncommitted. Git history and configuration were preserved. No live database mutation, external messaging, publication, app-store build or deployment was performed.

## Final structure

```
backend/       one Express/TypeScript API, tests, optional mobile adapters
shared/        universal contracts, decimal ledger/notional, analysis, typed client
webapp/        retained modern guest UI, browser storage, regression tests
mobileapp/     Expo screens/components/context/native assets/config, isolated npm lock
ml/            one offline Python pipeline, reports, one legacy-model archive
docs/          current audit/architecture/API/security/setup/review evidence
```

The root npm workspace owns shared/backend/web; Expo is isolated to preserve React 19.0/RN 0.79 compatibility. Dependency inspection confirmed one React 19.3.1 in the web workspace and one React 19.0.0/RN 0.79.6 in the mobile graph. Node, Vite and Metro resolve the same compiled shared ESM; universal source contains no runtime-specific adapters or React dependency.

## What changed

- Reused modern public market provider/cache services, validation, source/fetch timestamps, stale indicators, timeout/retry/cooldown budgets and consistent HTTP errors.
- Added optional email-verified registration, bcrypt-compatible login, strict JWT validation, public profile serialization and owned portfolio/settings/push services. Private routes use bearer identity and owner-scoped queries. Database initialization/failure and unavailable Firebase delivery leave public routes usable.
- Preserved existing Mongo collections/IDs/legacy transaction field names with a non-destructive adapter. Decimal strings, fees, full chronological replay and optimistic revision checks now govern trade writes. Unsupported/invalid historical ledgers are preserved with explicit review errors. No silent portfolio-list truncation remains.
- Centralized portfolio accounting, exact gross notionals, symbols/intervals, OHLCV and prediction contracts. Fixed aggregate conversion precision, stopped changing global Decimal configuration, and preserved tiny transaction quantities in mobile history.
- Retained web design, local guest keys/format, charts, learning, themes, portfolio workflows and honest disabled forecasts. Extracted/tested browser storage recovery without changing persistence behavior.
- Replaced mobile HTTP/IP duplication with a typed schema-validating client, public-only cache/deduplication, secure native/memory web session adapters, shared settings state and focus-aware data fetching. Account changes hide old private views and ignore late responses; duplicate trade submissions are guarded.
- Mobile charts now consume actual candle OHLCV; Fibonacci uses completed observed ranges. Removed fixed fiat conversion rates, numeric legacy model forecasts, generated headlines and invented exchange statistics, with explicit unavailable/limited states. Kept learning and native-specific UI; preview videos link safely to YouTube.
- Repaired Expo SDK 53 patch alignment, missing icon paths, missing Router helper dependency, entry ordering/platform separation, Android permission/backup settings and EAS shared-build setup. Removed obsolete server dependencies, Wagmi/Reanimated/slider/disabled OTA updater and redundant navigation declarations. Release debug signing was removed; owner credentials are required for signed release artifacts.
- Moved mobile files last, after shared/backend services existed. Moved Python source/config/reports intact to root. Both old model sets were hash-identical; one checksummed archive remains, with no ONNX runtime dependency or runtime artifact loading.
- Replaced obsolete Docker paths with root build contexts, guest defaults and an explicit mobile override retaining the original Mongo volume/image major. Updated setup, environment examples, architecture, security and migration documentation.

## Actual verification

| Area                                                                         | Result                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shared / backend / web production build                                      | Passed                                                                                                                    |
| Workspace TypeScript / web lint                                              | Passed                                                                                                                    |
| Shared unit regressions                                                      | 24 passed                                                                                                                 |
| Backend HTTP/security/ownership/market/compatibility/concurrency regressions | 45 passed                                                                                                                 |
| Web storage unit tests                                                       | 2 passed                                                                                                                  |
| Mobile TypeScript / JS lint / typed adapter tests                            | Passed; 3 tests                                                                                                           |
| Modern web browser workflows                                                 | 4 passed                                                                                                                  |
| Mobile preview browser workflow                                              | 1 passed, freshly exported fixture build                                                                                  |
| Mobile Android Hermes export                                                 | Passed, 1,559 modules and 4.85 MB final bundle                                                                            |
| Mobile web export                                                            | Passed, seven static routes; test export about 2.54 MB                                                                    |
| Offline Python pipeline tests                                                | 6 passed                                                                                                                  |
| Built server with unreachable Mongo                                          | Passed public liveness/disabled-prediction and private-unavailable behavior                                               |
| Expo config                                                                  | Passed                                                                                                                    |
| Expo Doctor                                                                  | 16/18, two documented warning categories; exit 1                                                                          |
| Root npm audit                                                               | 0 vulnerabilities                                                                                                         |
| Mobile npm audit                                                             | 41: 4 high, 36 moderate, 1 low, 0 critical                                                                                |
| Compose guest/mobile configuration                                           | Passed syntax validation                                                                                                  |
| Docker execution                                                             | Not run: engine unavailable                                                                                               |
| Native Android APK                                                           | Not built: online SSL downloads stalled; offline dependency check failed on uncached AARs after configuration/autolinking |
| Live Mongo/SMTP/FCM, iOS, device/EAS/release                                 | Not verified here                                                                                                         |
| New ML training or publication                                               | Not performed; existing experiment reports preserved and predictions remain disabled                                      |

Detailed commands, evidence and limitations are in VERIFICATION.md. The public provider's live regional availability is not guaranteed by fixture-based regression tests. A completed Metro export/browser test does not establish native device correctness.

## Remaining acceptance limits

Native Android completion requires working Google/Maven artifact access; iOS requires macOS and its provider config. Retained native settings need deliberate app-config synchronization. Chart-kit remains flagged as untested on the New Architecture. Mobile's inherited SDK/toolchain advisories require a separate tested upgrade before production acceptance. Existing unsupported symbols/precision must be reviewed before those historical ledgers can be used through the new contract. Only eight market pairs are enabled; mobile README lists every blocked legacy pair. Account/signup/push require their optional services and real delivery verification. Credential rotation and release signing remain owner actions. No unsupported model was activated.

## Review material

- MIGRATION_AUDIT.md: initial findings and plan with original source references.
- API_COMPATIBILITY.md: every old mobile endpoint and its replacement/removal.
- CHANGE_INVENTORY.md: full path inventory; REVIEW_GUIDE.md: logical Conventional Commit groups and exact owner-run staging commands.
- ARCHITECTURE.md, DEPLOYMENT.md, SECURITY.md and application READMEs: current operation and boundaries.

Historical web-only reports are labeled under `docs/historical-web`. No implementation work relies on the obsolete server or nested backend.
