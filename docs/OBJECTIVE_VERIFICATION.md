# Phase 2 verification

Local verification on 2026-11-16 used Node 26.13.0 and Python 3.13.14 on Windows.
Results are software checks; synthetic fixtures never count as forecasting evidence.

| Check | Result |
|---|---|
| Complete Python discovery suite | 90 passed, 57.7s |
| Shared JavaScript contracts | 50 passed |
| Backend unit/service/HTTP suite | 115 passed; two real-Mongo tests skipped locally |
| Web unit/localization suite | 12 passed |
| Complete Playwright browser suite | 26 passed, 32.8s |
| Root TypeScript checks | Passed |
| Shared/API/web production build | Passed; existing bundle-size advisory remains |
| Web lint | Passed, zero warnings |
| Real completed-study catalog → worker → built Node v3 reader | 32 bundles; 64 unavailable objectives; 24 bundles retain development evidence |
| Source CSV / normalized Parquet hash recheck | 96/96 each unchanged; 4,204,800 source rows |
| Original price report comparison against pre-Phase-2 commit | Unchanged |
| Committed objective evidence validation | 24 pair hashes, 768 trials, chronology, multiplicity and eligibility checks pass |

Commands from repository root:

```powershell
$env:OMP_NUM_THREADS='1'
$env:OPENBLAS_NUM_THREADS='1'
.\.venv\Scripts\python.exe -m unittest discover -s ml -p 'test_*.py'
npm test
npm run typecheck
npm run build
npm run lint
npm run test:browser
```

New Python coverage includes target alignment, future feature mutation, exact
peer timestamps, finite tail parity, train/calibration/evaluation purging,
temperature calibration, valid zero-variance QLIKE, baselines, numeric export
parity, native GARCH recursion alignment, future confirmation rejection,
independent objectives, cache generation time, expiry and two-page provider bounds.
Committed evidence tests run without local raw datasets or weights.

API/shared tests cover normalized calibrated probabilities, chronology, independent
availability, premature confirmation, checksum/size bounds and stale publication.
Existing v1/v2 API tests continue to pass. Browser coverage includes objective,
horizon and coin switching, expiry without a new request, independent availability,
unavailable/error states, expandable experimental price disclosure, Turkish and
English, dark and light themes, narrow screens and preserved chart controls.
Successful-looking browser values are explicitly future-dated synthetic fixtures.

The catalog/worker check used isolated ignored paths under
`ml/data/objective-runtime-check`, preserving normal daily and minute publications.
The first manual check required creating that output directory; worker locks
require an existing parent directory. The Python publication payload is a checked
JSON string inside its envelope; Node reads it through the shared bounded loader.
No numerical candidate or worker flag was activated for these checks.

[PR CI run 43858847974](https://github.com/GorkemErtas/Investing-Hub/actions/runs/43858847974)
passed for implementation commit `4d76f77`, including Linux Python, real Mongo,
web, mobile and Docker smoke checks. The final evidence/hardening commit triggers
the same checks; its current status is linked from PR #9. A local Docker daemon
was unavailable, so local Docker execution is not claimed. No Railway service was
used for testing or deployment.

Training, inference, provider measurements, uncertainty and the disclosed 5.7s
optional-explanation budget overrun are in [the findings](OBJECTIVE_FINDINGS.md).
Research reproduction requires the ignored supplied CSV/Parquet files; CI tests
do not download them or fit market models. Package versions and research source
hashes are stored per pair in [the evidence index](../ml/reports/objectives-phase2/evidence.json).
