import { expect, it } from 'vitest';
import { fibonacciLevels, movingAverage } from '../shared/analysis';
import type { Candle } from '../shared/contracts';

const candles: Candle[] = [10, 20, 30, 500].map((close, i) => ({
  openTime: i * 86400000,
  closeTime: (i + 1) * 86400000 - 1,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1,
  completed: i < 3,
}));
it('computes descriptive Fibonacci levels from actual closed-candle extremes', () => {
  const levels = fibonacciLevels(candles);
  expect(levels[0].price).toBe(31);
  expect(levels.at(-1)?.price).toBe(9);
  expect(levels[3].price).toBe(20);
  expect(fibonacciLevels([])).toEqual([]);
});
it('uses only past completed closes in moving averages', () => {
  expect(movingAverage(candles, 2)).toEqual([
    { openTime: 86400000, value: 15 },
    { openTime: 172800000, value: 25 },
  ]);
  expect(movingAverage(candles, 20)).toEqual([]);
  expect(() => movingAverage(candles, 0)).toThrow();
});
