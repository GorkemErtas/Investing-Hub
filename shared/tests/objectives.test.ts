import { describe, expect, it } from "vitest";
import { objectiveForecastSchema } from "../objectives";
import { objectiveFixture } from "./objective-fixtures";

describe("independent direction and volatility contracts", () => {
  it("requires calibrated probabilities, measured intervals and future confirmation", () => {
    expect(objectiveForecastSchema.safeParse(objectiveFixture()).success).toBe(
      true,
    );
    for (const mutate of [
      (f: ReturnType<typeof objectiveFixture>) => {
        f.direction.calibrated = false;
      },
      (f: ReturnType<typeof objectiveFixture>) => {
        f.direction.probabilities!.up = 0.9;
      },
      (f: ReturnType<typeof objectiveFixture>) => {
        f.direction.evaluation!.futureConfirmed = false;
      },
      (f: ReturnType<typeof objectiveFixture>) => {
        f.volatility.interval!.measuredCoverage = 0.7;
      },
      (f: ReturnType<typeof objectiveFixture>) => {
        f.volatility.expectedVolatility = Infinity;
      },
    ]) {
      const f = objectiveFixture();
      mutate(f);
      expect(objectiveForecastSchema.safeParse(f).success).toBe(false);
    }
    expect(
      objectiveForecastSchema.safeParse(objectiveFixture("BTCUSDT", "1M"))
        .success,
    ).toBe(false);
  });
  it("permits either objective to be unavailable independently", () => {
    const f = objectiveFixture();
    f.volatility = {
      status: "unavailable",
      reason: "no_model",
      generatedAt: null,
      modelVersion: null,
      algorithm: null,
      evaluation: null,
      expectedVolatility: null,
      riskCategory: null,
      interval: null,
      units: "horizon_log_return_std",
    };
    expect(objectiveForecastSchema.safeParse(f).success).toBe(true);
    f.volatility.expectedVolatility = 0.1;
    expect(objectiveForecastSchema.safeParse(f).success).toBe(false);
  });
});
