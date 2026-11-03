import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { parseConfig } from "../src/config";
import type { MarketService } from "../src/market/service";

const config = parseConfig({ NODE_ENV: "test" });
const market: MarketService = {
  markets: vi.fn(async () => ({
    data: [],
    meta: {
      provider: "Binance public market data" as const,
      quoteCurrency: "USDT" as const,
      fetchedAt: new Date().toISOString(),
      sourceTime: new Date().toISOString(),
      stale: false,
    },
  })),
  candles: vi.fn(),
};
describe("guest API security and contracts", () => {
  it("starts without database, account, JWT or provider credentials", async () => {
    const res = await request(createApp(config, market)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("guest-demo");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
  it("allows exact configured origins and rejects others", async () => {
    const app = createApp(config, market);
    expect(
      (
        await request(app)
          .get("/api/health")
          .set("Origin", "http://localhost:3000")
      ).headers["access-control-allow-origin"],
    ).toBe("http://localhost:3000");
    expect(
      (
        await request(app)
          .get("/api/health")
          .set("Origin", "https://attacker.example")
      ).status,
    ).toBe(403);
  });
  it.each([
    "/portfolios?userId=other",
    "/settings/other",
    "/refresh-data",
    "/predict/lstm/BTC/1d",
    "/crypto-news",
    "/login",
  ])("removes legacy surface %s", async (path) => {
    const app = createApp(config, market);
    expect((await request(app).get(path)).status).toBe(404);
    expect(
      (await request(app).post(path).send({ userId: "other" })).status,
    ).toBe(404);
  });
  it.each([
    "/api/candles/BTC",
    "/api/candles/BTCUSDT?interval=2h",
    "/api/candles/BTCUSDT?interval=1d&limit=50000",
    "/api/markets?refresh=true",
    "/api/predictions/UNKNOWN",
  ])("rejects invalid request %s", async (path) => {
    expect((await request(createApp(config, market)).get(path)).status).toBe(
      400,
    );
  });
  it("never presents an unvalidated prediction as a price", async () => {
    const res = await request(createApp(config, market)).get(
      "/api/predictions/BTCUSDT",
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      symbol: "BTCUSDT",
      horizon: "1d",
      target: "next_daily_close",
      status: "disabled_unvalidated",
      predictedValue: null,
      modelVersion: null,
      sourceDataTimestamp: null,
    });
  });
  it("hides unexpected internal errors", async () => {
    const failing = {
      ...market,
      markets: async () => {
        throw new Error("sensitive provider payload");
      },
    };
    const res = await request(createApp(config, failing)).get("/api/markets");
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("sensitive");
  });
  it("limits public requests even when spoofing forwarded IPs", async () => {
    const app = createApp(config, market);
    let status = 0;
    for (let i = 0; i < 121; i++)
      status = (
        await request(app)
          .get("/api/predictions/BTCUSDT")
          .set("X-Forwarded-For", `192.0.2.${i}`)
      ).status;
    expect(status).toBe(429);
  });
  it("fails unsafe environment configuration", () => {
    for (const env of [
      { PORT: "0" },
      { CORS_ORIGINS: "*" },
      { CORS_ORIGINS: "https://example.com/path" },
      { MARKET_CACHE_SECONDS: "100", MARKET_STALE_SECONDS: "60" },
      { NODE_ENV: "production", CORS_ORIGINS: "http://example.com" },
    ])
      expect(() => parseConfig(env)).toThrow();
  });
});
