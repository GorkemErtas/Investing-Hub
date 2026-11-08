import { createHash } from "node:crypto";
import { assets, type Symbol } from "../contracts.js";
import {
  numericForecastSchema,
  mlResultSchema,
  experimentalResultSchema,
  type AnalysisMlResult,
  groundedReportSchema,
  futureAnalysisSchema,
  type NumericForecast,
  type MlResult,
  type GroundedReport,
  type ReviewContent,
} from "../future-analysis.js";

// Synthetic evidence is test-only. Application modules never import this file.
export const testNow = Date.parse("2026-11-07T12:00:00.000Z");
const iso = (value: number) => new Date(value).toISOString();
export function numericFixture(
  symbol: Symbol = assets[0].symbol,
  now = testNow,
  change = 0.01,
): NumericForecast {
  const source = Math.floor(now / 86400000) * 86400000 - 1;
  return numericForecastSchema.parse({
    authority: "ml",
    symbol,
    horizon: "1d",
    priceUnit: "USDT",
    generatedAt: iso(source + 1001),
    sourceCandleCloseTime: iso(source),
    targetCloseTime: iso(source + 86400000),
    referencePrice: 100,
    predictedPrice: 100 * (1 + change),
    predictedReturn: change,
    direction: change > 0 ? "UP" : change < 0 ? "DOWN" : "NEUTRAL",
    neutralThreshold: 0,
    modelId: `${symbol}-TEST-FIXTURE-MODEL`,
    forecastId: "a".repeat(64),
    trainedAt: iso(source - 86400000),
    modelExpiresAt: iso(source + 80 * 86400000),
    datasetFingerprint: "b".repeat(64),
    dataQuality: {
      rows: 1000,
      missingDays: 0,
      provenance: "verified_binance_ohlcv",
    },
    validation: {
      status: "approved_prospective",
      historicalReference: "ml:TEST-FIXTURE-historical",
      forwardReference: "ml:TEST-FIXTURE-forward",
      forwardSamples: 35,
      evaluatedAt: iso(source + 501),
      policy: {
        requiredRelativeRmseImprovement: 0.02,
        minimumFoldWins: 3,
        minimumFoldCount: 4,
        minimumForwardSamples: 30,
      },
      metrics: {
        selectionReturnRmse: 0.009,
        baselineReturnRmse: 0.01,
        prospectiveReturnRmse: 0.008,
        prospectiveBaselineReturnRmse: 0.01,
        foldWins: 3,
        foldCount: 4,
      },
    },
    interval: {
      method: "chronological_oos_absolute_return_quantile_v1",
      status: "empirically_calibrated",
      nominalCoverage: 0.9,
      empiricalCoverage: 0.92,
      radiusReturn: 0.04,
      calibrationSamples: 270,
      validationSamples: 90,
      calibrationEnd: iso(source - 180 * 86400000),
      validationStart: iso(source - 179 * 86400000),
      evaluatedAt: iso(source - 2 * 86400000),
      lowerPrice: 100 * (1 + change - 0.04),
      upperPrice: 100 * (1 + change + 0.04),
    },
  });
}
export function mlFixture(
  symbol: Symbol = assets[0].symbol,
  now = testNow,
  ready = true,
): MlResult {
  return mlResultSchema.parse({
    symbol,
    status: ready ? "validated" : "unavailable",
    reason: ready ? null : "no_active_approved_model",
    data: ready ? numericFixture(symbol, now) : null,
  });
}
export function fixtureFingerprint(
  ml: AnalysisMlResult,
  freshness: "fresh" | "stale" | "unavailable" = ml.data
    ? "fresh"
    : "unavailable",
  mode: "approved" | "experimental" = "approved",
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ml,
        freshness,
        ...(mode === "experimental" ? { mode } : {}),
      }),
    )
    .digest("hex");
}
export function experimentalFixture(
  symbol: Symbol = assets[0].symbol,
  now = testNow,
  interval = false,
) {
  const approved = numericFixture(symbol, now);
  return experimentalResultSchema.parse({
    symbol,
    status: "experimental",
    reason: null,
    data: {
      ...approved,
      interval: interval ? approved.interval : null,
      validation: {
        status: "experimental_not_validated",
        algorithm: "ridge",
        trainingWindow: "full",
        historicalReference: "ml:TEST-FIXTURE-historical",
        selectionRule: "lowest_selection_return_rmse_then_model_id_v1",
        eligibleCandidates: 12,
        selectionReturnRmse: 0.011,
        baselineReturnRmse: 0.01,
        selectionSamples: 90,
        selectionStart: iso(Date.parse(approved.trainedAt) - 91 * 86400000),
        selectionEnd: iso(Date.parse(approved.trainedAt) - 86400000),
        foldWins: 1,
        foldCount: 4,
        historicalGatePassed: false,
        forwardSamples: 0,
      },
    },
  });
}
export function reviewFixture(
  ml: AnalysisMlResult,
  fingerprint = fixtureFingerprint(ml),
  now = testNow,
  status: ReviewContent["reviewStatus"] = ml.data
    ? "CONFLICTING_EVIDENCE"
    : "HIGH_UNCERTAINTY",
): GroundedReport {
  const asset = assets.find((item) => item.symbol === ml.symbol)!;
  const content: ReviewContent = {
    symbol: ml.symbol,
    horizon: "1d",
    mlModelId: ml.data?.modelId ?? null,
    forecastFingerprint: fingerprint,
    reviewStatus: status,
    overallOutlook: "mixed",
    executiveSummary: `TEST FIXTURE Reported ${asset.name} context is mixed and requires caution.`,
    criticalReview: `TEST FIXTURE ${asset.name} evidence may conflict with the supplied model; context does not establish forecasting accuracy.`,
    developments: [
      `TEST FIXTURE Reported ${asset.name} project maintenance was announced.`,
    ],
    risks: [
      `TEST FIXTURE Reported ${asset.name} security risk remains under review.`,
    ],
    upcomingEvents: [],
    scenarios: {
      bullish:
        "TEST FIXTURE Adoption could strengthen if independently confirmed.",
      base: "TEST FIXTURE Mixed evidence could leave uncertainty unresolved.",
      bearish: "TEST FIXTURE A confirmed incident could undermine the outlook.",
    },
    recommendations: [
      "TEST FIXTURE Monitor official confirmations and wait for more evidence.",
    ],
    limitations: [
      "TEST FIXTURE Reported claims are not independently verified.",
    ],
  };
  const text = JSON.stringify(content),
    generatedAt = iso(now);
  return groundedReportSchema.parse({
    symbol: ml.symbol,
    provider: "gemini_google_search",
    model: "gemini-3.5-flash-lite",
    generatedAt,
    expiresAt: iso(now + 900000),
    text,
    content,
    sources: [
      {
        id: "source-0",
        title: `TEST FIXTURE ${asset.name} project announcement`,
        url: "https://publisher.example.com/test-fixture",
        publishedAt: null,
        retrievedAt: generatedAt,
      },
    ],
    citations: [
      {
        startByte: 0,
        endByte: Buffer.byteLength(text),
        quote: text,
        sourceIds: ["source-0"],
      },
    ],
    searchSuggestionsHtml:
      '<div><a target="_blank" href="https://www.google.com/search?q=TEST+FIXTURE">Google Search TEST FIXTURE</a></div>',
    searchQueryCount: 1,
  });
}
export function textReviewFixture(
  ml: AnalysisMlResult,
  fingerprint = fixtureFingerprint(ml),
  now = testNow,
): GroundedReport {
  const report = reviewFixture(ml, fingerprint, now),
    content = report.content;
  const bullets = (items: string[]) =>
    items.map((item) => `- ${item}`).join("\n");
  const text = [
    `Review status: ${content.reviewStatus}\nOverall outlook: ${content.overallOutlook}`,
    `## Summary\n${content.executiveSummary}`,
    `## Critical review\n${content.criticalReview}`,
    `## Developments\n${bullets(content.developments)}`,
    `## Risks\n${bullets(content.risks)}`,
    `## Upcoming events\n${bullets(content.upcomingEvents)}`,
    `## Bullish scenario\n${content.scenarios.bullish}`,
    `## Base scenario\n${content.scenarios.base}`,
    `## Bearish scenario\n${content.scenarios.bearish}`,
    `## Conditional recommendations\n${bullets(content.recommendations)}`,
    `## Limitations\n${bullets(content.limitations)}`,
  ].join("\n\n");
  return groundedReportSchema.parse({
    ...report,
    text,
    citations: [
      ...content.developments,
      ...content.risks,
      ...content.upcomingEvents,
    ].map((quote) => {
      const start = text.indexOf(quote);
      return {
        startByte: Buffer.byteLength(text.slice(0, start)),
        endByte: Buffer.byteLength(text.slice(0, start + quote.length)),
        quote,
        sourceIds: ["source-0"],
      };
    }),
  });
}
export function analysisFixture(
  symbol: Symbol = assets[0].symbol,
  now = testNow,
  ready = true,
  reviewed = false,
) {
  const ml = mlFixture(symbol, now, ready),
    fingerprint = fixtureFingerprint(ml),
    report = reviewed ? reviewFixture(ml, fingerprint, now) : null;
  return futureAnalysisSchema.parse({
    schemaVersion: "future-analysis-v1",
    symbol,
    checkedAt: iso(now),
    forecastFingerprint: fingerprint,
    ml,
    mlFreshness: ready ? "fresh" : "unavailable",
    research: {
      status: report ? "available" : "not_requested",
      reason: null,
      data: report,
    },
    conflict: ready && reviewed ? "CONFLICTING_EVIDENCE" : null,
    limitations: [
      "TEST FIXTURE: synthetic evidence only, never production fallback.",
    ],
  });
}
