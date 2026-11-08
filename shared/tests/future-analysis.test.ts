import { describe, expect, it } from "vitest";
import { assets, symbolSchema } from "../contracts.js";
import {
  futureAnalysisSchema,
  numericForecastSchema,
  groundedReportSchema,
  reviewContentSchema,
  reviewFromGroundedText,
} from "../future-analysis.js";
import {
  analysisFixture,
  numericFixture,
  mlFixture,
  reviewFixture,
  textReviewFixture,
} from "./future-fixtures";

describe("Future Analysis trust boundaries", () => {
  it("extracts the existing report sections verbatim from grounded plain text", () => {
    const report = textReviewFixture(mlFixture());
    expect(reviewFromGroundedText(report.text, report.content)).toEqual(
      report.content,
    );
    expect(report.content).toEqual(reviewFixture(mlFixture()).content);
    for (const text of [
      report.text.replaceAll("## ", ""),
      report.text
        .replaceAll("## ", "")
        .replace(/^(Summary|Risks)$/gm, "**$1:**"),
    ])
      expect(reviewFromGroundedText(text, report.content)).toEqual(
        report.content,
      );
    expect(
      groundedReportSchema.safeParse({
        ...report,
        content: {
          ...report.content,
          executiveSummary:
            "This statement was invented and never appeared in the research.",
        },
      }).success,
    ).toBe(false);
    expect(() =>
      reviewFromGroundedText(
        report.text + "\n\n## Summary\nDuplicate summary.",
        report.content,
      ),
    ).toThrow();
  });
  it.each(assets)("supports the canonical $symbol asset", (asset) => {
    expect(symbolSchema.parse(asset.symbol)).toBe(asset.symbol);
    expect(
      futureAnalysisSchema.safeParse(analysisFixture(asset.symbol)).success,
    ).toBe(true);
  });
  it.each([0.01, -0.01, 0])(
    "derives direction from the exact ML return %s",
    (change) => {
      expect(
        numericForecastSchema.safeParse(
          numericFixture("BTCUSDT", undefined, change),
        ).success,
      ).toBe(true);
      expect(
        numericForecastSchema.safeParse({
          ...numericFixture("BTCUSDT", undefined, change),
          direction: "OTHER",
        }).success,
      ).toBe(false);
    },
  );
  it.each([
    { predictedPrice: 105 },
    { direction: "DOWN" },
    { neutralThreshold: 0.05 },
    { horizon: "7d" },
    { targetCloseTime: "2026-11-09T23:59:59.999Z" },
    { trainedAt: "2026-11-09T00:00:00.000Z" },
  ])("rejects invalid ML parity/chronology %j", (patch) => {
    expect(
      numericForecastSchema.safeParse({ ...numericFixture(), ...patch })
        .success,
    ).toBe(false);
  });
  it("rejects reversed, uncalibrated and noncausal intervals", () => {
    const data = numericFixture();
    for (const patch of [
      { lowerPrice: 110 },
      { empiricalCoverage: 0.3 },
      { calibrationEnd: data.interval.validationStart },
      { status: "experimental" },
    ])
      expect(
        numericForecastSchema.safeParse({
          ...data,
          interval: { ...data.interval, ...patch },
        }).success,
      ).toBe(false);
  });
  it("withholds unvalidated numbers and refuses AI numeric override fields", () => {
    const response = analysisFixture();
    expect(
      futureAnalysisSchema.safeParse({
        ...response,
        ml: { ...response.ml, status: "unavailable" },
      }).success,
    ).toBe(false);
    const content = reviewFixture(mlFixture()).content;
    expect(
      reviewContentSchema.safeParse({ ...content, correctedPrice: 120 })
        .success,
    ).toBe(false);
  });
  it("checks exact grounding byte spans and genuine source references", () => {
    const report = reviewFixture(mlFixture());
    expect(
      groundedReportSchema.safeParse({
        ...report,
        citations: [{ ...report.citations[0], sourceIds: ["fabricated"] }],
      }).success,
    ).toBe(false);
    expect(
      groundedReportSchema.safeParse({
        ...report,
        citations: [{ ...report.citations[0], quote: "fabricated quote" }],
      }).success,
    ).toBe(false);
    expect(
      groundedReportSchema.safeParse({
        ...report,
        sources: [{ ...report.sources[0], url: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
  });
  it("binds a review to the same symbol, model and forecast fingerprint", () => {
    const response = analysisFixture("BTCUSDT", undefined, true, true),
      data = response.research.data!;
    const altered = {
      ...data,
      content: { ...data.content, mlModelId: "OTHER" },
    };
    expect(
      futureAnalysisSchema.safeParse({
        ...response,
        research: { ...response.research, data: altered },
      }).success,
    ).toBe(false);
    expect(
      futureAnalysisSchema.safeParse({
        ...response,
        forecastFingerprint: "f".repeat(64),
      }).success,
    ).toBe(false);
    const researchOnly = analysisFixture("SOLUSDT", undefined, false, true);
    expect(researchOnly.ml.data).toBeNull();
    expect(researchOnly.conflict).toBeNull();
  });
});
