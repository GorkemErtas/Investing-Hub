import { describe, expect, it } from "vitest";
import { assets } from "../contracts.js";
import { experimentalFixture, analysisFixture } from "./future-fixtures.js";
import {
  experimentalForecastSchema,
  experimentalPublicationSchema,
  futureAnalysisSchema,
  mlPublicationSchema,
} from "../future-analysis.js";

describe("experimental forecast boundaries", () => {
  it("admits losing candidates without prospective samples or an interval for all eight assets", () => {
    for (const asset of assets) {
      const result = experimentalFixture(asset.symbol);
      expect(result.data.validation.historicalGatePassed).toBe(false);
      expect(result.data.validation.forwardSamples).toBe(0);
      expect(result.data.interval).toBeNull();
      const base = analysisFixture(asset.symbol);
      expect(
        futureAnalysisSchema.parse({
          ...base,
          mode: "experimental",
          ml: result,
        }).ml.status,
      ).toBe("experimental");
      expect(
        futureAnalysisSchema.safeParse({
          ...base,
          mode: "approved",
          ml: result,
        }).success,
      ).toBe(false);
    }
  });
  it("keeps experimental snapshots separate from approved publication", () => {
    const publication = {
      version: "ml-experimental-v1",
      generatedAt: new Date().toISOString(),
      registry: { size: 0, mtimeNs: "1" },
      forecasts: assets.map((asset) => experimentalFixture(asset.symbol)),
    };
    expect(experimentalPublicationSchema.safeParse(publication).success).toBe(
      true,
    );
    expect(
      mlPublicationSchema.safeParse({
        ...publication,
        version: "ml-publication-v1",
      }).success,
    ).toBe(false);
    expect(
      experimentalPublicationSchema.safeParse({
        ...publication,
        forecasts: publication.forecasts.map(() => publication.forecasts[0]),
      }).success,
    ).toBe(false);
  });
  it("checks original numerical values, chronology and genuine optional intervals", () => {
    const data = experimentalFixture(undefined, undefined, true).data;
    expect(experimentalForecastSchema.safeParse(data).success).toBe(true);
    for (const changed of [
      { predictedPrice: data.predictedPrice + 1 },
      { direction: "DOWN" },
      { generatedAt: data.targetCloseTime },
      { trainedAt: data.targetCloseTime },
      { interval: { ...data.interval, lowerPrice: 1 } },
      { interval: { ...data.interval, empiricalCoverage: 0.8 } },
      { validation: { ...data.validation, status: "approved_prospective" } },
    ])
      expect(
        experimentalForecastSchema.safeParse({ ...data, ...changed }).success,
      ).toBe(false);
  });
});
