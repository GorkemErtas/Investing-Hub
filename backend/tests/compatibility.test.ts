import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { decodePortfolio, decodeSettings } from "../src/mobile/mongo";
import { createAlertWorker } from "../src/mobile/notifications";
import type { MobileRepository } from "../src/mobile/repository";
import type { MarketService } from "../src/market/service";

describe("non-destructive legacy schema adapter", () => {
  it("reads old BSON numbers and action/date fields into the shared decimal contract", () => {
    const raw = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      name: "Legacy",
      transactions: [
        {
          _id: new mongoose.Types.ObjectId(),
          symbol: "BTC",
          action: "buy" as const,
          quantity: 0.00000001,
          price: 100,
          date: new Date("2024-01-01T00:00:00.000Z"),
        },
      ],
    };
    const before = structuredClone(raw);
    const result = decodePortfolio(raw);
    expect(result.revision).toBe(0);
    expect(result.transactions[0]).toMatchObject({
      symbol: "BTCUSDT",
      side: "buy",
      quantity: "0.00000001",
      price: "100",
      fee: "0",
      timestamp: "2024-01-01T00:00:00.000Z",
    });
    expect(raw.transactions[0].quantity).toBe(before.transactions[0].quantity);
  });
  it("reads new decimal strings without rounding and blocks incompatible history without deleting it", () => {
    const raw = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      name: "Legacy",
      __v: 3,
      transactions: [
        {
          _id: new mongoose.Types.ObjectId(),
          symbol: "ETH",
          action: "buy" as const,
          quantity: "1.12345678",
          price: "2000.12345678",
          fee: "0.1",
          date: new Date(),
        },
      ],
    };
    expect(decodePortfolio(raw).transactions[0].quantity).toBe("1.12345678");
    const unsupported = {
      ...raw,
      transactions: [{ ...raw.transactions[0], symbol: "RETIRED" }],
    };
    expect(() => decodePortfolio(unsupported)).toThrow("Historical portfolio");
    expect(unsupported.transactions[0].symbol).toBe("RETIRED");
  });
  it("preserves unsupported historical favorites and excludes invalid old alert ranges without modifying storage", () => {
    const raw = {
      userId: new mongoose.Types.ObjectId(),
      selectedCoins: ["BTC", "MATIC"],
      priceAlerts: { BTC: { min: 0, max: Infinity }, ETH: { min: 1, max: 10 } },
    };
    expect(decodeSettings(raw)).toMatchObject({
      selectedCoins: ["BTC", "MATIC"],
      priceAlerts: { ETH: { min: 1, max: 10 } },
    });
    expect(raw.priceAlerts.BTC.max).toBe(Infinity);
  });
});
describe("optional price notification worker", () => {
  function fixture(stale = false) {
    const repo = {
      available: () => true,
      alertRecipients: vi.fn(async () => [
        {
          id: "user",
          token: "private-token",
          settings: {
            selectedCoins: ["BTC"],
            priceAlerts: { BTC: { min: 50, max: 100 } },
          },
        },
      ]),
      claimAlert: vi.fn(async () => true),
      restoreAlert: vi.fn(async () => {}),
    } as unknown as MobileRepository;
    const market = {
      markets: vi.fn(async () => ({
        data: [{ symbol: "BTCUSDT", price: 110 }],
        meta: { stale },
      })),
    } as unknown as MarketService;
    return { repo, market };
  }
  it("does not deliver alerts from stale quotes", async () => {
    const { repo, market } = fixture(true);
    const send = vi.fn();
    await createAlertWorker(repo, market, send)();
    expect(send).not.toHaveBeenCalled();
    expect(repo.alertRecipients).not.toHaveBeenCalled();
  });
  it("claims an alert once before sending and restores it after a provider failure", async () => {
    const { repo, market } = fixture();
    const send = vi.fn(async () => {
      throw new Error("provider failure");
    });
    await createAlertWorker(repo, market, send)();
    expect(repo.claimAlert).toHaveBeenCalledWith("user", "BTC", {
      min: 50,
      max: 100,
    });
    expect(repo.restoreAlert).toHaveBeenCalledWith("user", "BTC", {
      min: 50,
      max: 100,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
