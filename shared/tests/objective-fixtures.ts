import type { Symbol } from "../contracts.js";
import { horizonMilliseconds, type ForecastHorizon } from "../forecasts.js";
import type { ObjectiveForecast } from "../objectives.js";

// Future-dated synthetic fixtures exercise acceptance paths; never used in application data.
export const objectiveTestNow = Date.parse("2027-03-02T10:30:01.000Z");
export function objectiveFixture(
  symbol: Symbol = "BTCUSDT",
  horizon: ForecastHorizon = "1m",
  now = objectiveTestNow,
): ObjectiveForecast {
  const source = Math.floor(now / 60000) * 60000 - 1;
  const target = source + (horizonMilliseconds[horizon] ?? 1);
  const evaluation = {
    period: "future" as const,
    candidate: "synthetic-objective-test",
    primaryLoss: 0.7,
    baselineRelativeImprovement: 0.02,
    calibrationError: 0.02,
    intervalCoverage: 0.9,
    developmentEligible: true,
    futureConfirmed: true,
    confirmationEnd: "2027-03-01T00:00:00.000Z",
  };
  const common = {
    status: "validated" as const,
    reason: "test_fixture_only",
    generatedAt: new Date(now).toISOString(),
    modelVersion: "synthetic-objective-v3",
    algorithm: "logistic" as const,
    evaluation,
  };
  return {
    version: "forecast-objectives-v3",
    symbol,
    horizon,
    stale: false,
    generatedAt: new Date(now).toISOString(),
    marketUpdatedAt: new Date(now).toISOString(),
    sourceCandleTime: new Date(source).toISOString(),
    targetTime: new Date(target).toISOString(),
    expiresAt: new Date(Math.min(source + 90000, target)).toISOString(),
    direction: {
      ...common,
      direction: "up",
      probabilities: { down: 0.15, neutral: 0.2, up: 0.65 },
      calibrated: true,
    },
    volatility: {
      ...common,
      algorithm: "har_rv",
      expectedVolatility: 0.004,
      riskCategory: "medium",
      units: "horizon_log_return_std",
      interval: {
        lower: 0.001,
        upper: 0.009,
        nominalCoverage: 0.9,
        measuredCoverage: 0.9,
        method: "past_split_conformal",
      },
    },
  };
}
