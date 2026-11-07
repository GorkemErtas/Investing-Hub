# Exact historical price-movement reviews

The 80% absolute daily-return gate identifies observations requiring source review. It does not prove an extreme price movement is erroneous. DOGE's January 2021 archive passed its publisher checksum but contained genuine returns exceeding that heuristic, so the previous validator rejected ingestion before any dataset could commit.

The threshold remains **80% for unreviewed data**. Configuring a larger threshold is now rejected. A committed, exact observation review can admit verified historical data without clipping prices, changing model approval rules or exempting a symbol generally.

## Independently verified observations

Official Binance monthly ZIPs were downloaded and verified against their publisher `.CHECKSUM` sidecars. A separate official REST history request was compared against the archives, including **all seven normalized OHLCV/timestamp fields** for the previous/current observations. Publisher-checksummed daily ZIPs were also fetched and matched. These are independent retrievals through official delivery paths, not evidence from a separate exchange or a claim of independent third-party attestation.

| DOGEUSDT UTC date | Exact previous close | Exact close | Closing return |
| ----------------- | -------------------- | ----------- | -------------- |
| 2021-01-02        | 0.0056800            | 0.0105264   | +85.323944%    |
| 2021-01-28        | 0.0074124            | 0.0364995   | +392.411365%   |
| 2021-04-16        | 0.1823599            | 0.3654434   | +100.396798%   |

The January 2021 ZIP SHA-256 is `97eb6a9187e490a280b08b2fecdcd2b77593cf4063ee91f2a9df415ed947a6af`, matching the reported value. April's ZIP SHA-256 is `bdad24537d4da2d76e2ec3136a056a1eefa15cecfda1636ecf1ca6e9d11f13e1`. The full completed DOGE REST history from its July 5, 2019 listing through November 6, 2026 contained exactly these three >80% movements; the additional April event received the same source review rather than a broad exemption.

Sources:

