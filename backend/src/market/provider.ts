import { z } from 'zod';
import {
  assets,
  candleSchema,
  marketSchema,
  type Candle,
  type Interval,
  type Symbol,
} from '../../../shared/contracts.js';
import { AppError } from '../errors.js';

const number = z
  .union([z.string().min(1), z.number()])
  .transform(Number)
  .pipe(z.number().finite());
const ticker = z.object({
  symbol: z.string(),
  lastPrice: number,
  priceChangePercent: number,
  quoteVolume: number,
  highPrice: number,
  lowPrice: number,
  closeTime: z.number().int().nonnegative(),
});
export function parseMarkets(raw: unknown) {
  const tickers = z.array(ticker).parse(raw);
  return assets.map((asset) => {
    const t = tickers.find((t) => t.symbol === asset.symbol);
    if (
      !t ||
      t.lowPrice > t.highPrice ||
      t.lastPrice < t.lowPrice ||
      t.lastPrice > t.highPrice ||
      t.closeTime > Date.now() + 60000
    )
      throw new Error('Invalid market response');
    return marketSchema.parse({
      symbol: t.symbol,
      price: t.lastPrice,
      change24h: t.priceChangePercent,
      quoteVolume: t.quoteVolume,
      high24h: t.highPrice,
      low24h: t.lowPrice,
      sourceTime: new Date(t.closeTime).toISOString(),
    });
  });
}
export function parseCandles(raw: unknown, now = Date.now(), interval?: Interval): Candle[] {
  const rows = z.array(z.array(z.unknown()).min(7)).min(1).max(180).parse(raw);
  let previous = -1;
  return rows.map((r) => {
    const c = candleSchema.parse({
      openTime: r[0],
      open: number.parse(r[1]),
      high: number.parse(r[2]),
      low: number.parse(r[3]),
      close: number.parse(r[4]),
      volume: number.parse(r[5]),
      closeTime: r[6],
      completed: Number(r[6]) < now,
    });
    if (c.openTime <= previous || c.openTime > now) throw new Error('Invalid candle ordering');
    if (interval) {
      const duration = {
        '15m': 900000,
        '1h': 3600000,
        '4h': 14400000,
        '1d': 86400000,
        '1w': 604800000,
        '1M': 0,
      }[interval];
      const date = new Date(c.openTime);
      const expectedEnd =
        interval === '1M'
          ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1
          : c.openTime + duration - 1;
      const aligned =
        interval === '1M'
          ? date.getUTCDate() === 1 &&
            date.getUTCHours() === 0 &&
            date.getUTCMinutes() === 0 &&
            date.getUTCSeconds() === 0 &&
            date.getUTCMilliseconds() === 0
          : (c.openTime + (interval === '1w' ? 3 * 86400000 : 0)) % duration === 0;
      if (c.closeTime !== expectedEnd || !aligned)
        throw new Error('Provider candle interval mismatch');
    }
    previous = c.closeTime;
    return c;
  });
}

export class BinanceProvider {
  private blockedUntil = 0;
  private active = 0;
  constructor(
    private timeout: number,
    private request: typeof fetch = fetch,
    private pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}
  private async json(path: string, params: Record<string, string>) {
    if (Date.now() < this.blockedUntil || this.active >= 4)
      throw new AppError(503, 'PROVIDER_BUSY', 'Market provider is busy.');
    this.active++;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const url = new URL(path, 'https://data-api.binance.vision');
          url.search = new URLSearchParams(params).toString();
          const response = await this.request(url, {
            signal: AbortSignal.timeout(this.timeout),
            redirect: 'error',
          });
          if (response.status === 429 || response.status === 418) {
            const retry = response.headers.get('retry-after');
            const seconds =
              retry && /^\d+$/.test(retry)
                ? Number(retry)
                : retry
                  ? (Date.parse(retry) - Date.now()) / 1000
                  : 60;
            this.blockedUntil =
              Date.now() + Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000;
            throw new AppError(503, 'PROVIDER_RATE_LIMITED', 'Market provider rate limit reached.');
          }
          if (!response.ok)
            throw new AppError(
              response.status >= 500 ? 503 : 502,
              'PROVIDER_ERROR',
              'Market provider rejected the request.',
            );
          return (await response.json()) as unknown;
        } catch (e) {
          if (e instanceof AppError && (e.code === 'PROVIDER_RATE_LIMITED' || e.status === 502))
            throw e;
          if (attempt === 1) throw e;
          await this.pause(250);
        }
      }
      throw new Error('Provider unavailable');
    } finally {
      this.active--;
    }
  }
  async markets() {
    // One batched ticker call, no per-asset historical requests.
    return parseMarkets(
      await this.json('/api/v3/ticker/24hr', {
        symbols: JSON.stringify(assets.map((a) => a.symbol)),
      }),
    );
  }
  async candles(symbol: Symbol, interval: Interval) {
    return parseCandles(
      await this.json('/api/v3/klines', { symbol, interval, limit: '180', timeZone: '0' }),
      Date.now(),
      interval,
    );
  }
}
