# Free news collection and optional analysis

News collection uses the **GDELT Project DOC 2.0 API**, reviewed official RSS and official Lighthouse software-release metadata through GitHub's public REST API. It requires no API key or subscription. The React Research Lab displays real cached BTC/ETH metadata. Gemini is an independent, optional model-only analysis step. Collection never calls Gemini, including when a key exists. Public `GET /api/news/insights/:symbol` reads cached snapshots only.

Collection defaults off (`NEWS_INTELLIGENCE_ENABLED=false`). AI analysis separately defaults off (`NEWS_AI_ANALYSIS_ENABLED=false`). No scheduler, background job or deployment is registered. The ML lifecycle, numeric predictions, portfolio accounting and existing web/mobile flows are unchanged.

## Windows PowerShell: collect without secrets

Run from the repository root with a supported Node.js version (24 or 26). Environment variables apply to the current PowerShell process and its children; `.env` files are not loaded automatically by these commands.

```powershell
npm ci
npm run build

$env:NEWS_INTELLIGENCE_ENABLED = 'true'
$env:NEWS_AI_ANALYSIS_ENABLED = 'false'
$env:GEMINI_API_KEY = ''
$env:GEMINI_KEY_ROTATED = 'false'
$env:NEWS_GDELT_ENABLED = 'true'
$env:NEWS_ETHEREUM_RSS_ENABLED = 'false'
$env:NEWS_ETHEREUM_RELEASES_ENABLED = 'true'
$env:NEWS_STORAGE_PATH = Join-Path $env:LOCALAPPDATA 'Investing-Hub\news'

npm run news:collect -w backend
npm run news:status -w backend
npm run news:analyze -w backend
npm run news:prune -w backend
```

`analyze` above safely reports `not_configured` with zero Gemini requests. `collect` makes finite, bounded requests and then exits. Repeating collection within the cache TTL reports `cache_hit`. `status` reports collection/analysis capabilities, source coverage, per-coin event counts, counters and cooldowns. A successful command can have partial or empty coverage; inspect its output rather than assuming all providers supplied news.

Inspect the stored, validated metadata without any network activity:

```powershell
$newsEnvelope = Get-Content -Raw -LiteralPath (Join-Path $env:NEWS_STORAGE_PATH 'state.json') | ConvertFrom-Json
$newsState = $newsEnvelope.payload | ConvertFrom-Json
$newsState.collection.coverage | Format-Table sourceId, status, accepted, rejected, reason
$newsState.snapshots.BTCUSDT.events | ForEach-Object { $_.evidence } |
    Select-Object title, sourceName, sourceUrl, publishedAt, indexedAt, observedAt
$newsState.snapshots.ETHUSDT.events | ForEach-Object { $_.evidence } |
    Select-Object title, sourceName, sourceUrl, publishedAt, indexedAt, observedAt
```

Treat this file as application state; do not edit the payload or checksum manually. In the same configured terminal start the API:

```powershell
npm start -w backend
```

In a second terminal, inspect both cached API responses:

```powershell
$btcNews = Invoke-RestMethod 'http://localhost:5000/api/news/insights/BTCUSDT'
$ethNews = Invoke-RestMethod 'http://localhost:5000/api/news/insights/ETHUSDT'
$btcNews | Select-Object symbol, status, freshness, reason, lastCheckedAt
$ethNews | Select-Object symbol, status, freshness, reason, lastCheckedAt
$btcNews.data | Select-Object analysisStatus, model, summary, outlook
$ethNews.data.events | ForEach-Object { $_.evidence } |
    Select-Object title, provider, sourceName, sourceUrl, publishedAt, indexedAt
```

For another API process/terminal, set `NEWS_INTELLIGENCE_ENABLED` and the **same** absolute `NEWS_STORAGE_PATH` before starting it. A GET cannot create or refresh a snapshot, regardless of query parameters. Only BTCUSDT and ETHUSDT are supported; invalid symbols/queries are rejected by the existing route.

Keep that configured API terminal open. In a second terminal run `npm run dev:web` from the repository root and visit `http://localhost:3000/research`. The BTC/ETH selector reads each coin's stored cache. “Check cache” repeats only that GET, with automatic cache reads every five minutes while the page is visible. There is no collect/analyze button or browser provider SDK. An empty or disabled installation displays its actual unavailable state rather than demo headlines.

## Source policy and verified terms

