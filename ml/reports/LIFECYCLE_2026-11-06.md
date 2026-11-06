# Daily lifecycle run: 2026-11-06

Binance Vision data; noncommercial research. Derived research results: CC BY-NC-SA 4.0 and [Vision Dataset Terms](https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md).

Initial sync: 3,368 completed daily candles per pair, 2017-08-17 through 2026-11-05 UTC, no gaps or duplicates. 222 checksum-verified monthly archives and two official REST batches. Repeat sync added zero rows; repeat training reused all 24 versions.

All candidates remain inactive. None met both the 2% selection return-RMSE improvement and 3/4 walk-forward wins. No forward actuals are available yet. Twenty-four shadow forecasts were recorded before their 2026-11-06 UTC target close; these are explicitly unvalidated and are not published by the API.

| Pair | Algorithm | History window | Selection return RMSE | No-change RMSE | Fold wins | Historical gate |
| --- | --- | --- | --- | --- | --- | --- |
| BTCUSDT | gradient_boosting | full | 0.02079466 | 0.02086239 | 2/4 | fail |
| BTCUSDT | random_forest | full | 0.02076168 | 0.02086239 | 2/4 | fail |
| BTCUSDT | ridge | full | 0.02072454 | 0.02086239 | 2/4 | fail |
| BTCUSDT | gradient_boosting | 3y | 0.02086961 | 0.02086239 | 1/4 | fail |
| BTCUSDT | random_forest | 3y | 0.02082722 | 0.02086239 | 2/4 | fail |
| BTCUSDT | ridge | 3y | 0.02096271 | 0.02086239 | 1/4 | fail |
| BTCUSDT | gradient_boosting | 2y | 0.02129095 | 0.02086239 | 1/4 | fail |
| BTCUSDT | random_forest | 2y | 0.02102240 | 0.02086239 | 1/4 | fail |
| BTCUSDT | ridge | 2y | 0.02121142 | 0.02086239 | 1/4 | fail |
| BTCUSDT | gradient_boosting | 1y | 0.02170638 | 0.02086239 | 0/4 | fail |
| BTCUSDT | random_forest | 1y | 0.02126399 | 0.02086239 | 0/4 | fail |
| BTCUSDT | ridge | 1y | 0.02142121 | 0.02086239 | 0/4 | fail |
| ETHUSDT | gradient_boosting | full | 0.02874137 | 0.02884427 | 2/4 | fail |
| ETHUSDT | random_forest | full | 0.02863116 | 0.02884427 | 3/4 | fail |
| ETHUSDT | ridge | full | 0.02857251 | 0.02884427 | 1/4 | fail |
| ETHUSDT | gradient_boosting | 3y | 0.02874750 | 0.02884427 | 1/4 | fail |
| ETHUSDT | random_forest | 3y | 0.02851760 | 0.02884427 | 2/4 | fail |
| ETHUSDT | ridge | 3y | 0.02884938 | 0.02884427 | 0/4 | fail |
| ETHUSDT | gradient_boosting | 2y | 0.02927012 | 0.02884427 | 0/4 | fail |
| ETHUSDT | random_forest | 2y | 0.02873381 | 0.02884427 | 2/4 | fail |
| ETHUSDT | ridge | 2y | 0.02899964 | 0.02884427 | 0/4 | fail |
| ETHUSDT | gradient_boosting | 1y | 0.02991177 | 0.02884427 | 0/4 | fail |
| ETHUSDT | random_forest | 1y | 0.02970412 | 0.02884427 | 0/4 | fail |
| ETHUSDT | ridge | 1y | 0.02957035 | 0.02884427 | 0/4 | fail |

Historical folds evaluate 90 targets each. Source-close ranges begin 2025-11-06, 2026-02-05, 2026-05-07 and 2026-08-06; corresponding final target dates are 2026-02-04, 2026-05-06, 2026-08-05 and 2026-11-04. One feature origin separates blocks; training labels strictly precede each block. The final block supports model selection and is not an independent final test.

Maximum numeric artifact parity error across candidates: 1.214306433183765e-17.

Full candidate IDs, environment, config/code/dataset fingerprints, parameters, training ranges and fold metrics: [machine-readable run](lifecycle-2026-11-06.json). Operational commands, prospective review rules and limitations: [ML workflow](../README.md). No costs-adjusted strategy, calibrated probability or investment performance is claimed.
