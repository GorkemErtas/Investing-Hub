import { describe, expect, it } from "vitest";
import {
  analyticsReportSchema,
  analyticsAssetSchema,
  classificationMetricsSchema,
} from "../analytics.js";
import { analyticsFixture } from "./analytics-fixtures";
describe("bounded analytical research contracts", () => {
  it("includes all canonical assets with explicit missing-data states", () => {
    const report = analyticsFixture();
    expect(report.assets).toHaveLength(8);
    expect(report.assets.filter((a) => a.dataset)).toHaveLength(2);
    expect(
      analyticsReportSchema.safeParse({
        ...report,
        assets: report.assets.slice(1),
      }).success,
    ).toBe(false);
    expect(
      analyticsReportSchema.safeParse({ ...report, hypothesisFamilySize: 9 })
        .success,
    ).toBe(false);
  });
  it("rejects made-up count/accuracy or inappropriate single-class ranking metrics", () => {
    const metrics = analyticsFixture().assets[0].classifiers[0].metrics!;
    expect(
      classificationMetricsSchema.safeParse({ ...metrics, accuracy: 0.9 })
        .success,
    ).toBe(false);
    expect(
      classificationMetricsSchema.safeParse({
        ...metrics,
        confusion: [0, 0, 0, 4],
      }).success,
    ).toBe(false);
    expect(
      classificationMetricsSchema.safeParse({
        ...metrics,
        samples: 4,
        positives: 0,
        prevalence: 0,
        confusion: [4, 0, 0, 0],
        accuracy: 1,
      }).success,
    ).toBe(false);
  });
  it("prevents training/validation leakage and invented labeled anomaly accuracy", () => {
    const asset = analyticsFixture().assets[0];
    expect(
      analyticsAssetSchema.safeParse({
        ...asset,
        classifiers: [
          {
            ...asset.classifiers[0],
            trainEnd: asset.classifiers[0].evaluationEnd,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      analyticsAssetSchema.safeParse({
        ...asset,
        anomalies: { ...asset.anomalies, precision: 1 },
      }).success,
    ).toBe(false);
  });
  it("rejects incomplete distributions, future anomaly references and wrong dataset hashes", () => {
    const asset = analyticsFixture().assets[0];
    expect(
      analyticsAssetSchema.safeParse({
        ...asset,
        statistics: { ...asset.statistics, histogram: [] },
      }).success,
    ).toBe(false);
    expect(
      analyticsAssetSchema.safeParse({
        ...asset,
        anomalies: {
          ...asset.anomalies,
          events: [
            {
              ...asset.anomalies!.events[0],
              referenceEnd: asset.anomalies!.events[0].time,
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      analyticsAssetSchema.safeParse({
        ...asset,
        classifiers: [
          { ...asset.classifiers[0], datasetFingerprint: "f".repeat(64) },
        ],
      }).success,
    ).toBe(false);
  });
});
