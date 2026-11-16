# MAE-first selection and stability review

Existing trained artifacts, chronological development evidence only. No candidate refitting or new activation gates.
[Machine-readable metrics, baselines, folds, uncertainty, regimes and tails](evidence.json).

Volatility selections changed: 18/24. Mean pairwise MAE reduction: 3.88%; median: 0.86%.
QLIKE worsened in 18/24 pairs. MAE baseline wins: 15 → 17/24.

Positive MAE improvement means lower error. Positive QLIKE change means worse QLIKE; negative absolute QLIKE values are not converted into percentage improvements.
Baseline is the same original calibration-selected comparator for before/after; its volatility choice used QLIKE. Every other baseline and fold is also reported. It is not an MAE-optimized comparator.

| Coin | Horizon | Previous QLIKE-first | New MAE-first | Old MAE | New MAE | Baseline MAE | MAE reduction vs old | New vs baseline | Old QLIKE | New QLIKE | Baseline QLIKE |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT | 1m | rich-rv-volatility | har_regularized | 0.0004171 | 0.0003398 | 0.0002785 | 18.55% | -21.98% | -14.22134 | -13.26247 | -14.32352 |
| BTCUSDT | 15m | lightgbm_rv | lightgbm_rv | 0.0005664 | 0.0005664 | 0.0005900 | 0.00% | 4.00% | -11.86177 | -11.86177 | -11.78308 |
| BTCUSDT | 1h | lightgbm_rv | lightgbm_rv | 0.0009823 | 0.0009823 | 0.0010907 | 0.00% | 9.94% | -10.40875 | -10.40875 | -10.31842 |
| ETHUSDT | 1m | lightgbm_rv | xgboost_rv | 0.0003704 | 0.0003699 | 0.0003649 | 0.13% | -1.35% | -13.76799 | -13.76722 | -13.71033 |
| ETHUSDT | 15m | rich-rv-multiscale | lightgbm_rv | 0.0007968 | 0.0007768 | 0.0008240 | 2.52% | 5.72% | -11.25375 | -11.24333 | -11.17860 |
| ETHUSDT | 1h | lightgbm_rv | lightgbm_rv | 0.0013581 | 0.0013581 | 0.0015364 | 0.00% | 11.60% | -9.79387 | -9.79387 | -9.71332 |
| SOLUSDT | 1m | rich-rv-volatility | har | 0.0005900 | 0.0004624 | 0.0004290 | 21.63% | -7.77% | -13.45084 | -13.39471 | -13.44535 |
| SOLUSDT | 15m | rich-rv-structure | xgboost_rv | 0.0008312 | 0.0008139 | 0.0008340 | 2.09% | 2.41% | -10.94514 | -10.93536 | -10.89288 |
| SOLUSDT | 1h | rich-rv-activity | lightgbm_rv | 0.0014139 | 0.0013675 | 0.0015592 | 3.28% | 12.29% | -9.50140 | -9.50044 | -9.43664 |
| BNBUSDT | 1m | xgboost_rv | har | 0.0002776 | 0.0002768 | 0.0002702 | 0.27% | -2.46% | -14.44690 | -14.40203 | -14.40070 |
| BNBUSDT | 15m | rich-rv-all | lightgbm_rv | 0.0005108 | 0.0005059 | 0.0005312 | 0.96% | 4.76% | -11.85959 | -11.85721 | -11.80752 |
| BNBUSDT | 1h | lightgbm_rv | lightgbm_rv | 0.0008627 | 0.0008627 | 0.0009506 | 0.00% | 9.25% | -10.41858 | -10.41858 | -10.33670 |
| XRPUSDT | 1m | xgboost_rv | xgboost_rv | 0.0004271 | 0.0004271 | 0.0004119 | 0.00% | -3.67% | -13.64623 | -13.64623 | -13.60922 |
| XRPUSDT | 15m | rich-rv-structure | xgboost_rv | 0.0009437 | 0.0007571 | 0.0007818 | 19.78% | 3.16% | -11.12256 | -11.08937 | -11.06625 |
| XRPUSDT | 1h | rich-rv-trend | lightgbm_rv | 0.0013650 | 0.0013319 | 0.0014749 | 2.42% | 9.70% | -9.67675 | -9.63975 | -9.61297 |
| ADAUSDT | 1m | lightgbm_rv | xgboost_rv | 0.0008372 | 0.0008309 | 0.0006347 | 0.76% | -30.90% | -12.55160 | -12.55113 | -12.61984 |
| ADAUSDT | 15m | rich-rv-cross_asset | xgboost_rv | 0.0010172 | 0.0009757 | 0.0010780 | 4.08% | 9.49% | -10.12395 | -10.11092 | -10.08174 |
| ADAUSDT | 1h | rich-rv-activity | lightgbm_rv | 0.0016864 | 0.0015780 | 0.0018658 | 6.43% | 15.42% | -8.69940 | -8.68786 | -8.65434 |
| DOGEUSDT | 1m | har | lightgbm_rv | 0.0004361 | 0.0004149 | 0.0004254 | 4.86% | 2.46% | -13.42532 | -13.39038 | -13.43908 |
| DOGEUSDT | 15m | rich-rv-multiscale | rich-rv-trend | 0.0008120 | 0.0008098 | 0.0008314 | 0.26% | 2.60% | -11.00770 | -11.00446 | -10.94710 |
| DOGEUSDT | 1h | rich-rv-all | rich-rv-structure | 0.0014513 | 0.0014458 | 0.0016007 | 0.37% | 9.67% | -9.55250 | -9.55095 | -9.48276 |
| LINKUSDT | 1m | har_regularized | har_regularized | 0.0005406 | 0.0005406 | 0.0004519 | 0.00% | -19.63% | -13.27320 | -13.27320 | -13.28960 |
| LINKUSDT | 15m | rich-rv-multiscale | rich-rv-structure | 0.0008317 | 0.0008292 | 0.0008931 | 0.30% | 7.15% | -10.79039 | -10.78710 | -10.74318 |
| LINKUSDT | 1h | xgboost_rv | rich-rv-trend | 0.0014949 | 0.0014292 | 0.0016143 | 4.40% | 11.47% | -9.34505 | -9.34418 | -9.28770 |

## Scope and limitations

All three original folds provide baseline-relative aggregate and fold diagnostics. Nonlinear metrics such as MCC/ECE are never synthesized by averaging folds. RMSE is pooled through squared loss.
Regime thresholds come only from fitting data. Event-tail slices are ex-post descriptive diagnostics, never origin-known features or new gates.
Only the original last development fold can be replayed with saved direction/volatility weights. Earlier fold weights/predictions were not saved. Price deployment refits can contain development dates, so only recorded price walk-forward scores are used.
The fixed original momentum baseline is reconstructed on its original training/calibration rows; candidate models are never refitted. Native replay scores and origin hashes are checked against the original evidence.
Replays completed: 24/24; incomplete attempts remain in JSON. Measured subprocess time 257.0s plus pilot 6.7s against a 600s budget.
The last-fold interval uses its matching measured last-fold coverage. Aggregate cross-fold coverage/width are separate historical diagnostics. Wide/coverage flags do not block forecasts.
MAE improvements reuse development evidence and are not independent confirmation. No claim of future profitability follows. Source data, original reports, weights, daily operations and local startup are preserved.
