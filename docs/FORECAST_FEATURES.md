# Minute feature and target contract

`ml/multihorizon/features.py` is the only v2 feature implementation. Schema
`minute-finite-v2.1` fixes 24 ordered float features. Inputs are contiguous,
validated, completed UTC one-minute candles. The final candle's close is the
reference price and its inclusive close timestamp is the prediction origin.

Features include log returns at 1/5/15/60 minutes, normalized candle range/body,
15/60-minute return volatility, 20/60-minute SMA distance, finite 12-span EMA
distance and 12/26 MACD spread, 14-minute RSI/ATR, 20-minute Bollinger position,
relative volume, log-volume change, log quote volume/trade count, taker-buy ratio
and cyclical UTC hour/week encodings. Zero-activity ratios have explicit neutral
values. Warm-up rows are dropped, never filled from later observations.

EMA uses a normalized finite exponentially weighted window of three spans.
This deliberately differs from an infinite-history recursive EMA and makes
historical/live parity possible with bounded history. RSI uses rolling mean
gains/losses. These definitions are part of the schema, not interchangeable
indicator names. A 256-candle tail covers warm-up plus 16 LSTM feature vectors.

All algorithms share origins after the LSTM warm-up. Each horizon gets its own
direct target `log(close[t+h]/close[t])`. `1m`, `15m`, `1h` use exact minute
offsets. Price conversion is `referencePrice * exp(predictedLogReturn)`; displayed
percentage change is `100 * expm1(predictedLogReturn)`. Target times are inclusive
candle closes. Input refresh frequency is independent of horizon.

`1M` uses calendar-month addition (day clamped at month end) and remains blocked
from training and publication until independent monthly evidence is adequate.
Chart intervals are a separate domain. No recursive one-step extrapolation is used.

Chronological tests mutate future candles and compare earlier features, check
bounded-tail parity and target alignment, and reject gaps/partial resampling bins.
Benchmark reports include validation-only group ablations to assess feature
usefulness; these diagnostics do not modify the fixed study configuration.
