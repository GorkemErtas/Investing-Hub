import { describe, expect, it } from "vitest";
import { assets, predictionSchema } from "../contracts.js";
import { predictionPublicationSchema } from "../predictions.js";
import { predictionFixture, predictionTestNow } from "./predictions-fixtures";
describe("numeric prediction contract", () => {
  it.each(assets)(
    "preserves the numeric next-day $symbol estimate",
    ({ symbol }) => {
      const result = predictionSchema.parse(predictionFixture(symbol));
      expect(result.status).toBe("experimental");
      expect(result.predictedValue).toBe(
        result.referencePrice! * (1 + result.predictedReturn!),
      );
      expect(
        Date.parse(result.targetTimestamp!) -
          Date.parse(result.sourceDataTimestamp!),
      ).toBe(86400000);
    },
  );
  it.each([
    { predictedValue: 999 },
    { targetTimestamp: "2026-11-10T23:59:59.999Z" },
    { modelVersion: null },
    { datasetFingerprint: null },
    { predictionTimestamp: "2026-11-07T12:00:00.000Z" },
  ])("rejects corrupted parity/provenance/chronology %j", (patch) => {
    expect(
      predictionSchema.safeParse({ ...predictionFixture(), ...patch }).success,
    ).toBe(false);
  });
  it("requires explicit unavailable output without invented numbers", () => {
    const result = predictionFixture("BTCUSDT", predictionTestNow, false);
    expect(predictionSchema.parse(result).predictedValue).toBeNull();
    expect(
      predictionSchema.safeParse({ ...result, predictedValue: 100 }).success,
    ).toBe(false);
  });
  it("requires all eight symbols exactly once", () => {
    const report = {
      version: "price-predictions-v1",
      generatedAt: new Date(predictionTestNow).toISOString(),
      registry: { size: 1, mtimeNs: "1" },
      forecasts: assets.map(({ symbol }) => predictionFixture(symbol)),
    };
    expect(predictionPublicationSchema.safeParse(report).success).toBe(true);
    report.forecasts[1] = report.forecasts[0];
    expect(predictionPublicationSchema.safeParse(report).success).toBe(false);
  });
});
