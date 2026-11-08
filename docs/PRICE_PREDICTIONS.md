# Price Predictions: measured local run, 2026-11-08

The application now has one local numerical forecast pipeline and no third-party generative AI integration. This is a measured experiment record, not a claim of investment performance or future reliability.

## Completed execution

- Reused the existing SQLite history for all eight symbols. Incremental synchronization found zero missing current daily candles; no history was downloaded again.
- Backed up the database before writes. All existing source/candle/dataset/version rows, all 120 old model payloads/checksums and all 264 old predictions matched the backup afterwards. Prior selected status may be archived when a new model is selected; historical records are not deleted.
- Trained 32 real candidates: Ridge, Gradient Boosting, Random Forest and CPU LSTM for each symbol. All succeeded and numeric-JSON inference parity was within `1e-12`.
- Selected independently by each coin's aggregate selection-fold **price RMSE**, with 0.5% relative equivalence then fixed simplicity order. No quality, baseline, fold-win, prospective-sample or manual promotion gate exists.
- Generated eight genuine next-day prices and published one checksum/stamp-protected snapshot. Runtime snapshots, weights, database backup and machine-readable verification are ignored under `ml/data`; they are not committed.

## Method and reproducibility

Three chronological selection folds contain sixty common target days each, followed by ninety separate final-evaluation days. The final period is excluded from ranking. Every training label precedes the evaluation feature origin, all scalers use training inputs only, and every candidate shares the same target dates within a coin. The LSTM uses fourteen daily feature vectors, twelve hidden units, twelve fixed CPU Adam epochs and deterministic seeds; no early stopping or parameter search uses the final period. Production artifacts refit only after evaluation is frozen.

The final period is previously inspected history, not a pristine unseen test. Refitting on all available labels does not turn the final artifact's fit into an out-of-sample measurement. Scores below are those of the separate chronological evaluation fits. No RMSE-to-confidence conversion, invented interval or generative commentary exists.

Final evaluation feature origins begin 2026-08-09T23:59:59.999000+00:00; the last observed target closes 2026-11-07T23:59:59.999000+00:00. Each candidate has 90 final observations.

Verified environment: numpy 2.3.4, pandas 2.3.3, python 3.13.14, sklearn 1.7.2, torch 2.14.1+cpu. Seed: 42. Training source/config hashes and every model identity remain in SQLite. Current training-code SHA256: `7f406308e3d64e2575c8a44a099e97ed902c25bbb8b29b56a56ee3473cb7b0d4`.

## Selected models: actual final-period results

All MAE/RMSE values below are **price USDT**. Direction accuracy is an observed historical fraction expressed as a percentage. The no-change baseline is measured on the identical target dates.

| Coin     | Selected algorithm | Selection RMSE |   Final MAE |  Final RMSE | Final no-change RMSE | Final direction accuracy |
| -------- | ------------------ | -------------: | ----------: | ----------: | -------------------: | -----------------------: |
| BTCUSDT  | ridge              |    1400.084531 | 1091.903016 | 1645.228959 |          1653.307478 |                   50.00% |
| ETHUSDT  | gradient_boosting  |      56.211403 |   42.533424 |   67.773210 |            67.577669 |                   54.44% |
| SOLUSDT  | ridge              |       2.347930 |    2.175483 |    3.099834 |             3.110976 |                   55.56% |
| BNBUSDT  | gradient_boosting  |      12.872780 |   10.832947 |   15.264507 |            15.286583 |                   56.67% |
| XRPUSDT  | gradient_boosting  |       0.029887 |    0.032408 |    0.048800 |             0.048878 |                   48.89% |
| ADAUSDT  | gradient_boosting  |       0.007983 |    0.006109 |    0.008596 |             0.008615 |                   54.44% |
| DOGEUSDT | random_forest      |       0.002693 |    0.002082 |    0.003088 |             0.003058 |                   42.22% |
| LINKUSDT | ridge              |       0.246709 |    0.351681 |    0.468099 |             0.471981 |                   55.56% |

ETH and DOGE selected models underperformed the no-change baseline in this final period. Other differences are small. All still produce experimental forecasts; selection does not establish reliability. LSTM trained successfully for every symbol but was not selected in this run.

## All evaluated candidates

