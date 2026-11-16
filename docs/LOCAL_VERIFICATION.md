# Local-first finalization verification

Historical verification of the QLIKE-first local policy. The current MAE-first
comparison and additional checks are in [selection quality](SELECTION_QUALITY.md);
dated measurements below remain unchanged.

Verified on Windows with Node 26.13.0 / Python 3.13.14. These checks introduce no
new fitting or hyperparameter experiments. Existing trained artifacts are selected
by the documented development-only rule; previous research evidence is unchanged.

| Check | Result |
|---|---|
| Complete Python regression suite | 94 tests passed |
| Shared contracts / backend / web unit tests | 51 / 115 / 12 passed; two real-Mongo cases skipped locally |
| Complete Playwright browser suite | 27 passed |
| PowerShell `dev.ps1 -Check` and Node `local:check` | Passed |
| TypeScript including new local scripts, production build, web lint | Passed |
| Real Binance cycle using existing artifacts | 24 direction + 24 volatility + 24 price numerical outputs |
| Frozen artifact SHA verification | All 72 copied artifacts match trained source hashes |
| Real UI-to-API numerical comparison | Direction probabilities, volatility and price matched |
| Real browser offline / natural expiry / reconnect | Expired numerical outputs removed; fresh values recovered |
| Missing registries, actual worker CLI | 32 unavailable price / 64 unavailable objective states; no invented numbers |
| Original CSV / Parquet files | 96 + 96 files still match original hashes |
| Ctrl+C cleanup | Zero remaining application listeners / local ML workers |

The initial one-shot real-provider cycle took 18.84s; a full stack cycle took
17.81s. These local observations include bounded network input and are not
tail-latency guarantees. One worker uses a maximum of two network threads and one
numerical thread. It shares candle/feature/model caches; no HTTP request retrains.

The reproducible `npm run verify:local` script uses a live local API and browser,
without request interception, synthetic predictions or a fake clock. Its measured
observation is recorded in [the real UI evidence](../ml/reports/local-real-ui-verification.json).
Those dated values are historical software-verification evidence, not a publication
consumed by the application and not an assessment of forecast accuracy. Screenshot:
`.npm-cache/local-real-ui/desktop-actual.png` (ignored local artifact).
The regular 27 browser scenarios use explicit synthetic fixtures for controlled
API/offline/expiry/independent-objective/English/Turkish/theme/mobile coverage.

Native-library-to-portable serialization/inference parity is exercised in the
full Python model tests. Real local artifact copies preserve exact bytes and their
previous recorded export parity; the real-provider check confirms finite numerical
inference. No model was retrained to manufacture parity or a successful benchmark.
New selection tests verify that poor baseline-relative performance, failed former
gates and future confirmation do not block local experiments, while missing or
corrupt artifacts remain unavailable. Final holdout changes do not affect ranking.

Backend regressions cover existing portfolio/account authorization, market data,
v1 daily and v2 price APIs. CI runs the real Mongo integration, Linux, mobile and
retained Docker compatibility tests; the final run is linked in PR #9. A local
Docker daemon was unavailable and Docker is not needed to run the application.
Railway was not contacted or deployed.

The new policy changes availability, not historical model quality. QLIKE-selected
volatility models can have worse MAE than a baseline; one-minute models do so for
all eight assets. Some intervals are very wide because of zero minute returns.
The UI shows actual metrics and negative improvements explicitly. Research-trained
weights can drift; historical scores are not current-market calibration or evidence
of trading profit. See [Turkish ML summary](ML_YEREL.md) and
[all local selections](../ml/reports/local-selection.json).

All source data, prior reports, SQLite, historical models and daily scheduling
were preserved. Temporary verification snapshots used isolated ignored paths.
No new service/scheduled task, merge, model deletion or external deployment occurred.
