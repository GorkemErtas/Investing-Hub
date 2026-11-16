import { describe, expect, it } from "vitest";
import { forecastHorizonSchema, forecastSchema } from "../forecasts";
import { forecastFixture } from "./forecasts-fixtures";

describe("strict multi-horizon contract", () => {
  it("distinguishes calendar months and validates direct log-return price alignment", () => {
    for (const h of ["1m", "15m", "1h"] as const) expect(forecastSchema.safeParse(forecastFixture("BTCUSDT", h)).success).toBe(true);
    expect(forecastHorizonSchema.parse("1M")).toBe("1M");
    expect(forecastHorizonSchema.safeParse("1H").success).toBe(false);
    expect(forecastSchema.safeParse(forecastFixture("BTCUSDT", "1M")).success).toBe(false);
  });
  it("rejects unvalidated, ambiguous, misaligned and nonfinite values", () => {
    for (const patch of [{ stale: true }, { predictedPrice: 200 }, { predictedLogReturn: Infinity },
      { algorithm: "naive" }, { featureSchema: null }, { evaluationMetrics: null },
      { sourceCandleTime: new Date().toISOString() }, { unknownField: 1 },
      { status: "unavailable" }]) {
      expect(forecastSchema.safeParse({ ...forecastFixture(), ...patch }).success).toBe(false);
    }
  });
});