The original feed URLs/terms were inspected on **2026-11-06**; GDELT parameters and Lighthouse/GitHub documentation and terms were reviewed on **2026-11-07**. Accessibility and terms can change; an accessible feed alone is not a redistribution license. Adapters retain only short titles, canonicalized original links, dates and attribution. RSS descriptions, `content:encoded`, release bodies/assets, article bodies, logos and images are discarded. Original article links are never fetched. Attribution is included in each snapshot and publisher identity in each evidence record.

| Source                   | Official endpoint                                                                                                                              | Terms and use in this implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GDELT Project            | [DOC 2.0 endpoint](https://api.gdeltproject.org/api/v2/doc/doc), [API documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)  | [Project terms](https://www.gdeltproject.org/about.html#termsofuse) permit dataset reuse for academic, commercial and governmental purposes with GDELT attribution and a link. Store ArticleList metadata only, include the original publisher/domain and link to [GDELT](https://www.gdeltproject.org/). These permissions do not grant a license to publishers' full articles. This is not the separately licensed GDELT Cloud product.                                                                                                                       |
| Federal Reserve Board    | [All releases](https://www.federalreserve.gov/feeds/press_all.xml), [monetary policy](https://www.federalreserve.gov/feeds/press_monetary.xml) | [Disclaimer](https://www.federalreserve.gov/disclaimer.htm) allows reuse of Board information unless indicated otherwise; acknowledge the Board. Third-party material and protected marks are excluded. Only relevant headline metadata is retained.                                                                                                                                                                                                                                                                                                            |
| Bitcoin Core             | [English RSS](https://bitcoincore.org/en/rss.xml)                                                                                              | Site [COPYING](https://github.com/bitcoin-core/bitcoincore.org/blob/master/COPYING) applies the [MIT license](https://github.com/bitcoin-core/bitcoincore.org/blob/master/LICENSE) unless otherwise marked. Keep source attribution and applicable license notices with any further licensed reproduction. This collector stores only release/security headline metadata and links.                                                                                                                                                                             |
| SEC                      | [Press releases RSS](https://www.sec.gov/news/pressreleases.rss), [official feed directory](https://www.sec.gov/about/rss-feeds)               | The [website dissemination policy](https://www.sec.gov/about/privacy-information) permits copying/distributing public information with citation. Third-party copyrights and SEC seals/logos are excluded. Only dated, crypto-relevant headline metadata is retained.                                                                                                                                                                                                                                                                                            |
| Ethereum Foundation Blog | [English RSS](https://blog.ethereum.org/en/feed.xml)                                                                                           | The old `/feed.xml` redirects here; the adapter uses this verified direct URL. [Terms](https://ethereum.org/terms-of-use/) cover the blog and include personal-use and automated-access restrictions, alongside a general non-code CC BY notice and exceptions. The live feed also carries an all-rights-reserved notice. **Default disabled**; do not infer permission for automated ingestion from RSS availability or the general CC notice. Enable `NEWS_ETHEREUM_RSS_ENABLED=true` only after an appropriate permission/terms review for the intended use. |

GDELT uses three fixed, English-language query groups: Bitcoin/BTC, Ethereum/ETH, and crypto regulation/ETFs/exchanges/security/institutional developments. Each uses documented `mode=artlist`, `format=json`, `maxrecords=25`, `timespan=72h`, `sort=datedesc`. Parsed titles must independently pass crypto relevance checks. There is no general URL-fetch endpoint, user-supplied query or unofficial scraping path.

Lighthouse is an [Ethereum consensus client maintained by Sigma Prime](https://github.com/sigp/lighthouse), with an [Apache 2.0 repository license](https://github.com/sigp/lighthouse/blob/stable/LICENSE). The fixed endpoint is [`GET /repos/sigp/lighthouse/releases?per_page=10`](https://api.github.com/repos/sigp/lighthouse/releases?per_page=10). GitHub documents [unauthenticated access to public releases](https://docs.github.com/en/rest/releases/releases#list-releases) and a shared [60 requests/hour/IP unauthenticated limit](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api). Its [API terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms) and [information-use policy](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies#7-information-usage-restrictions) were reviewed for this bounded use of public, non-personal release metadata. This adapter stores only the release name/tag, official release link and `published_at`, with Sigma Prime/Lighthouse attribution. It does not reuse release prose, software, assets or author data, or claim that the code license grants rights to every external item. Any broader reproduction needs its applicable notices/permissions.

`NEWS_ETHEREUM_RELEASES_ENABLED=true` enables this independent source within intentionally enabled collection. One API request fetches at most ten releases; no pagination or asset requests occur. Drafts, prereleases, future/invalid dates, off-project links and old releases are excluded. Infrequent stable software releases use their own default **30-day** window (`NEWS_RELEASE_LOOKBACK_HOURS=720`), while RSS stays at fourteen days. The title is explicitly labeled a Lighthouse release, and its actual publication date stays visible. This adds Ethereum-specific technical announcements, not broad ETH news coverage or evidence of market impact. GitHub 403 with exhausted-limit headers and HTTP 429 cause durable cooldowns with no immediate retry.

RSS requests accept only the fixed configured URLs, reject redirects and validate item links against the issuer's host. SEC access may vary by network; failure does not suppress other sources. The Ethereum adapter and deterministic tests are present, but routine collection does not request it by default.

## Metadata, uncertainty and coverage

The endpoint retains its route and returns `news-insight-v2`. This focused news contract changes the former experimental v1 shape; `shared/hybrid.ts` and numeric prediction contracts are unchanged. Evidence lives under `data.events[].evidence`:

| Field                                             | Meaning                                                                                                                                                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publishedAt`                                     | A validated RSS publication date or official release `published_at`; never Git tag/commit creation time. Always `null` for GDELT ArticleList.                                                                         |
| `indexedAt`                                       | GDELT `seendate`, meaning first seen by the index. `null` for official RSS/releases. Never substituted for `publishedAt`.                                                                                             |
| `observedAt`                                      | Time this collector retrieved the accepted metadata. Retained fallback evidence keeps its original observation time.                                                                                                  |
| `sourceUrl`, `publisherDomain`, `sourceName`      | Original publisher link/identity. Display-only HTTP originals keep their scheme; they are not silently upgraded or requested. Unsafe links, credentials and tracking/secret query parameters are rejected or removed. |
| `provider`, `providerUrl`, `sourceResponseSha256` | Index/feed provenance, provider attribution link and response fingerprint. Raw response bodies are not persisted.                                                                                                     |
| `reliability`, `contentLevel`                     | `official_primary` or `news_index`; all accepted content is `headline_only`. Official issuer identity does not independently verify an announcement's claims.                                                         |
| `scope`, `symbols`, `category`                    | Conservative headline/issuer relevance tags. Market-wide metadata can apply to both coins; these tags are not AI sentiment or price predictions.                                                                      |

Without a configured/enabled model, snapshot `analysisStatus` is `not_configured`, `disabled` or `not_analyzed`; `model`, `summary`, `analyzedAt`, event quotes and explanations are null. `outlook`, event sentiment and potential impact are `unknown`. No AI summary or positive/negative impact is fabricated. Index evidence is explicitly `unverified_reporting`; an index record cannot be promoted to a primary statement by model output.

Collection alternates BTC/ETH selection, favors official announcements and newer dates, normalizes URLs and deduplicates syndicated headlines. Each coin has at most eight events; shared market-wide evidence counts toward both limits, with at most sixteen distinct stored records. Selection cannot create missing ETH-specific evidence. Lighthouse releases improve technical coverage, but if they are absent/old/unreachable and GDELT fails, ETH may still have only market-wide announcements or insufficient evidence. Ethereum Foundation RSS remains disabled.

`coverage` distinguishes `ok`, `partial` (some rejected metadata), `empty`, `unavailable`, `rate_limited`, `cooldown` (local backoff) and `disabled`. Rejection counts include irrelevant, old and malformed input candidates; accepted counts precede deduplication and final selection. Consult event provenance and observation dates as well as coverage; these indicators do not measure truth or market completeness.

Coverage includes `httpStatus` and `elapsedMs` when measured, with null defaults for older v2 files. Locally skipped requests have neither an HTTP status nor a request duration. Sanitized reasons distinguish:

| Reason                                 | Meaning                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `request_timeout`                      | The configured request deadline elapsed; no successful response is implied. |
| `http_rate_limit`                      | An actual HTTP 429 or exhausted GitHub 403 was observed.                    |
| `provider_rate_limit`                  | GDELT returned an explicit plain-text throttling notice.                    |
| `local_cooldown`                       | Persisted backoff suppressed the request; no new HTTP response exists.      |
| `no_matching_articles`                 | A valid response contained no articles/releases.                            |
| `no_relevant_articles`                 | Valid records were outside the relevance/date/stable-release filters.       |
| `invalid_response` / `invalid_records` | Whole-response parsing failed / supplied records failed validation.         |
| `some_records_rejected`                | Some candidates were filtered or invalid; accepted metadata remains usable. |

On complete outage, the last valid collection remains stale and the latest failed source checks remain available to `status` and cached readers. Showing newer diagnostics does not extend `lastCheckedAt`, expiry or retention of stored headlines. A malformed GDELT response also imposes a local five-minute cooldown; no extra query is sent to probe the same failure.

Research Lab labels GDELT time **Indexed at**, with **Published at: Unknown**, and never presents indexing as publication. It shows source attribution, category, coin-specific versus market-wide scope, retrieval times, cache freshness/last check, and expandable source coverage. Stale headlines stay visible with a warning; unavailable and insufficient states have explicit messages. With optional AI off it says **AI analysis not enabled**, retaining headlines without inferred sentiment/impact. Only validated analyzed items can show classifications, exact headline quotes and high uncertainty. Links use `noopener noreferrer`, text is escaped, and response validation rejects unsafe schemes, credentials and local/IP links before rendering.

The response reports `available`, `insufficient_evidence`, `stale` or `unavailable` and independent freshness. Cache freshness means the collection was checked recently, not that every headline was just published. RSS uses a default fourteen-day window because Core release/security announcements are infrequent; GDELT metadata is limited to 72 hours. Social media/X, full articles, live market completeness and independent fact-checking are outside this implementation.

## Optional Gemini configuration later

Use a newly issued private key; never reuse exposed legacy credentials. No key is needed for the preceding workflow. In a configured PowerShell terminal, read the key without writing it into command history:

```powershell
$newsGeminiSecret = Read-Host 'New private Gemini API key' -AsSecureString
$newsGeminiPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($newsGeminiSecret)
try {
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($newsGeminiPointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($newsGeminiPointer)
    $newsGeminiSecret.Dispose()
}
$env:GEMINI_KEY_ROTATED = 'true'
$env:NEWS_AI_ANALYSIS_ENABLED = 'true'

npm run news:collect -w backend
npm run news:analyze -w backend
npm run news:status -w backend
```

`GEMINI_KEY_ROTATED` is an operator acknowledgement, not a technical check that a key was rotated. `analyze` requires fresh collected evidence and never fetches sources. It skips an unchanged evidence/model analysis, and it cannot run without both the key acknowledgement and explicit AI flag. Restart the API under the intended flags/key to expose optional cached analysis; an unconfigured/disabled reader returns source-only data even if the file contains older analysis.

The existing pinned Gemini SDK makes normal structured model requests with no grounding, search, URL context or other tools. It receives only accepted headlines and limited metadata. External text is untrusted data; injection patterns are filtered, model output has strict enum-only classifications, evidence IDs and exact headline quotes, and arbitrary narrative/URLs/price targets are rejected. Explanations are assembled from accepted labels and point to the source evidence. All headline analysis has high uncertainty and explicitly says the linked article was not read or fact-checked. A model failure preserves the collected news.

To stop optional analysis in this terminal:

```powershell
$env:NEWS_AI_ANALYSIS_ENABLED = 'false'
Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
$env:GEMINI_KEY_ROTATED = 'false'
```

## Operations and storage

| Setting                          | Default / behavior                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NEWS_INTELLIGENCE_ENABLED`      | `false`; explicit opt-in for collection and cached serving.                                                           |
| `NEWS_AI_ANALYSIS_ENABLED`       | `false`; independent explicit opt-in for Gemini.                                                                      |
| `NEWS_GDELT_ENABLED`             | `true` within enabled collection. Can be disabled for RSS/release-only operation.                                     |
| `NEWS_ETHEREUM_RSS_ENABLED`      | `false`; automated-access terms require review/permission.                                                            |
| `NEWS_ETHEREUM_RELEASES_ENABLED` | `true` within enabled collection; official Lighthouse public releases API, no token.                                  |
| `NEWS_RELEASE_LOOKBACK_HOURS`    | `720` (30 days), allowed 24–720; stable software releases only.                                                       |
| `NEWS_LOOKBACK_HOURS`            | `336` for RSS; allowed 24–720. GDELT has a fixed 72-hour window.                                                      |
| `NEWS_CACHE_TTL_SECONDS`         | `21600` (six hours), allowed four–six hours. Fresh collections skip source requests.                                  |
| `NEWS_RETENTION_HOURS`           | `72` from collection generation, allowed 24–168. Readers hide expired evidence; collect/prune remove it.              |
| `NEWS_MAX_DAILY_SOURCE_REQUESTS` | `48` attempted source requests per UTC day. Failed attempts count.                                                    |
| `NEWS_GDELT_MIN_INTERVAL_MS`     | `6000` minimum, persisted across finite runs; three queries, one attempt each per collection.                         |
| `NEWS_PROVIDER_TIMEOUT_MS`       | `20000` per attempt. RSS and optional Gemini have at most three attempts with bounded backoff for transient failures. |
| `NEWS_MAX_DAILY_REQUESTS`        | `16` attempted Gemini requests per UTC day; separate from source budget.                                              |
| `GEMINI_MODEL`                   | `gemini-3.5-flash-lite`; only used by explicit analysis.                                                              |
| `NEWS_STORAGE_PATH`              | Defaults to ignored `backend/.news-data`; use a stable local persistent directory outside OneDrive for operation.     |

GDELT and Lighthouse have no immediate retries. HTTP 429 respects `Retry-After` with a minimum fifteen-minute GDELT cooldown (one hour if unspecified). Plain-text GDELT throttling notices also trigger cooldown. Other GDELT failures wait five minutes. Remaining GDELT queries in that run are suppressed by shared, durable cooldown; healthy RSS/release collection still completes. Default volume is at most eight source requests per normal uncached run, plus bounded RSS retries; Ethereum Foundation RSS opt-in adds one. Local budgets do not guarantee upstream availability or a free Gemini quota.

Partial outages retain still-valid evidence from the failing provider alongside healthy new metadata, with coverage warnings. A complete outage preserves the last valid snapshot, which becomes stale after TTL. Identical evidence preserves its generation time and optional prior analysis; `lastCheckedAt`/`expiresAt` reflect successful rechecks, and `analyzedAt` separately records model processing time. Retention still limits the original collection's lifetime.

Storage remains checksum-validated, size-bounded, atomic and protected by an exclusive `refresh.lock` directory shared by collect/analyze/prune. The historical lock filename is retained. Reservations are persisted before requests, so failure cannot silently reset budgets. The checksum detects accidental corruption; it is not authentication against a writer with filesystem access. No keys or raw provider error payloads are written into state/logs. Only the latest bounded collection and two snapshots are kept, alongside up to 31 usage-history entries and separate cooldowns. Gemini token/cost counters are estimates for the configured known model; failed or unpriced requests remain explicitly unknown. Source-only operation consumes no Gemini tokens or model budget.

Use one machine with persistent local storage. Network filesystems, synchronized folders, ephemeral containers and independent replicas are unsuitable for this local lock/budget design. There is no automatic lock stealing: after a crash, inspect `refresh.lock/owner.json`, verify the owner host and PID have stopped, then remove only that verified lock directory. Do not erase state to bypass budgets/cooldowns.

Legacy version-1 files are checksum-checked, their incompatible snapshots invalidated, and validated usage/history plus Gemini cooldown retained. A public read performs no migration write and reports no snapshot. The next collect/prune publishes version 2 and drops obsolete provider metadata. Recollect before expecting v2 API data. Build before using the equivalent compiled commands, for example `node backend/dist/news/cli.js collect` from the root.

## Future hybrid ML + LLM work

The existing `shared/hybrid.ts` remains a future contract. A next integration should join only metadata actually observed by the forecast origin, retain unknown publication times, preserve model/evidence versions and reject stale or missing inputs explicitly. Headline sentiment should remain a qualitative evidence annotation; it must not manufacture numerical forecasts or confidence. Compare any frozen hybrid candidate with ML-only and no-change baselines using real prospective observations, keep promotion separate and explicit, and retain the disabled publication gate until approved evidence supports a future change. Historical news/2026 data already inspected cannot be relabeled as untouched evaluation. No hybrid inference, training hook or automatic approval is added here.

See [verification results and commit groups](NEWS_VERIFICATION.md). No timers or deployment are enabled. Commits and push follow the owner's explicit request after implementation review.