- [January monthly ZIP](https://data.binance.vision/data/spot/monthly/klines/DOGEUSDT/1d/DOGEUSDT-1d-2021-01.zip) and [publisher checksum](https://data.binance.vision/data/spot/monthly/klines/DOGEUSDT/1d/DOGEUSDT-1d-2021-01.zip.CHECKSUM).
- [April monthly ZIP](https://data.binance.vision/data/spot/monthly/klines/DOGEUSDT/1d/DOGEUSDT-1d-2021-04.zip) and [publisher checksum](https://data.binance.vision/data/spot/monthly/klines/DOGEUSDT/1d/DOGEUSDT-1d-2021-04.zip.CHECKSUM).
- [Official REST corroboration covering both months](https://data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT&interval=1d&timeZone=0&startTime=1562284800000&endTime=1648684799999&limit=1000), [kline documentation](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints) and [archive/checksum documentation](https://github.com/binance/binance-public-data).
- All six daily ZIP URLs, publisher hashes, sidecar hashes, REST response hash and retrieval timestamps are recorded in `ml/reviews/historical_price_movements.json`. Raw downloads remain ignored local research data.

## Approval contract and trust boundary

`ml/anomaly_reviews.py` loads a bounded, versioned, strict policy file. Each review binds:

- Exact shared-catalog symbol and UTC date, with a unique `symbol/date` ID.
- The immediately previous UTC daily candle and the current daily candle.
- Unrounded closing prices as decimal strings, plus SHA-256 fingerprints of **all normalized candle fields**, including volume.
- Explicit source evidence covering those exact dates/symbols. A publisher-verified archive and a separate official REST corroboration are required in the review record.
- Verification method, review time and reason. These approvals were created after the source checks requested by the repository owner; they are not model approvals.

At runtime both actual row fingerprints and exact decimal price values must match. Their source attribution must match a pinned evidence URL, response hash, publisher/sidecar hashes where applicable, provider, units, interval and timezone. Retrieval time must follow candle completion. Legacy CSV imports must retain the pinned original archive URL/hash, pass their own CSV/manifest checks and reconstruct floats without parser precision loss. No numerical tolerance or rounded-price substitution is used.

An arbitrary REST query, archive revision, different symbol/date, altered volume/price or missing source does **not** inherit an approval. Existing reviews include the actual monthly and daily archive evidence plus the exact REST response used in verification. A different repair transport/response needs its evidence reviewed and explicitly added; a known symbol or official-looking URL is insufficient. Rejected and missing/ambiguous policies fail closed. Duplicate JSON keys and duplicate observation identities are refused.

The policy is trusted, code-reviewed repository configuration. SHA-256 detects content changes; it is not a signature and cannot protect against an operator who controls both code and data. Validators do not make network calls or create approvals automatically. There is no `allow_all`, symbol-wide exemption or threshold-raising flag.

## One policy across the lifecycle

1. Initial batches validate with symbol and downloaded-source attribution. Structural errors, incomplete candles and checksum failures remain fatal.
2. Combined validation checks the complete candidate dataset with old and new source mappings. This also detects movements at archive/month boundaries, where a batch alone has no preceding candle.
3. Only successful combined validation can persist a dataset. Dataset/version metadata records the review IDs, observed returns, status and canonical policy hash. Original numeric dataset fingerprints are unchanged by the new metadata.
4. `Store.verified_frame()` verifies the numeric fingerprint, source metadata hashes and manifest, then re-runs the same exact review policy and checks the recorded review audit. Revoked/changed approvals or missing audit records are rejected without rewriting data.
5. Training's `prepare()` receives verified symbol/source context and revalidates against the same policy. Inference, reconciliation, publication prerequisites and Analytics Lab already read `Store.verified_frame()` and therefore use the same rules. Training/research code hashes now include the review implementation and policy file.

No original candle, source or forecast is corrected or relabeled. SQLite transactions preserve the previous dataset if any later batch, cross-boundary movement, checksum or review fails. A review approves an observation's source evidence only: training remains candidate-only, promotion still requires explicit historical/prospective approval, and publication remains a separate gated action.

## Diagnostics and adding another review

Anomaly errors include symbol, UTC date, observed signed return/percentage and `anomaly_review_status`. Statuses distinguish `unreviewed`, `observed_values_mismatch`, `source_evidence_mismatch`, `nonconsecutive_previous_candle` and `invalid_review_policy`. Accepted observations log `approved` plus their review ID and appear in data-quality/audit metadata. Cross-gap observations cannot use an approval for a consecutive daily pair.

For another real extreme movement:

1. Preserve the failed sync and current database. Read the diagnostic; do not increase the 80% threshold or edit a candle.
2. Download the relevant official archive and sidecar, verify the filename and SHA-256, and inspect the full-precision previous/current UTC daily observations.
3. Retrieve the same observations through the official REST endpoint and, where available, publisher-checksummed daily ZIPs. Compare every normalized field. Preserve response/sidecar hashes and acquisition times privately.
4. Add a **specific** reviewed observation and its evidence to the tracked policy, using the one-row normalized fingerprint representation. Do not add price ranges, date ranges, wildcards or unverified source hashes. Review the diff and tests before use.
5. Rerun the original sync. A source revision or discrepancy stays blocked until separately investigated. An additional approval changes the policy/code fingerprint; existing dataset audits retain their original decision hash, while current reads still recheck active approvals.

Do not silently retrofit an existing unreviewed dataset audit. Preserve it and its provenance for operator review. No command resets the database or creates a model approval.

Normal commands remain:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py sync --symbol DOGEUSDT
.\.venv\Scripts\python.exe ml/pipeline.py validate --symbol DOGEUSDT
.\.venv\Scripts\python.exe ml/pipeline.py status --symbol DOGEUSDT
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py' -q
```

Use the same explicit `--db`/`INVESTING_HUB_ML_DB` for all commands when using a custom local database. Sync changes the registry file stamp, invalidating earlier export snapshots as designed; no forecast or grounded report is republished automatically. Follow [the verification record](DOGE_INGESTION_VERIFICATION.md) for actual results and [ML operation](../ml/README.md) for backup/approval boundaries. Binance source-data licensing and local/non-commercial research restrictions remain unchanged.
