import type { Config } from "../config.js";
import type { Interval, Symbol } from "@investing-hub/shared/contracts";
import { SharedCache } from "./cache.js";
import { BinanceProvider } from "./provider.js";

export function createMarketService(
  config: Config,
  provider = new BinanceProvider(config.MARKET_TIMEOUT_MS),
) {
  const cache = new SharedCache(
    config.MARKET_CACHE_SECONDS * 1000,
    config.MARKET_STALE_SECONDS * 1000,
  );
  const meta = (fetchedAt: string, sourceTime: string, stale: boolean) => ({
    provider: "Binance public market data" as const,
    quoteCurrency: "USDT" as const,
    fetchedAt,
    sourceTime,
    stale:
      stale ||
      Date.now() - Date.parse(sourceTime) > config.MARKET_STALE_SECONDS * 1000,
  });
  return {
    async markets() {
      const r = await cache.get("markets", () => provider.markets());
      const sourceTime = new Date(
        Math.min(...r.data.map((t) => Date.parse(t.sourceTime))),
      ).toISOString();
      return { data: r.data, meta: meta(r.fetchedAt, sourceTime, r.stale) };
    },
    async candles(symbol: Symbol, interval: Interval) {
      const r = await cache.get(`candles:${symbol}:${interval}`, () =>
        provider.candles(symbol, interval),
      );
      const last = r.data.at(-1)!;
      // Completion is time dependent; recompute it on cache hits as well.
      const data = r.data.map((c) => ({
        ...c,
        completed: c.closeTime < Date.now(),
      }));
      // Klines expose candle boundaries, not a last-trade publication time.
      // Report the real open timestamp; freshness is cache age plus interval coverage.
      return {
        symbol,
        interval,
        data,
        meta: {
          provider: "Binance public market data" as const,
          quoteCurrency: "USDT" as const,
          fetchedAt: r.fetchedAt,
          sourceTime: new Date(last.openTime).toISOString(),
          stale: r.stale || last.closeTime < Date.now() - 60000,
        },
      };
    },
  };
}
export type MarketService = ReturnType<typeof createMarketService>;
