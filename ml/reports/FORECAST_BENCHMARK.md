# Historical minute benchmark evidence

Real supplied Binance data; fixed CPU pilot configuration. No synthetic fitting data.
Detailed folds, regimes, ablations, package versions, source/data hashes and artifact checksums are in
[the JSON evidence](historical-v2-benchmark.json).

## Selection decisions

| Symbol | Horizon | Selected | Status | Lowest validation RMSE family | Validation / naive RMSE | Holdout / naive RMSE |
|---|---|---|---|---|---|---|
| BTCUSDT | 1m | none | unavailable | naive | 1.00000 | 1.00000 |
| BTCUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| BTCUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |
| ETHUSDT | 1m | none | unavailable | naive | 1.00000 | 1.00000 |
| ETHUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| ETHUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |
| SOLUSDT | 1m | none | unavailable | lightgbm | 0.99870 | 1.00305 |
| SOLUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| SOLUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |
| BNBUSDT | 1m | none | unavailable | ridge | 0.99871 | 1.03409 |
| BNBUSDT | 15m | none | unavailable | xgboost | 0.99938 | 0.99580 |
| BNBUSDT | 1h | none | unavailable | random_forest | 0.99956 | 1.00076 |
| XRPUSDT | 1m | none | unavailable | naive | 1.00000 | 1.00000 |
| XRPUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| XRPUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |
| ADAUSDT | 1m | none | unavailable | lightgbm | 0.99818 | 1.00940 |
| ADAUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| ADAUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |
| DOGEUSDT | 1m | none | unavailable | ridge | 0.99604 | 1.05313 |
| DOGEUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| DOGEUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |
| LINKUSDT | 1m | none | unavailable | naive | 1.00000 | 1.00000 |
| LINKUSDT | 15m | none | unavailable | naive | 1.00000 | 1.00000 |
| LINKUSDT | 1h | none | unavailable | naive | 1.00000 | 1.00000 |

All eight `1M` horizons are unavailable: insufficient independent monthly outcomes.

Selection uses validation only: at least 1% log-return RMSE advantage, all three folds
beating no-change, and positive lower paired daily-block MSE improvement after a
Bonferroni correction for 144 comparisons. Simplicity breaks ties within 0.2%.
The daily-block bootstrap assumes independent days; residual dependence and study
design choices limit inference. No claim of financial predictability follows.
Holdout never selects a candidate. A winning final fit could be marked experimental only.

## Every candidate comparison

Return errors are log-return units; price errors are USDT. Direction is a fraction.
RSS is sampled absolute process resident memory, not model allocation or a hard OS limit.
Latency is median of 30 single-origin NumPy inferences, excluding provider/network cost.

