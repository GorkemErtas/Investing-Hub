import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const meta = {
  provider: "Binance public market data",
  quoteCurrency: "USDT",
  fetchedAt: new Date().toISOString(),
  sourceTime: new Date().toISOString(),
  stale: false,
};
describe("mobile typed API and session adapter", () => {
  it("deduplicates market calls made by multiple dashboard components and keeps the USDT contract", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  symbol: "BTCUSDT",
                  price: 100,
                  change24h: 2,
                  quoteVolume: 10,
                  high24h: 110,
                  low24h: 90,
                  sourceTime: meta.sourceTime,
                },
              ],
              meta,
            }),
          ),
      );
    vi.stubGlobal("fetch", fetcher);
    const { marketRows } = await import("../services/api");
    const [first, second] = await Promise.all([marketRows(), marketRows()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.data[0]).toMatchObject({
      symbol: "BTC",
      price: 100,
      dailyChange: 2,
    });
    expect(second.meta.quoteCurrency).toBe("USDT");
  });
  it("notifies the auth provider on expired private sessions and uses memory-only tokens for browser preview", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "SESSION_EXPIRED",
                message: "Please log in again.",
              },
            }),
            { status: 401 },
          ),
      );
    vi.stubGlobal("fetch", fetcher);
    const { tokenStore } = await import("../services/tokenStore");
    expect(await tokenStore.get()).toBeNull();
    await tokenStore.set("test-session");
    const { api, onUnauthorized } = await import("../services/api");
    const invalidated = vi.fn();
    const unsubscribe = onUnauthorized(invalidated);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(invalidated).toHaveBeenCalledTimes(1);
    unsubscribe();
    await tokenStore.clear();
    expect(await tokenStore.get()).toBeNull();
    const headers = fetcher.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-session");
  });
  it("maps OHLCV without inventing open, high or low prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockImplementation(
          async () =>
            new Response(
              JSON.stringify({
                symbol: "BTCUSDT",
                interval: "1d",
                meta,
                data: [
                  {
                    openTime: 1704067200000,
                    closeTime: 1704153599999,
                    open: 100,
                    high: 125,
                    low: 90,
                    close: 110,
                    volume: 4,
                    completed: true,
                  },
                ],
              }),
            ),
        ),
    );
    const { chartRows, intervalFor, symbolFor } =
      await import("../services/api");
    const result = await chartRows("BTC", "1d");
    expect(result.line[0]).toEqual({ time: 1704067200000, price: 110 });
    expect(result.candles[0]).toEqual({
      timestamp: 1704067200000,
      open: 100,
      high: 125,
      low: 90,
      close: 110,
    });
    expect(() => intervalFor("2h")).toThrow();
    expect(() => symbolFor("RETIRED")).toThrow();
  });
});
