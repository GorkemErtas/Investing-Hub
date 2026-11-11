# Architecture

Investing Hub is one modular monolith with two platform-specific applications. It keeps a low-cost, database-free public composition and optional private mobile capabilities in the same API process.

```mermaid
flowchart LR
  Web[webapp: React guest demo] --> API[backend: Express TypeScript]
  Mobile[mobileapp: Expo native] --> API
  Web --> Shared[shared: contracts, Decimal ledger, analysis]
  Mobile --> Shared
  API --> Shared
  API --> Market[Binance public data]
  Binance[Verified daily Binance OHLCV] --> SQLite[(Existing local SQLite)]
  SQLite --> Local[Python features and chronological evaluation]
  Local --> Select[Best model per coin: RF / GB / Ridge / LSTM]
  Select --> Forecast[Local next-day inference]
  Forecast --> Export[Single numerical predictions.json]
  Export --> API
  API -. optional .-> Mongo[(Existing MongoDB)]
  API -. optional .-> Mail[SMTP verification]
  API -. optional .-> FCM[Firebase delivery]
  Task[Opt-in Windows daily task at 00:15 UTC] --> Daily[Existing CLI: sync / validate / reconcile / predict / verify]
  Daily --> SQLite
  Daily --> Forecast
```

## Boundaries

- `shared` depends only on Zod and Decimal. No DOM, React, AsyncStorage, filesystem or Express objects. Its pure ledger replays chronological transactions, capitalizes buy fees, deducts sell fees, preserves closed-position realized profit and refuses oversells/duplicate IDs. String inputs preserve eight-decimal precision; display conversion occurs after Decimal aggregation. Unknown valuations remain null.
- `backend/src/market` is the retained modern provider/cache/service implementation. The provider hostname is fixed, symbols/intervals allowlisted, candle UTC boundaries validated, and publication/fetch times distinguished. Cache TTL, stale limit, request deduplication, cold-failure backoff, provider concurrency/rate cooldown and request budgets bound costs.
- `backend/src/mobile` contains authenticated account, owned portfolio, settings, Mongo and notification services. Repository injection makes HTTP/service authorization and failure behavior testable without Mongo. Queries carry both owner and resource ID. Full-history validation and Mongo version predicates protect trade updates. Public routes do not read Mongo or send mail/push.
- `backend/src/app.ts` owns HTTP policy, validation and sanitized errors. `server.ts` owns environment composition and lifecycle. No active `server.js`, nested backend, ONNX runtime or public force-refresh endpoint remains.
- `backend/src/predictions` reads the single checksum/schema/registry-stamped numerical publication. It does not load models, invoke Python or contact a generative AI service. Missing/expired/corrupt forecasts are explicitly unavailable.
- `webapp/src/pages/PricePredictions.tsx` displays all eight numerical next-day USDT forecasts, target UTC dates and experimental labels. It has no research report, narrative, source iframe, consent or paid action.
- `webapp` retains browser-only guest transactions and the existing storage keys. It consumes shared accounting/contracts without requiring mobile account infrastructure.
- `mobileapp` owns native navigation, platform APIs and secure-token/preferences adapters. Its typed client validates contracts, scopes private data to the session and pauses polling in the background. Existing market, portfolio and authentication contracts remain compatible; the prediction contract supports numeric experimental values and explicit unavailability.
- `ml` owns completed UTC datasets, shared past-only features, comparable chronological training/evaluation, deterministic per-coin selection and the existing immutable forecast ledger. Ridge/Random Forest/Gradient Boosting and a CPU PyTorch LSTM are real candidates. `predict` publishes one numerical snapshot. No performance approval gates or duplicate publication paths exist. Historical artifacts/records are preserved; see [methodology](../ml/README.md).

`ml/daily.py` orchestrates the existing CLI operations under the same database file lock as manual writes. Generic checksum-protected atomic JSON lives in `ml/json_store.py`. The optional PowerShell scheduler contains no models or duplicate inference path; it invokes the repository virtualenv using absolute paths. Internal evaluation stays in SQLite and the `evaluate` CLI. [Daily operations](DAILY_UPDATES.md) documents UTC scheduling, bounded execution/logging and recovery.

