import { describe, expect, it, vi } from 'vitest';
import { assets } from '../shared/contracts';
import { SharedCache } from '../backend/src/market/cache';
import { BinanceProvider, parseCandles, parseMarkets } from '../backend/src/market/provider';

const rawCandle = (start: number) => [start, '100', '110', '90', '105', '10', start + 86400000 - 1];
describe('market normalization', () => {
  it('preserves OHLCV, UTC times and completed-candle identification', () => {
    const candles = parseCandles([rawCandle(0), rawCandle(86400000)], 90000000);
    expect(candles[0]).toMatchObject({
      openTime: 0,
      closeTime: 86399999,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 10,
      completed: true,
    });
    expect(candles[1].completed).toBe(false);
  });
  it('rejects invalid OHLC, duplicate or unordered candles, nonfinite values', () => {
    expect(() => parseCandles([[0, '100', '99', '90', '105', '10', 100]])).toThrow();
    expect(() => parseCandles([rawCandle(0), rawCandle(0)])).toThrow();
    expect(() => parseCandles([[0, 'NaN', '110', '90', '105', '10', 100]])).toThrow();
  });
  it('labels quote volume rather than market capitalization and requires all tracked pairs', () => {
    const raw = assets.map((a) => ({
      symbol: a.symbol,
      lastPrice: '100',
      priceChangePercent: '1.5',
      quoteVolume: '1000',
      highPrice: '110',
      lowPrice: '90',
      closeTime: 1000,
    }));
    expect(parseMarkets(raw)[0]).toMatchObject({
      symbol: 'BTCUSDT',
      price: 100,
      quoteVolume: 1000,
      sourceTime: '1970-01-01T00:00:01.000Z',
    });
    expect(() => parseMarkets(raw.slice(1))).toThrow();
  });
  it('validates calendar-month boundaries instead of treating a month as 30 days', () => {
    const start = Date.UTC(2024, 1, 1),
      end = Date.UTC(2024, 2, 1) - 1;
    expect(
      parseCandles([[start, '100', '110', '90', '105', '10', end]], Date.UTC(2024, 3, 1), '1M')[0]
        .completed,
    ).toBe(true);
    expect(() => parseCandles([rawCandle(start)], Date.UTC(2024, 3, 1), '1M')).toThrow(
      'interval mismatch',
    );
  });
});
describe('cache resilience', () => {
  it('deduplicates concurrent work and serves fresh hits', async () => {
    const cache = new SharedCache(1000, 10000, () => 1000);
    const loader = vi.fn(async () => [1]);
    const results = await Promise.all([
      cache.get('x', loader),
      cache.get('x', loader),
      cache.get('x', loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(results[0].stale).toBe(false);
    await cache.get('x', loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });
  it('serves bounded stale data and suppresses failed refresh storms', async () => {
    let now = 1000;
    const cache = new SharedCache(1000, 10000, () => now);
    await cache.get('x', async () => 42);
    now = 3000;
    const fail = vi.fn(async () => {
      throw new Error('private provider data');
    });
    expect(await cache.get('x', fail)).toMatchObject({
      data: 42,
      stale: true,
      fetchedAt: '1970-01-01T00:00:01.000Z',
    });
    await cache.get('x', fail);
    expect(fail).toHaveBeenCalledTimes(1);
    now = 12000;
    await expect(cache.get('x', fail)).rejects.toMatchObject({
      status: 503,
      code: 'MARKET_UNAVAILABLE',
    });
  });
  it('applies cold-outage backoff and evicts old cache entries', async () => {
    const cache = new SharedCache(1000, 10000, () => 1000, 1);
    const fail = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(cache.get('x', fail)).rejects.toThrow();
    await expect(cache.get('x', fail)).rejects.toThrow();
    expect(fail).toHaveBeenCalledTimes(1);
    const load = vi.fn(async () => 1);
    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
describe('provider request budget', () => {
  it('stops immediately on 429 and honors a global cooldown', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
    const provider = new BinanceProvider(100, request);
    await expect(provider.markets()).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' });
    await expect(provider.candles('BTCUSDT', '1d')).rejects.toMatchObject({
      code: 'PROVIDER_BUSY',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('retries transient failure once with a bounded backoff', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'));
    const pause = vi.fn(async () => {});
    await expect(new BinanceProvider(100, request, pause).markets()).rejects.toThrow('network');
    expect(request).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledWith(250);
  });
  it('makes one batch ticker call and passes exact interval with a supported limit', async () => {
    const monthly = [
      Date.UTC(2024, 0, 1),
      '100',
      '110',
      '90',
      '105',
      '10',
      Date.UTC(2024, 1, 1) - 1,
    ];
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify([monthly])));
    const provider = new BinanceProvider(100, request);
    await provider.candles('ETHUSDT', '1M');
    const url = new URL(String(request.mock.calls[0][0]));
    expect(url.hostname).toBe('data-api.binance.vision');
    expect(url.searchParams.get('symbol')).toBe('ETHUSDT');
    expect(url.searchParams.get('interval')).toBe('1M');
    expect(url.searchParams.get('limit')).toBe('180');
  });
});