| Coin     | Algorithm         | Selection price RMSE | Final price RMSE | Final direction accuracy | Selected |
| -------- | ----------------- | -------------------: | ---------------: | -----------------------: | -------- |
| ADAUSDT  | gradient_boosting |             0.007983 |         0.008596 |                   54.44% | yes      |
| ADAUSDT  | lstm              |             0.008039 |         0.008533 |                   58.89% | no       |
| ADAUSDT  | random_forest     |             0.008070 |         0.008575 |                   61.11% | no       |
| ADAUSDT  | ridge             |             0.008040 |         0.008568 |                   52.22% | no       |
| BNBUSDT  | gradient_boosting |            12.872780 |        15.264507 |                   56.67% | yes      |
| BNBUSDT  | lstm              |            13.296911 |        15.304887 |                   52.22% | no       |
| BNBUSDT  | random_forest     |            12.884529 |        15.268389 |                   56.67% | no       |
| BNBUSDT  | ridge             |            13.114098 |        15.266625 |                   52.22% | no       |
| BTCUSDT  | gradient_boosting |          1395.122973 |      1655.607652 |                   51.11% | no       |
| BTCUSDT  | lstm              |          1460.923234 |      1643.204028 |                   51.11% | no       |
| BTCUSDT  | random_forest     |          1393.834518 |      1653.562079 |                   45.56% | no       |
| BTCUSDT  | ridge             |          1400.084531 |      1645.228959 |                   50.00% | yes      |
| DOGEUSDT | gradient_boosting |             0.002708 |         0.003056 |                   51.11% | no       |
| DOGEUSDT | lstm              |             0.002771 |         0.003107 |                   54.44% | no       |
| DOGEUSDT | random_forest     |             0.002693 |         0.003088 |                   42.22% | yes      |
| DOGEUSDT | ridge             |             0.002789 |         0.003062 |                   52.22% | no       |
| ETHUSDT  | gradient_boosting |            56.211403 |        67.773210 |                   54.44% | yes      |
| ETHUSDT  | lstm              |            58.628064 |        66.833319 |                   48.89% | no       |
| ETHUSDT  | random_forest     |            56.257191 |        67.261778 |                   54.44% | no       |
| ETHUSDT  | ridge             |            57.270658 |        66.851222 |                   56.67% | no       |
| LINKUSDT | gradient_boosting |             0.246165 |         0.470653 |                   53.33% | no       |
| LINKUSDT | lstm              |             0.253596 |         0.483593 |                   46.67% | no       |
| LINKUSDT | random_forest     |             0.246794 |         0.473362 |                   50.00% | no       |
| LINKUSDT | ridge             |             0.246709 |         0.468099 |                   55.56% | yes      |
| SOLUSDT  | gradient_boosting |             2.362573 |         3.107293 |                   52.22% | no       |
| SOLUSDT  | lstm              |             2.401329 |         3.141134 |                   44.44% | no       |
| SOLUSDT  | random_forest     |             2.357812 |         3.092369 |                   52.22% | no       |
| SOLUSDT  | ridge             |             2.347930 |         3.099834 |                   55.56% | yes      |
| XRPUSDT  | gradient_boosting |             0.029887 |         0.048800 |                   48.89% | yes      |
| XRPUSDT  | lstm              |             0.031273 |         0.048659 |                   51.11% | no       |
| XRPUSDT  | random_forest     |             0.029964 |         0.048080 |                   51.11% | no       |
| XRPUSDT  | ridge             |             0.030384 |         0.049053 |                   50.00% | no       |

## Verified checks

| Check | Actual result |
| --- | --- |
| Python `unittest` discovery | 55 passed, including all four trainable candidates for all eight synthetic assets and the complete local CLI |
| `npm test` | 110 passed: 43 shared, 62 backend, 5 web |
| Root TypeScript, web ESLint, production build | Passed; old compiled research modules removed before rebuilding |
| Web Playwright | 12 passed, covering numerical predictions, expiry, responsive navigation, Analytics Lab, market data, portfolio and learning |
| Mobile TypeScript, ESLint, unit tests | Passed; 4 unit tests |
| Mobile Expo web export and Playwright | Export passed; 1 full workflow test passed, including numerical predictions on the existing Trade page |
| Real SQLite / API integration | Eight generated prices exactly matched API output; all eight Analytics Lab responses exposed four comparable candidates and one selection |

Browser tests use explicitly synthetic fixtures; actual market-data training and the real API check are recorded separately above. Desktop and narrow-screen Price Predictions rendering were also visually inspected. Native Android/iOS compilation and device behavior were not rerun for this change.

## Operating order and limits

See [local CLI commands](../ml/README.md): `sync`, `train`, `evaluate`, `select`, `predict`, `status`, with optional `analytics` and `reconcile`. HTTP serves the already-generated snapshot through `/api/predictions/:symbol`. Backend/database path settings must identify the same database; a later database mutation requires republishing. Daily targets expire normally, so the verification does not schedule future forecasts or promise persistent freshness. Models/data are local and must be generated explicitly after setup. CPU timings and scores are environment-specific. No paid request, deployment or main-branch merge was performed.
