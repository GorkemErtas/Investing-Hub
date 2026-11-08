# Investing Hub mobile

Expo SDK 53 / React Native 0.79 / React 19.0. Native app files moved here after root shared/backend services were established. Existing application ID, EAS project ID, native Android project, Firebase client config and assets are retained.

## Run

From root: `npm ci`, `npm run build -w shared`, then `npm --prefix mobileapp ci`. Copy `.env.example` to `.env.local` and edit the public API origin. Run `npm --prefix mobileapp start` or `npm --prefix mobileapp run android`. Start the shared backend separately with `npm run dev:api`. Web and mobile can run independently; neither starts a second backend.

- Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000`.
- Physical device: use the computer's reachable LAN origin, with appropriate local firewall access.
- Browser preview: use the backend origin allowed by CORS; add the exact Expo web origin to `CORS_ORIGINS` when testing private requests.
- Production bundles require an HTTPS origin. Every `EXPO_PUBLIC_*` value is bundled publicly: never store credentials there.

Use a native development build; React Native Firebase custom modules cannot run in Expo Go. Notifications are opt-in via `EXPO_PUBLIC_FIREBASE_ENABLED=true` and the corresponding server capability. Android config is retained; real Firebase delivery must be tested against the owner's project. iOS requires macOS/Xcode and operator-supplied Firebase iOS configuration when enabling notifications. Browser preview uses memory-only sessions, links to learning videos and no native push module.

Native tokens use SecureStore. Legacy plaintext AsyncStorage tokens/profiles are removed at startup and require a fresh login. The app revalidates sessions at launch/foreground and on private API 401 responses. Guest theme/favorites storage keys are preserved. Server settings share one context; failures are shown, and a failed save keeps the settings screen open.

## Native and monorepo paths

Mobile is deliberately outside root npm workspaces to isolate React 19.0 from web React. `@investing-hub/shared` is a local package; all runtimes use the same built ESM exports and source TypeScript types. This avoids Metro/Node disagreement over relative `.js` specifiers. Shared code imports no React. `metro.config.js` watches shared/root dependencies and resolves mobile dependencies first. Root dependencies/shared must be installed before bundling.

`android/settings.gradle` and `android/app/build.gradle` resolve modules relative to the mobile project through Node. `custom-entry.js` installs the native background handler before Expo Router; `custom-entry.web.js` excludes Firebase. Android POST_NOTIFICATIONS and disabled OS backup are reflected directly in the retained manifest. Firebase foreground/token listeners unsubscribe when their scope ends. App config changes are not automatically synced into a retained native Android folder: review and apply native settings explicitly. Do not run `expo prebuild --clean` over custom native work casually.

Run EAS commands **from mobileapp**; keep the entire monorepo in the upload context, including `shared` and root lock/manifests. Do not copy just mobileapp to a standalone build directory. Existing `eas.json` retains the development profile. The `eas-build-post-install` hook installs the root/shared workspace subset and builds shared ESM, which is ignored in source uploads. EAS itself has not been run here. Release signing must be configured by the owner; the inherited debug signing assignment was removed from the release variant, so release artifacts are unsigned until owner-managed signing is configured. No release was published.

## Functionality and limits

Markets, search/favorites, daily/weekly/monthly movers, line/candle charts, Fibonacci analysis, themes, Learning Hub and account/portfolio CRUD remain. Prices are USDT; fixed fiat conversions and synthetic exchange ranks are removed. Charts show actual OHLCV in UTC, with stale/error/empty states. Numeric predictions and generated news are explicitly unavailable. Financial accounting uses the same Decimal replay ledger as web/server; missing quotes remain unavailable. Unsupported historical portfolio symbols/precision require operator review and are never silently converted/deleted.

Public data is deduplicated; polling pauses on background/hidden tabs and screens ignore late responses. Eight current pairs are supported. Legacy quotes/trades for MATIC, DOT, SHIB, TRX, LTC, AVAX, UNI, ATOM, ETC, XLM, BCH, APT, APE, FIL, NEAR, QNT, AAVE, AXS, SAND, VET, EGLD and EOS are explicitly blocked outside the tested market registry; the legacy list included retired pairs and is not blindly restored. Existing records remain in Mongo and require symbol/precision review, with no automatic deletion or reassignment. New price alerts require enabled server delivery. Unsupported historical favorites remain stored, but their quotes/alerts are unavailable. Transaction edit/delete API capabilities are retained even though the original mobile UI did not expose them.

## Checks

`npm --prefix mobileapp run typecheck`, `npm --prefix mobileapp test`, `npm --prefix mobileapp run doctor`, `npm --prefix mobileapp run lint`, and `npm --prefix mobileapp run test:browser` (builds a separate fixture-only browser export).

From mobileapp with a valid production URL: `npx expo export --platform android --output-dir dist-android`, or `--platform web --output-dir dist-web` for preview. Native validation: `android/gradlew.bat :app:assembleDebug --no-daemon --console=plain` on Windows. Bundle/export success does not prove native compilation or device behavior. See [actual verification and blockers](../docs/VERIFICATION.md).

## Local numerical predictions

The existing prediction client now accepts `experimental` numerical forecasts from `/api/predictions/:symbol`, with the model identity and target UTC timestamp. The detail view displays the unchanged USDT forecast and an experimental label; unavailable or expired forecasts never become placeholder prices. Training and inference remain offline Python operations. There is no generative-AI or research-review request. Existing authentication, settings, portfolio and notification contracts are unchanged.
