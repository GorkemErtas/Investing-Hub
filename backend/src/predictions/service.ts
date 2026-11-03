import type { Symbol } from "@investing-hub/shared/contracts";

export function predictionStatus(symbol: Symbol) {
  return {
    symbol,
    target: "next_daily_close" as const,
    horizon: "1d" as const,
    predictionTimestamp: new Date().toISOString(),
    sourceDataTimestamp: null,
    modelVersion: null,
    predictedValue: null,
    evaluationReference: "/research",
    status: "disabled_unvalidated" as const,
    reason:
      "Legacy models have no verifiable training provenance. Research experiments are offline; no model has been approved for inference.",
  };
}
