import { describe, expect, it } from "vitest";
import { hybridAnalysisSchema } from "../hybrid.js";

const unavailable = {
  contractVersion: "hybrid-analysis-v1",
  symbol: "BTCUSDT",
  horizon: "1d",
  generatedAt: "2026-11-06T00:05:00.000Z",
  targetCloseTime: "2026-11-06T23:59:59.999Z",
  ml: {
    status: "unavailable",
    reason: "No approved model",
    modelVersion: null,
    predictedReturn: null,
    predictedPrice: null,
    calibration: null,
  },
  observations: [],
  outlook: "unavailable",
  explanation: "",
  supportingObservationIds: [],
  explanationProvider: null,
};

describe("future hybrid analysis contract", () => {
  it("keeps disabled ML values null and refuses invented outlooks", () => {
    expect(hybridAnalysisSchema.safeParse(unavailable).success).toBe(true);
    expect(
      hybridAnalysisSchema.safeParse({
        ...unavailable,
        ml: { ...unavailable.ml, predictedPrice: 1 },
      }).success,
    ).toBe(false);
    expect(
      hybridAnalysisSchema.safeParse({ ...unavailable, outlook: "bullish" })
        .success,
    ).toBe(false);
  });

  it("requires numeric ML parity, completed source and calibration evidence", () => {
    const value = {
      ...unavailable,
      ml: {
        status: "validated",
        modelVersion: "local-v1",
        validationReference: "registry/local-v1",
        predictedReturn: 0.01,
        predictedPrice: 101,
        referencePrice: 100,
        sourceCandleCloseTime: "2026-11-05T23:59:59.999Z",
        calibration: null,
      },
    };
    expect(hybridAnalysisSchema.safeParse(value).success).toBe(true);
    expect(
      hybridAnalysisSchema.safeParse({
        ...value,
        ml: { ...value.ml, predictedPrice: 200 },
      }).success,
    ).toBe(false);
    expect(
      hybridAnalysisSchema.safeParse({
        ...value,
        targetCloseTime: "2026-11-05T23:59:59.999Z",
      }).success,
    ).toBe(false);
    expect(
      hybridAnalysisSchema.safeParse({
        ...value,
        ml: { ...value.ml, calibration: { intervalCoverage: 0.99 } },
      }).success,
    ).toBe(false);
  });

  it("rejects missing evidence references and future publications", () => {
    const value = {
      ...unavailable,
      observations: [
        {
          id: "event-1",
          kind: "news",
          sourceUrl: "https://example.test/source",
          publishedAt: "2026-11-05T23:00:00.000Z",
          observedAt: "2026-11-06T00:00:00.000Z",
          evidenceExcerpt: "Test evidence",
          sentiment: "neutral",
          uncertainty: "high",
        },
      ],
      outlook: "neutral",
      supportingObservationIds: ["event-1"],
    };
    expect(hybridAnalysisSchema.safeParse(value).success).toBe(true);
    expect(
      hybridAnalysisSchema.safeParse({
        ...value,
        supportingObservationIds: ["invented"],
      }).success,
    ).toBe(false);
    expect(
      hybridAnalysisSchema.safeParse({
        ...value,
        observations: [
          { ...value.observations[0], publishedAt: "2026-11-07T00:00:00.000Z" },
        ],
      }).success,
    ).toBe(false);
    expect(
      hybridAnalysisSchema.safeParse({ ...value, probability: 0.99 }).success,
    ).toBe(false);
  });
});
