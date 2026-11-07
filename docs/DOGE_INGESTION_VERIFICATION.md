# DOGE historical ingestion verification

Verified 2026-11-07 on the existing `feat/analytics-lab` branch. The initial working tree was clean. This fix extends the canonical Python validator/Store lifecycle; it adds no provider, database reset, model approval, scheduler or automatic forecast publication.

## Root cause and independent evidence

The publisher-checksummed January 2021 DOGE archive is valid. Its SHA-256 is `97eb6a9187e490a280b08b2fecdcd2b77593cf4063ee91f2a9df415ed947a6af`, matching the supplied finding. The 80% heuristic previously rejected genuine historical closing returns before synchronization could commit. A file integrity check cannot establish that market movements must remain below that heuristic.

The reviewed full-precision pairs are:

| UTC date   | Previous close | Close     | Return       |
| ---------- | -------------- | --------- | ------------ |
| 2021-01-02 | 0.0056800      | 0.0105264 | +85.323944%  |
| 2021-01-28 | 0.0074124      | 0.0364995 | +392.411365% |
| 2021-04-16 | 0.1823599      | 0.3654434 | +100.396798% |

The additional April event was found by scanning 2,682 completed official REST daily observations from July 5, 2019 through November 6, 2026. Both relevant monthly ZIPs and all six previous/current daily ZIPs passed publisher checksum verification. All seven normalized fields of those six reviewed observations matched official REST. Exact source URLs, archive/sidecar/response hashes, row fingerprints, review reasons and acquisition/review times are committed in `ml/reviews/historical_price_movements.json`. [Review procedure and primary source links](HISTORICAL_ANOMALY_REVIEWS.md).

A broader archive/REST comparison matched **every open/high/low/close and timestamp** across all 2,682 days, but their complete numeric fingerprints differ: volumes differ on five other dates (2020-10-27, 2021-01-11, 2021-01-21, 2021-12-24 and 2021-12-27). Their cause is not assumed. No volume revision or source blending was performed; publisher-checksummed archive observations and provenance remain intact. This discrepancy does not affect any of the six exact observations approved here, whose volume fields also matched. Further investigation would be required before any separate source correction.

## Actual command results

A read-only preservation snapshot and SQLite online backup were saved under ignored `ml/data/anomaly-review` before the targeted sync. Then:

```powershell
.\.venv\Scripts\python.exe ml/pipeline.py sync --symbol DOGEUSDT --db ml/data/lifecycle.sqlite3
.\.venv\Scripts\python.exe ml/pipeline.py validate --symbol DOGEUSDT --db ml/data/lifecycle.sqlite3
.\.venv\Scripts\python.exe ml/pipeline.py status --symbol DOGEUSDT --db ml/data/lifecycle.sqlite3
# Repeat sync: added=0, no provider requests or dataset version changes.
.\.venv\Scripts\python.exe ml/pipeline.py sync --symbol DOGEUSDT --db ml/data/lifecycle.sqlite3
```

All commands succeeded. Initial sync atomically added **2,682** DOGE daily observations, from **2019-07-05 through 2026-11-06**, with **89 source records, zero missing days and three explicitly approved extremes**. Dataset fingerprint: `9eca2573cac4313d2710f4dd415aecdc2b59c862b67f7175cba4ea0956661ed4`. The persisted anomaly audit contains all three review IDs and policy hash `4192a29a65c57a01b6a71cea124c992fe9ff3261a9bcc39dc9c6a1717c389fe0`.

Stored integrity verification and `prepare()` succeeded with the same source-bound policy. They produced **2,667** labeled training samples and a complete final inference feature row. No real-data model training/inference, approval, promotion, reconciliation or forecast export was executed. Training and candidate inference paths were exercised with isolated synthetic models in the regression tests.

## Preservation checks

Canonical row hashes before/after the targeted sync confirmed unchanged:

| Existing records                          | Preserved rows |
| ----------------------------------------- | -------------- |
| BTC/ETH/SOL/BNB/XRP/ADA/LINK candles      | 21,392         |
| Their source records                      | 713            |
| Their dataset metadata / dataset versions | 7 / 9          |
| All existing registered models            | 24             |
| All existing predictions                  | 24             |
| Existing performance snapshots            | 0              |
| Original audit event prefix               | 73             |

These checks cover entire row contents, not only counts. Original asset fingerprints, source metadata, model artifacts/status and pending prediction details did not change. The expected new DOGE dataset/source/version/sync audit records were added; no original records were removed or rewritten. Backups, raw downloads, command output and SQLite files remain ignored and are not committed. Export snapshots tied to the previous registry stamp are invalidated as designed and were not automatically regenerated.

## Tests and implementation

`python -m unittest discover -s ml -p 'test_*.py' -q`: **74 passed** (58 existing plus 16 focused review regressions). Cases cover exact approved data without numeric changes, unreviewed symbol/date, missing source context, changed price/volume, archive/sidecar/evidence mismatch, invalid/missing/ambiguous policy, threshold-raising refusal, cross-month combined validation, missing datasets, source/audit tampering, revocation, transaction rollback, preservation of an existing partial dataset, legacy import, training and candidate inference prerequisites, and an additional extreme that remains rejected until its own exact evidence is added.

Initial focused tests exposed a daily-archive case missing from the synthetic provider fixture and CSV parser precision loss during legacy import. The fixture was completed and legacy CSV loading now uses round-trip float parsing; matching remains exact rather than adding a tolerance. The final focused and full Python suites passed. Existing negative-path fixture logs for provider/backup/invalid-data tests are expected; no outstanding Python failures remain. Documentation/reference checks and `git diff --check` also passed. TypeScript/browser suites were not rerun for this Python-only change.

`validate_candles()` accepts only exact reviewed observations above the unchanged unreviewed threshold. Ingestion propagates source attribution into batch and combined validation; `Store` verifies source identity and recorded review audit; training passes the same verified context into `prepare()`. Inference, reconciliation, Analytics Lab and publication prerequisites reuse the Store validator. Training/research code fingerprints include the review implementation and policy. No global or DOGE-wide exception exists.

The policy file is trusted, code-reviewed configuration rather than cryptographically signed evidence. A different archive revision or REST response/query is not implicitly approved; independently verify and pin new evidence before retrying. The five non-reviewed volume disagreements above remain a separate source-reconciliation question; prices were preserved. Data observation approval never implies model readiness or future accuracy. See [the operator guide](HISTORICAL_ANOMALY_REVIEWS.md) for the exact approval contract, diagnostics and extension steps.
