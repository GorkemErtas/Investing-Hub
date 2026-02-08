import type { Candle } from './contracts.js';

// Descriptive levels for the observed closed-candle range, never price forecasts.
export function fibonacciLevels(candles: Candle[]) {
  const closed = candles.filter((c) => c.completed);
  if (!closed.length) return [];
  const high = Math.max(...closed.map((c) => c.high));
  const low = Math.min(...closed.map((c) => c.low));
  return [0, 0.236, 0.382, 0.5, 0.618, 1].map((ratio) => ({
    ratio,
    price: high - (high - low) * ratio,
  }));
}

export function movingAverage(candles: Candle[], period = 20) {
  if (!Number.isInteger(period) || period < 1)
    throw new Error('Period must be a positive integer.');
  const closed = candles.filter((c) => c.completed);
  return closed.slice(period - 1).map((c, index) => ({
    openTime: c.openTime,
    value: closed.slice(index, index + period).reduce((sum, row) => sum + row.close, 0) / period,
  }));
}
