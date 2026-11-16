import type { Symbol } from "../contracts.js";
import type { Forecast, ForecastHorizon } from "../forecasts.js";
import { horizonMilliseconds } from "../forecasts.js";

// Explicitly synthetic API evidence; never imported by application code.
export function forecastFixture(
  symbol: Symbol = "BTCUSDT",
  horizon: ForecastHorizon = "1m",
  now = Date.now(),
): Forecast {
  const source = Math.floor(now / 60000) * 60000 - 1;
  return {
    version: "forecast-v2",
    symbol,
    horizon,
    status: "experimental",
    reason: "test_fixture_only",
    stale: false,
    referencePrice: 100,
    predictedPrice: 101,
    predictedLogReturn: Math.log(1.01),
    sourceCandleTime: new Date(source).toISOString(),
    generatedAt: new Date(now).toISOString(),
    marketUpdatedAt: new Date(now).toISOString(),
    targetTime: new Date(
      source + (horizonMilliseconds[horizon] ?? 1),
    ).toISOString(),
    modelVersion: "synthetic-test-model-v2",
    algorithm: "ridge",
    featureSchema: "minute-finite-v2.1",
    datasetFingerprint: "a".repeat(64),
    evaluationMetrics: {
      validationReturnRmse: 0.001,
      holdoutReturnRmse: 0.002,
      baselineHoldoutReturnRmse: 0.003,
      holdoutDirectionalAccuracy: 0.51,
    },
  };
}
