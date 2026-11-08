import { assets, predictionSchema, type Symbol } from "../contracts.js";
export const predictionTestNow = Date.parse("2026-11-08T12:00:00.000Z");
export function predictionFixture(
  symbol: Symbol = "BTCUSDT",
  now = predictionTestNow,
  available = true,
) {
  const start = Math.floor(now / 86400000) * 86400000;
  const reference =
    100 + assets.findIndex((asset) => asset.symbol === symbol) * 10;
  return predictionSchema.parse({
    symbol,
    target: "next_daily_close",
    horizon: "1d",
    predictionTimestamp: new Date(now).toISOString(),
    sourceDataTimestamp: available ? new Date(start - 1).toISOString() : null,
    targetTimestamp: available
      ? new Date(start + 86400000 - 1).toISOString()
      : null,
    modelVersion: available ? `${symbol}-ridge-TEST-FIXTURE` : null,
    algorithm: available ? "ridge" : null,
    datasetFingerprint: available ? "a".repeat(64) : null,
    referencePrice: available ? reference : null,
    predictedReturn: available ? 0.01 : null,
    predictedValue: available ? reference * 1.01 : null,
    evaluationReference: "ml:TEST-FIXTURE",
    status: available ? "experimental" : "unavailable",
    reason: available ? "Experimental local estimate." : "no_selected_model",
  });
}