| Pair | Family | Validation RMSE | Holdout RMSE | Holdout price MAE / RMSE | Direction | Validation fit s | RSS MiB | Inference ms | Artifact bytes |
|---|---|---|---|---|---|---|---|---|---|
| BTCUSDT/1m | hist_gradient_boosting | 0.0005866718 | 0.0004799828 | 24.9161 / 38.8842 | 0.4729 | 0.29 | 699.1 | 5.5093 | 38244 |
| BTCUSDT/1m | lightgbm | 0.0005867553 | 0.0004796843 | 24.9173 / 38.8623 | 0.4713 | 0.38 | 709.8 | 6.3845 | 38481 |
| BTCUSDT/1m | lstm | 0.0005885765 | 0.0004789109 | 25.1145 / 38.7954 | 0.4940 | 9.61 | 1154.4 | 1.4976 | 36453 |
| BTCUSDT/1m | naive | 0.0005861063 | 0.0004763969 | 24.8504 / 38.5991 | 0.0452 | 0.00 | 627.2 | 0.0000 | 0 |
| BTCUSDT/1m | random_forest | 0.0005869942 | 0.0004801939 | 24.9152 / 38.9037 | 0.4754 | 10.80 | 699.7 | 5.0931 | 45639 |
| BTCUSDT/1m | ridge | 0.0005871574 | 0.0004927349 | 25.8798 / 39.878 | 0.4708 | 2.31 | 696.1 | 0.0095 | 2653 |
| BTCUSDT/1m | xgboost | 0.0005864981 | 0.0004794499 | 24.9103 / 38.845 | 0.4713 | 0.72 | 831.5 | 6.6349 | 34675 |
| BTCUSDT/15m | hist_gradient_boosting | 0.001936374 | 0.001837574 | 96.2319 / 149.503 | 0.5171 | 0.30 | 1103.8 | 6.5972 | 47337 |
| BTCUSDT/15m | lightgbm | 0.001937211 | 0.001837372 | 96.2277 / 149.5 | 0.5194 | 0.23 | 1103.8 | 6.6614 | 45578 |
| BTCUSDT/15m | lstm | 0.001937028 | 0.001840032 | 96.6431 / 149.692 | 0.5092 | 3.02 | 1168.4 | 1.3608 | 36485 |
| BTCUSDT/15m | naive | 0.001934483 | 0.001835759 | 96.119 / 149.355 | 0.0006 | 0.00 | 1101.5 | 0.0000 | 0 |
| BTCUSDT/15m | random_forest | 0.00193809 | 0.00183628 | 96.1817 / 149.413 | 0.5112 | 11.06 | 1104.9 | 6.2991 | 55536 |
| BTCUSDT/15m | ridge | 0.001939326 | 0.001837417 | 96.2552 / 149.474 | 0.5117 | 0.04 | 1101.5 | 0.0277 | 2654 |
| BTCUSDT/15m | xgboost | 0.001935874 | 0.001835118 | 96.1588 / 149.31 | 0.5179 | 0.37 | 1104.3 | 6.8373 | 42396 |
| BTCUSDT/1h | hist_gradient_boosting | 0.004004134 | 0.0036019 | 190.655 / 292.743 | 0.4924 | 0.31 | 1107.0 | 6.2569 | 45221 |
| BTCUSDT/1h | lightgbm | 0.004007196 | 0.003596088 | 190.449 / 292.281 | 0.4917 | 0.25 | 1107.0 | 5.2494 | 41966 |
| BTCUSDT/1h | lstm | 0.004006534 | 0.003590257 | 190.74 / 291.783 | 0.5028 | 3.31 | 1175.1 | 1.4559 | 36457 |
| BTCUSDT/1h | naive | 0.003997798 | 0.003576309 | 189.663 / 290.683 | 0.0000 | 0.00 | 1104.8 | 0.0000 | 0 |
| BTCUSDT/1h | random_forest | 0.004012498 | 0.003593502 | 190.311 / 292.066 | 0.4910 | 10.84 | 1108.1 | 6.2779 | 43214 |
| BTCUSDT/1h | ridge | 0.004002304 | 0.003571963 | 189.423 / 290.345 | 0.5076 | 0.04 | 1104.8 | 0.0271 | 2652 |
| BTCUSDT/1h | xgboost | 0.004006707 | 0.003602417 | 190.616 / 292.788 | 0.4951 | 0.37 | 1107.0 | 4.0439 | 41239 |
| ETHUSDT/1m | hist_gradient_boosting | 0.000786599 | 0.0006778006 | 1.06256 / 1.66962 | 0.5004 | 0.30 | 1094.1 | 6.6743 | 37582 |
| ETHUSDT/1m | lightgbm | 0.0007863531 | 0.0006782265 | 1.06209 / 1.67045 | 0.5019 | 0.23 | 1094.1 | 6.6511 | 36139 |
| ETHUSDT/1m | lstm | 0.0007883179 | 0.0006747066 | 1.06586 / 1.66306 | 0.5056 | 2.97 | 1191.4 | 1.3945 | 36443 |
| ETHUSDT/1m | naive | 0.0007856759 | 0.0006724094 | 1.05997 / 1.65755 | 0.0225 | 0.00 | 1091.9 | 0.0000 | 0 |
| ETHUSDT/1m | random_forest | 0.000786312 | 0.0006763736 | 1.06111 / 1.6658 | 0.5010 | 10.92 | 1095.2 | 3.9092 | 46614 |
| ETHUSDT/1m | ridge | 0.0007871539 | 0.0007125236 | 1.11172 / 1.75326 | 0.4873 | 0.04 | 1091.9 | 0.0086 | 2649 |
| ETHUSDT/1m | xgboost | 0.0007868789 | 0.0006779456 | 1.06292 / 1.67017 | 0.5015 | 0.35 | 1094.1 | 4.9885 | 34032 |
| ETHUSDT/15m | hist_gradient_boosting | 0.002602642 | 0.002528344 | 4.05803 / 6.32023 | 0.5100 | 0.27 | 1094.8 | 5.5407 | 46264 |
| ETHUSDT/15m | lightgbm | 0.002603069 | 0.002526842 | 4.05694 / 6.31664 | 0.4994 | 0.24 | 1095.1 | 6.1350 | 44074 |
| ETHUSDT/15m | lstm | 0.00261127 | 0.002536199 | 4.07201 / 6.34002 | 0.5075 | 3.07 | 1196.9 | 1.3727 | 36474 |
| ETHUSDT/15m | naive | 0.002601823 | 0.002530285 | 4.05795 / 6.32485 | 0.0010 | 0.00 | 1092.6 | 0.0000 | 0 |
| ETHUSDT/15m | random_forest | 0.002605755 | 0.002527765 | 4.06004 / 6.31799 | 0.5175 | 10.53 | 1095.9 | 7.0338 | 59537 |
| ETHUSDT/15m | ridge | 0.002609288 | 0.002529769 | 4.06594 / 6.32326 | 0.5046 | 0.04 | 1092.6 | 0.0246 | 2656 |
| ETHUSDT/15m | xgboost | 0.002602324 | 0.002527463 | 4.0571 / 6.31783 | 0.5208 | 0.32 | 1095.1 | 6.6922 | 41224 |
| ETHUSDT/1h | hist_gradient_boosting | 0.005387942 | 0.00480874 | 7.74771 / 11.9888 | 0.5097 | 0.35 | 1100.7 | 6.6293 | 52083 |
| ETHUSDT/1h | lightgbm | 0.005386896 | 0.004804331 | 7.74835 / 11.9782 | 0.4993 | 0.25 | 1101.0 | 6.5737 | 50492 |
| ETHUSDT/1h | lstm | 0.005378152 | 0.00482407 | 7.82453 / 12.0249 | 0.4799 | 3.03 | 1169.1 | 1.4416 | 36486 |
| ETHUSDT/1h | naive | 0.005369797 | 0.004797356 | 7.73336 / 11.9595 | 0.0007 | 0.00 | 1098.5 | 0.0000 | 0 |
| ETHUSDT/1h | random_forest | 0.005387193 | 0.004799001 | 7.7427 / 11.9656 | 0.4861 | 9.20 | 1101.8 | 6.8094 | 48811 |
| ETHUSDT/1h | ridge | 0.005382086 | 0.004791203 | 7.76988 / 11.9484 | 0.5035 | 0.04 | 1098.5 | 0.0267 | 2652 |
| ETHUSDT/1h | xgboost | 0.005383367 | 0.004808709 | 7.74921 / 11.9891 | 0.4979 | 0.36 | 1101.0 | 5.2702 | 42603 |
| SOLUSDT/1m | hist_gradient_boosting | 0.0008688082 | 0.0008195962 | 0.0581524 / 0.0874895 | 0.4704 | 0.31 | 1102.7 | 6.5989 | 42787 |
| SOLUSDT/1m | lightgbm | 0.0008687085 | 0.0008193725 | 0.0581536 / 0.0874655 | 0.4694 | 0.26 | 1102.7 | 6.6501 | 40764 |
| SOLUSDT/1m | lstm | 0.0008714184 | 0.0008191555 | 0.0583685 / 0.0874067 | 0.4644 | 3.13 | 1204.7 | 1.4546 | 36460 |
| SOLUSDT/1m | naive | 0.0008698403 | 0.0008168806 | 0.0580833 / 0.0871851 | 0.0731 | 0.00 | 1100.4 | 0.0000 | 0 |
| SOLUSDT/1m | random_forest | 0.0008700665 | 0.0008215614 | 0.0581506 / 0.0876608 | 0.4717 | 10.77 | 1103.8 | 6.7002 | 49649 |
| SOLUSDT/1m | ridge | 0.00087117 | 0.0008393435 | 0.0593882 / 0.0894883 | 0.4623 | 0.04 | 1100.4 | 0.0088 | 2654 |
| SOLUSDT/1m | xgboost | 0.000868867 | 0.000819157 | 0.0581224 / 0.0874413 | 0.4713 | 0.38 | 1102.7 | 6.7400 | 38361 |
| SOLUSDT/15m | hist_gradient_boosting | 0.003076023 | 0.003044328 | 0.223405 / 0.329179 | 0.4917 | 0.29 | 1115.3 | 6.5421 | 46323 |
| SOLUSDT/15m | lightgbm | 0.003075877 | 0.003044917 | 0.223423 / 0.329215 | 0.4871 | 0.23 | 1116.3 | 6.5412 | 47890 |
| SOLUSDT/15m | lstm | 0.00308228 | 0.003054796 | 0.224271 / 0.330101 | 0.4890 | 3.16 | 1196.5 | 1.4264 | 36495 |
| SOLUSDT/15m | naive | 0.003072453 | 0.003047912 | 0.223612 / 0.329424 | 0.0187 | 0.00 | 1113.1 | 0.0000 | 0 |
| SOLUSDT/15m | random_forest | 0.003076305 | 0.003045079 | 0.223513 / 0.329295 | 0.4885 | 10.30 | 1116.4 | 6.6293 | 50383 |
| SOLUSDT/15m | ridge | 0.003089149 | 0.003057603 | 0.2244 / 0.330407 | 0.4948 | 0.03 | 1113.1 | 0.0258 | 2655 |
| SOLUSDT/15m | xgboost | 0.003076382 | 0.00304393 | 0.223354 / 0.329113 | 0.4888 | 0.38 | 1115.6 | 6.6571 | 43473 |
| SOLUSDT/1h | hist_gradient_boosting | 0.006070865 | 0.005783181 | 0.425469 / 0.622189 | 0.4917 | 0.30 | 1118.5 | 6.7716 | 47355 |
| SOLUSDT/1h | lightgbm | 0.006073783 | 0.005776479 | 0.425445 / 0.621543 | 0.4889 | 0.26 | 1119.5 | 6.7044 | 46723 |
| SOLUSDT/1h | lstm | 0.006099105 | 0.005811219 | 0.427318 / 0.625148 | 0.4938 | 3.15 | 1214.2 | 1.6978 | 36486 |
| SOLUSDT/1h | naive | 0.006062941 | 0.005794598 | 0.425896 / 0.623334 | 0.0132 | 0.00 | 1116.3 | 0.0000 | 0 |
| SOLUSDT/1h | random_forest | 0.006077078 | 0.005773538 | 0.425197 / 0.621224 | 0.4903 | 10.85 | 1119.6 | 6.7960 | 46992 |
| SOLUSDT/1h | ridge | 0.006088991 | 0.005768358 | 0.425859 / 0.620989 | 0.5139 | 0.04 | 1116.2 | 0.0109 | 2658 |
| SOLUSDT/1h | xgboost | 0.006072571 | 0.005783239 | 0.425404 / 0.622256 | 0.4875 | 0.36 | 1118.5 | 6.2476 | 41310 |
| BNBUSDT/1m | hist_gradient_boosting | 0.0005157151 | 0.0005741306 | 0.266473 / 0.422851 | 0.4921 | 0.29 | 1120.2 | 6.8325 | 40526 |
| BNBUSDT/1m | lightgbm | 0.0005152208 | 0.0005746003 | 0.266365 / 0.423148 | 0.4929 | 0.23 | 1120.2 | 6.4404 | 38891 |
| BNBUSDT/1m | lstm | 0.0005177361 | 0.000566205 | 0.266054 / 0.417342 | 0.5004 | 3.11 | 1188.6 | 1.4030 | 36444 |
| BNBUSDT/1m | naive | 0.0005156056 | 0.0005645135 | 0.264935 / 0.416214 | 0.0319 | 0.00 | 1117.9 | 0.0000 | 0 |
| BNBUSDT/1m | random_forest | 0.0005153321 | 0.0005719186 | 0.266124 / 0.421357 | 0.4902 | 10.45 | 1121.3 | 6.5343 | 49240 |
| BNBUSDT/1m | ridge | 0.00051494 | 0.0005837574 | 0.271323 / 0.429757 | 0.4813 | 0.04 | 1117.9 | 0.0255 | 2654 |
| BNBUSDT/1m | xgboost | 0.00051526 | 0.0005743417 | 0.266449 / 0.422992 | 0.4921 | 0.34 | 1120.2 | 6.5458 | 36906 |
| BNBUSDT/15m | hist_gradient_boosting | 0.001917605 | 0.002186719 | 1.04181 / 1.61885 | 0.4919 | 0.30 | 1119.2 | 5.9278 | 44009 |
| BNBUSDT/15m | lightgbm | 0.001918089 | 0.002186707 | 1.04199 / 1.61886 | 0.4896 | 0.27 | 1119.3 | 6.6494 | 41739 |
| BNBUSDT/15m | lstm | 0.001922777 | 0.002195531 | 1.04561 / 1.6252 | 0.5012 | 3.36 | 1195.7 | 1.4148 | 36464 |
| BNBUSDT/15m | naive | 0.001918802 | 0.002195655 | 1.04303 / 1.62514 | 0.0040 | 0.00 | 1117.1 | 0.0000 | 0 |
| BNBUSDT/15m | random_forest | 0.001920526 | 0.002185872 | 1.04054 / 1.61812 | 0.5135 | 10.55 | 1120.4 | 6.9131 | 53997 |
| BNBUSDT/15m | ridge | 0.001924519 | 0.002195966 | 1.0469 / 1.62569 | 0.4898 | 0.03 | 1117.0 | 0.0254 | 2661 |
| BNBUSDT/15m | xgboost | 0.001917603 | 0.002186432 | 1.04172 / 1.6187 | 0.4927 | 0.37 | 1119.3 | 6.6132 | 40349 |
| BNBUSDT/1h | hist_gradient_boosting | 0.003817548 | 0.004214207 | 2.054 / 3.12043 | 0.4910 | 0.26 | 1105.5 | 6.6912 | 40990 |
| BNBUSDT/1h | lightgbm | 0.003817683 | 0.004213195 | 2.05238 / 3.1197 | 0.5042 | 0.26 | 1101.5 | 5.2547 | 37467 |
| BNBUSDT/1h | lstm | 0.003817432 | 0.004218403 | 2.06374 / 3.12324 | 0.4958 | 3.11 | 1213.3 | 1.3236 | 36451 |
| BNBUSDT/1h | naive | 0.003816104 | 0.004212954 | 2.05203 / 3.11948 | 0.0007 | 0.00 | 1103.3 | 0.0000 | 0 |
| BNBUSDT/1h | random_forest | 0.003814433 | 0.004216167 | 2.05357 / 3.12153 | 0.4861 | 10.70 | 1106.6 | 6.6400 | 43704 |
| BNBUSDT/1h | ridge | 0.003826022 | 0.004215494 | 2.05721 / 3.12178 | 0.4896 | 0.04 | 1103.3 | 0.0131 | 2651 |
| BNBUSDT/1h | xgboost | 0.003819357 | 0.004213536 | 2.05324 / 3.11992 | 0.5028 | 0.37 | 1101.5 | 6.8248 | 35545 |
| XRPUSDT/1m | hist_gradient_boosting | 0.0009127137 | 0.0009021432 | 0.000818768 / 0.00126029 | 0.4581 | 0.33 | 1098.6 | 6.6035 | 37845 |
| XRPUSDT/1m | lightgbm | 0.0009127262 | 0.0009019717 | 0.000818842 / 0.00125979 | 0.4569 | 0.27 | 1098.6 | 5.2430 | 36837 |
| XRPUSDT/1m | lstm | 0.0009135561 | 0.0008925954 | 0.000816239 / 0.00124746 | 0.4746 | 3.45 | 1195.8 | 1.4268 | 36426 |
| XRPUSDT/1m | naive | 0.000911381 | 0.00088961 | 0.000812562 / 0.00124333 | 0.0631 | 0.00 | 1096.4 | 0.0000 | 0 |
| XRPUSDT/1m | random_forest | 0.000913276 | 0.0009076594 | 0.000823014 / 0.00126921 | 0.4760 | 12.02 | 1099.7 | 8.8146 | 46089 |
| XRPUSDT/1m | ridge | 0.0009149264 | 0.0009337326 | 0.000850823 / 0.00130202 | 0.4615 | 0.04 | 1096.4 | 0.0138 | 2654 |
| XRPUSDT/1m | xgboost | 0.0009122822 | 0.0009017908 | 0.000818942 / 0.0012598 | 0.4577 | 0.38 | 1098.6 | 6.8815 | 33846 |
| XRPUSDT/15m | hist_gradient_boosting | 0.00331591 | 0.003315324 | 0.00314181 / 0.00468659 | 0.4981 | 0.28 | 1102.8 | 6.5292 | 46769 |
| XRPUSDT/15m | lightgbm | 0.003315547 | 0.003309718 | 0.0031396 / 0.00467766 | 0.4998 | 0.25 | 1102.8 | 6.0731 | 45305 |
| XRPUSDT/15m | lstm | 0.003306311 | 0.003313045 | 0.00314529 / 0.00468249 | 0.4994 | 3.01 | 1188.6 | 1.5204 | 36468 |
| XRPUSDT/15m | naive | 0.00330166 | 0.00330924 | 0.00313965 / 0.00467548 | 0.0140 | 0.00 | 1100.6 | 0.0000 | 0 |
| XRPUSDT/15m | random_forest | 0.00331666 | 0.003319372 | 0.00314495 / 0.00469287 | 0.5077 | 10.90 | 1103.9 | 6.7494 | 51122 |
| XRPUSDT/15m | ridge | 0.003326558 | 0.003317381 | 0.0031494 / 0.00468724 | 0.4935 | 0.04 | 1100.6 | 0.0091 | 2656 |
| XRPUSDT/15m | xgboost | 0.003315492 | 0.003310839 | 0.00314034 / 0.00468023 | 0.5004 | 0.34 | 1102.8 | 7.0928 | 43910 |
| XRPUSDT/1h | hist_gradient_boosting | 0.006831419 | 0.00646859 | 0.00590428 / 0.00909726 | 0.4938 | 0.39 | 1120.4 | 6.9300 | 46283 |
| XRPUSDT/1h | lightgbm | 0.006843641 | 0.006457288 | 0.00590421 / 0.00908335 | 0.5021 | 0.29 | 1120.4 | 7.0809 | 46212 |
| XRPUSDT/1h | lstm | 0.006829382 | 0.006452135 | 0.00590593 / 0.00906968 | 0.5014 | 3.77 | 1188.5 | 1.4398 | 36482 |
| XRPUSDT/1h | naive | 0.006805383 | 0.006443356 | 0.00588639 / 0.0090558 | 0.0063 | 0.00 | 1118.2 | 0.0000 | 0 |
| XRPUSDT/1h | random_forest | 0.006847595 | 0.006442083 | 0.00590585 / 0.00905973 | 0.5021 | 11.88 | 1121.5 | 2.8768 | 52844 |
| XRPUSDT/1h | ridge | 0.006848165 | 0.00642818 | 0.00588233 / 0.00904218 | 0.5201 | 0.05 | 1124.8 | 0.0106 | 2653 |
| XRPUSDT/1h | xgboost | 0.00683673 | 0.006458321 | 0.00590401 / 0.00908532 | 0.4931 | 0.46 | 1120.4 | 7.0332 | 39057 |
| ADAUSDT/1m | hist_gradient_boosting | 0.001172856 | 0.001215095 | 0.000184141 / 0.000274272 | 0.3844 | 0.36 | 1118.3 | 6.6138 | 45592 |
| ADAUSDT/1m | lightgbm | 0.001172604 | 0.001215207 | 0.000184169 / 0.000274246 | 0.3873 | 0.29 | 1118.3 | 6.7592 | 40844 |
| ADAUSDT/1m | lstm | 0.001177084 | 0.001208753 | 0.000185482 / 0.000272768 | 0.3817 | 3.66 | 1187.5 | 1.5671 | 36474 |
| ADAUSDT/1m | naive | 0.001174737 | 0.001203895 | 0.000182542 / 0.000271708 | 0.2185 | 0.00 | 1116.0 | 0.0000 | 0 |
| ADAUSDT/1m | random_forest | 0.001174092 | 0.001216835 | 0.000184522 / 0.00027448 | 0.3881 | 11.14 | 1119.4 | 6.7638 | 54335 |
| ADAUSDT/1m | ridge | 0.001174369 | 0.001245923 | 0.000190642 / 0.000280726 | 0.3829 | 0.04 | 1116.0 | 0.0089 | 2650 |
| ADAUSDT/1m | xgboost | 0.001172841 | 0.001216154 | 0.000184038 / 0.000274465 | 0.3919 | 0.42 | 1118.3 | 6.3272 | 41054 |
| ADAUSDT/15m | hist_gradient_boosting | 0.004137548 | 0.004425018 | 0.000706156 / 0.00102084 | 0.4992 | 0.32 | 1119.9 | 7.2380 | 40749 |
| ADAUSDT/15m | lightgbm | 0.004137751 | 0.004425768 | 0.000706054 / 0.00102092 | 0.4871 | 0.26 | 1119.9 | 6.7938 | 39790 |
| ADAUSDT/15m | lstm | 0.004145096 | 0.00443608 | 0.00070797 / 0.00102311 | 0.4756 | 3.14 | 1188.0 | 1.5078 | 36459 |
| ADAUSDT/15m | naive | 0.004130841 | 0.004429351 | 0.000706333 / 0.00102153 | 0.0575 | 0.00 | 1117.7 | 0.0000 | 0 |
| ADAUSDT/15m | random_forest | 0.004144208 | 0.00442344 | 0.000705533 / 0.00102044 | 0.4871 | 10.35 | 1121.0 | 4.0604 | 55476 |
| ADAUSDT/15m | ridge | 0.004148118 | 0.004429635 | 0.000706849 / 0.00102175 | 0.4900 | 0.05 | 1117.7 | 0.0256 | 2653 |
| ADAUSDT/15m | xgboost | 0.004133707 | 0.004425613 | 0.000706266 / 0.00102095 | 0.4823 | 0.35 | 1119.9 | 6.8833 | 36646 |
| ADAUSDT/1h | hist_gradient_boosting | 0.00834195 | 0.00838904 | 0.00134395 / 0.00192593 | 0.5076 | 0.31 | 1120.7 | 6.6330 | 45017 |
| ADAUSDT/1h | lightgbm | 0.008335784 | 0.008394236 | 0.00134511 / 0.00192725 | 0.4979 | 0.27 | 1120.7 | 6.6622 | 37729 |
| ADAUSDT/1h | lstm | 0.008314894 | 0.008409734 | 0.00134991 / 0.00193055 | 0.4757 | 3.26 | 1202.0 | 0.7085 | 36455 |
| ADAUSDT/1h | naive | 0.008285074 | 0.008383685 | 0.001345 / 0.00192399 | 0.0299 | 0.00 | 1118.5 | 0.0000 | 0 |
| ADAUSDT/1h | random_forest | 0.00832432 | 0.008394175 | 0.00134423 / 0.00192785 | 0.5090 | 10.32 | 1121.8 | 4.3788 | 51323 |
| ADAUSDT/1h | ridge | 0.008303672 | 0.008392664 | 0.00134402 / 0.00192877 | 0.4986 | 0.05 | 1122.9 | 0.0304 | 2653 |
| ADAUSDT/1h | xgboost | 0.008342449 | 0.008387477 | 0.0013438 / 0.00192575 | 0.5069 | 0.36 | 1120.7 | 6.6646 | 40411 |
| DOGEUSDT/1m | hist_gradient_boosting | 0.0008739461 | 0.0009557279 | 5.37319e-05 / 8.34513e-05 | 0.4537 | 0.28 | 1103.2 | 4.9045 | 38746 |
| DOGEUSDT/1m | lightgbm | 0.000873768 | 0.0009579986 | 5.38235e-05 / 8.36558e-05 | 0.4548 | 0.23 | 1099.2 | 5.1368 | 37557 |
| DOGEUSDT/1m | lstm | 0.0008779013 | 0.0009483672 | 5.36831e-05 / 8.2845e-05 | 0.4704 | 3.05 | 1209.5 | 1.4324 | 36454 |
| DOGEUSDT/1m | naive | 0.0008758747 | 0.0009444708 | 5.33479e-05 / 8.25251e-05 | 0.0904 | 0.00 | 1100.9 | 0.0000 | 0 |
| DOGEUSDT/1m | random_forest | 0.0008744962 | 0.0009589105 | 5.38488e-05 / 8.37646e-05 | 0.4575 | 10.81 | 1104.3 | 6.7041 | 51536 |
| DOGEUSDT/1m | ridge | 0.0008724048 | 0.0009946508 | 5.57464e-05 / 8.66804e-05 | 0.4600 | 0.04 | 1101.0 | 0.0247 | 2643 |
| DOGEUSDT/1m | xgboost | 0.0008739883 | 0.000954728 | 5.37039e-05 / 8.33576e-05 | 0.4548 | 0.32 | 1099.2 | 6.8251 | 37515 |
| DOGEUSDT/15m | hist_gradient_boosting | 0.003082236 | 0.003633932 | 0.000205287 / 0.000322464 | 0.5206 | 0.30 | 1105.4 | 11.3835 | 45041 |
| DOGEUSDT/15m | lightgbm | 0.003080058 | 0.003634324 | 0.000205323 / 0.00032249 | 0.5198 | 0.25 | 1105.4 | 7.1340 | 42666 |
| DOGEUSDT/15m | lstm | 0.003086227 | 0.003644255 | 0.000205769 / 0.000323211 | 0.4946 | 4.17 | 1197.7 | 1.5620 | 36494 |
| DOGEUSDT/15m | naive | 0.003073143 | 0.003636812 | 0.000205481 / 0.000322522 | 0.0225 | 0.00 | 1103.1 | 0.0000 | 0 |
| DOGEUSDT/15m | random_forest | 0.003082654 | 0.003635605 | 0.000205153 / 0.000322626 | 0.5235 | 10.68 | 1106.5 | 6.9103 | 48304 |
| DOGEUSDT/15m | ridge | 0.003108869 | 0.003639413 | 0.000205396 / 0.000322804 | 0.5050 | 0.03 | 1103.1 | 0.0294 | 2651 |
| DOGEUSDT/15m | xgboost | 0.003081382 | 0.003637528 | 0.000205363 / 0.000322787 | 0.5204 | 0.35 | 1105.4 | 6.2517 | 40817 |
| DOGEUSDT/1h | hist_gradient_boosting | 0.006230193 | 0.006963408 | 0.000392008 / 0.000613785 | 0.4979 | 0.32 | 1104.6 | 6.2359 | 50761 |
| DOGEUSDT/1h | lightgbm | 0.006228997 | 0.006969274 | 0.000392682 / 0.000614256 | 0.4903 | 0.27 | 1104.6 | 6.5911 | 48811 |
| DOGEUSDT/1h | lstm | 0.006251259 | 0.006956951 | 0.000392829 / 0.000612797 | 0.4917 | 3.12 | 1201.2 | 1.5125 | 36471 |
| DOGEUSDT/1h | naive | 0.006219565 | 0.00694829 | 0.000391701 / 0.000612249 | 0.0118 | 0.00 | 1102.4 | 0.0000 | 0 |
| DOGEUSDT/1h | random_forest | 0.006237072 | 0.0069541 | 0.000392347 / 0.000613073 | 0.5069 | 10.56 | 1105.7 | 4.6298 | 47798 |
| DOGEUSDT/1h | ridge | 0.00626994 | 0.006941089 | 0.000390922 / 0.000611895 | 0.5139 | 0.04 | 1102.4 | 0.0110 | 2652 |
| DOGEUSDT/1h | xgboost | 0.006233044 | 0.006955414 | 0.000391889 / 0.000613132 | 0.4965 | 0.37 | 1104.6 | 7.0613 | 45871 |
| LINKUSDT/1m | hist_gradient_boosting | 0.0008796132 | 0.001041502 | 0.00875855 / 0.0130866 | 0.4731 | 0.41 | 1123.2 | 6.4980 | 60398 |
| LINKUSDT/1m | lightgbm | 0.0008795931 | 0.001041087 | 0.00876378 / 0.0130866 | 0.4840 | 0.31 | 1123.2 | 5.9521 | 57419 |
| LINKUSDT/1m | lstm | 0.0008884409 | 0.001043472 | 0.00882053 / 0.0131225 | 0.4731 | 3.15 | 1208.8 | 0.7505 | 36485 |
| LINKUSDT/1m | naive | 0.0008758777 | 0.001034108 | 0.00872958 / 0.0130122 | 0.0523 | 0.00 | 1121.0 | 0.0000 | 0 |
| LINKUSDT/1m | random_forest | 0.0008818769 | 0.001043003 | 0.0087869 / 0.0131068 | 0.4815 | 9.42 | 1124.3 | 3.7646 | 77911 |
| LINKUSDT/1m | ridge | 0.0008849332 | 0.001081129 | 0.00907148 / 0.0135711 | 0.4840 | 0.04 | 1121.0 | 0.0240 | 2656 |
| LINKUSDT/1m | xgboost | 0.0008796097 | 0.001041876 | 0.00876238 / 0.0130915 | 0.4823 | 0.40 | 1123.2 | 5.7007 | 55782 |
| LINKUSDT/15m | hist_gradient_boosting | 0.003153747 | 0.00394355 | 0.0338636 / 0.0502493 | 0.5131 | 0.38 | 1123.3 | 6.1566 | 47592 |
| LINKUSDT/15m | lightgbm | 0.003155349 | 0.003944504 | 0.033889 / 0.0502642 | 0.5138 | 0.29 | 1123.3 | 6.8417 | 46230 |
| LINKUSDT/15m | lstm | 0.003164884 | 0.003957448 | 0.034048 / 0.0504265 | 0.4894 | 3.20 | 1191.4 | 1.4418 | 36457 |
| LINKUSDT/15m | naive | 0.003150911 | 0.003951446 | 0.0339327 / 0.0503493 | 0.0129 | 0.00 | 1121.1 | 0.0000 | 0 |
| LINKUSDT/15m | random_forest | 0.00315499 | 0.003943739 | 0.0338918 / 0.0502544 | 0.5165 | 10.14 | 1124.4 | 6.7839 | 54494 |
| LINKUSDT/15m | ridge | 0.003171255 | 0.003952677 | 0.0339267 / 0.0503648 | 0.5129 | 0.05 | 1121.1 | 0.0256 | 2654 |
| LINKUSDT/15m | xgboost | 0.003154795 | 0.003944407 | 0.0338846 / 0.0502602 | 0.5108 | 0.44 | 1123.3 | 7.0519 | 42855 |
| LINKUSDT/1h | hist_gradient_boosting | 0.006300482 | 0.007839363 | 0.0667014 / 0.099636 | 0.5083 | 0.34 | 1122.8 | 6.9217 | 53584 |
| LINKUSDT/1h | lightgbm | 0.006301159 | 0.007836536 | 0.0667601 / 0.0996489 | 0.5076 | 0.24 | 1122.8 | 6.5514 | 52303 |
| LINKUSDT/1h | lstm | 0.006286171 | 0.00783479 | 0.0668143 / 0.0995215 | 0.4993 | 3.12 | 1175.3 | 1.5121 | 36446 |
| LINKUSDT/1h | naive | 0.006264356 | 0.007829361 | 0.066709 / 0.0995084 | 0.0056 | 0.00 | 1120.5 | 0.0000 | 0 |
| LINKUSDT/1h | random_forest | 0.006302822 | 0.007823662 | 0.0666876 / 0.0994842 | 0.5132 | 9.25 | 1123.9 | 6.7735 | 57218 |
| LINKUSDT/1h | ridge | 0.006306675 | 0.007824484 | 0.0666109 / 0.099499 | 0.5146 | 0.04 | 1120.6 | 0.0253 | 2643 |
| LINKUSDT/1h | xgboost | 0.006290757 | 0.007838991 | 0.066727 / 0.0996385 | 0.5083 | 0.34 | 1122.8 | 6.8724 | 48494 |