## Package/build strategy

Root npm workspaces are `shared`, `backend`, `webapp`. A single root lock resolves those packages. Mobile has its own npm manifest/lock to preserve Expo SDK 53's supported React 19.0 version without duplicating React inside the native bundle. Shared has no React dependency. Node, Vite and Metro consume the same built ESM files; TypeScript uses source type declarations. Build shared before importing it at runtime. Expo's resolver could not map Node-style relative `.js` specifiers back to source `.ts`, so native source exports were replaced by the common compiled artifact.

Root build order is shared, backend, web. Root dev starts API and Vite, while mobile starts separately. Native Gradle paths resolve from the retained mobile project with Node. EAS runs from mobileapp, uploads the monorepo context and builds shared through the post-install hook. Web Docker and API Docker use the root context and exclude mobile/ML.

## Client localization

Both clients use i18next/react-i18next with explicit `tr-TR` and `en-US` resources, a Turkish default/fallback, and one framework instance per application. There is no browser/OS language detection, translation service, API locale parameter or backend dependency. `shared/localization.ts` contains genuinely common messages, stable backend-code mappings and pure Intl/decimal display helpers. Platform copy lives in `webapp/src/locales/{tr,en}.json` and `mobileapp/locales/{tr,en}.json`; add matching keys and interpolation variables to both dictionaries. Tests check parity. Missing keys resolve through Turkish resources, then a localized generic error rather than displaying a raw key.

Web mounts `I18nextProvider` once, updates `html.lang`, page titles and metadata, and stores its choice through the existing validated browser storage adapter. Expo loads the preference before rendering client screens and uses the existing AsyncStorage adapter. Both use the dedicated `ih:language:v1` key (web JSON string, mobile raw string); unrelated settings, portfolios and auth state are preserved. Selection updates immediately without reload; storage failure keeps the session language and shows a translated warning. The selector sits alongside web appearance preferences and in the mobile preferences bar, also available before login and while viewing Settings.

Components translate stable keys at render time so saved errors, lesson/quiz progress and selected chart points survive language switches. Backend codes and identifiers stay unchanged; clients do not display arbitrary provider error messages. Intl formats prices, quantities, percentages and dates only at the display boundary. UTC source/forecast times are labelled UTC; trade entry explicitly uses local time before conversion to the original UTC payload. Editable decimal values use the active separator while canonical strings and Decimal ledger calculations stay unchanged.

Application-owned navigation, forms, market/portfolio/prediction screens, lessons, quiz content, loading/empty/error states, dialogs, chart labels and accessibility text are translated. User-entered names, tickers, USDT and brands are retained. External YouTube video/audio content remains in its original language. Existing FCM notification bodies and background OS-displayed notification titles remain in the server's language because the unchanged contract carries rendered text rather than translation keys; foreground app-owned notification titles are localized. Permission sheets, keyboards and native date-picker chrome can follow OS language. Native devices and live FCM delivery require separate verification.

## Data compatibility and operational limits

No live database was rewritten. The Mongo adapter reads existing numeric transaction fields and writes new decimals as strings in the same fields; IDs, timestamps, user ownership and collection names remain. Old unknown symbols or precision outside the domain contract return an explicit review error without rounding/deleting data. Existing invalid open-ended Infinity alerts remain in storage but cannot deliver. Unsupported favorites remain readable.

The default is a single API process. Verification codes and request limits are in-memory. Guest state is local to its browser; mobile has private remote portfolios and local guest preferences. There is no automatic merging of guest and private ledgers, no trading execution, and no distributed background service. Alerts are best effort. SMTP/FCM and production account infrastructure require operator configuration. See [security](SECURITY.md) and [current verification](MVP_VERIFICATION.md) for actual checks and remaining limitations.