## Resource and study limits

Total measured pair execution time: 743.9 seconds.
Completed pairs: 24. Failed candidate comparisons: 0.
Each fit uses at most 12,000 evenly spaced origins from its expanding historical
window. Evaluation spans full 28-day folds and a final 60-day holdout with capped
non-overlapping origins. This evaluates all required families at a reduced CPU
budget; it does not establish that larger fits or different pre-registered features
cannot improve on no-change. LSTM has 8 hidden units and 3 fixed epochs; no GPU.

Economic diagnostics assume sign-based unit exposure, 10 bps costs plus 2 bps
slippage per unit turnover and final liquidation. Return sums and mean/std ratios
are descriptive, unlevered, non-compounded diagnostics with irregular sampled origins;
they are not an executable backtest, annualized Sharpe or profitability evidence.
Volatility regime thresholds use only pre-holdout fitting data. Feature-group Ridge
ablations use the last validation fold and do not change the fixed configuration.

Original source archives/checksums were absent. CSV fingerprints and validated
structure establish reproducibility, not independent proof of vendor origin.
Monthly evaluation, production rollout and larger training studies remain deferred.

## Artifact repair evidence

48 frozen deployment fits were re-exported and parity-tested on 10,000 historical origins each.
This includes 5 originally blocked exports. Additional repair duration: 115.0 seconds.
XGBoost and sklearn Random Forest cast model inputs to float32; portable inference
now mirrors that behavior. XGBoost thresholds also retain their float32 semantics.
Original failures, study checksums and corrected runtime source hashes are preserved
in each artifactRepair record. No validation/holdout scores or selection decisions
were recomputed or tuned. Model configurations and deployment fitting origins stayed fixed.
The deployFitSeconds field in original evidence includes export/write and latency checks.
