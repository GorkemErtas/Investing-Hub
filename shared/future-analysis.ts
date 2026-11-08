import { z } from "zod";
import { assets, symbolSchema } from "./contracts.js";

const timestamp = z.string().datetime();
const positive = z.number().finite().positive();
export const sourceUrlSchema = z
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.includes(".") &&
      !/^[\d.]+$/.test(url.hostname) &&
      !url.hostname.includes(":") &&
      !/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(
        url.hostname,
      ) &&
      !url.hostname.endsWith(".")
    );
  });
export const intervalSchema = z.strictObject({
  method: z.literal("chronological_oos_absolute_return_quantile_v1"),
  status: z.literal("empirically_calibrated"),
  nominalCoverage: z.literal(0.9),
  empiricalCoverage: z.number().min(0.9).max(1),
  radiusReturn: z.number().finite().nonnegative(),
  calibrationSamples: z.number().int().min(30),
  validationSamples: z.number().int().positive(),
  calibrationEnd: timestamp,
  validationStart: timestamp,
  evaluatedAt: timestamp,
  lowerPrice: positive,
  upperPrice: positive,
});
export const numericForecastSchema = z
  .strictObject({
    authority: z.literal("ml"),
    symbol: symbolSchema,
    horizon: z.literal("1d"),
    priceUnit: z.literal("USDT"),
    generatedAt: timestamp,
    sourceCandleCloseTime: timestamp,
    targetCloseTime: timestamp,
    referencePrice: positive,
    predictedPrice: positive,
    predictedReturn: z.number().finite().gt(-1),
    direction: z.enum(["UP", "DOWN", "NEUTRAL"]),
    neutralThreshold: z.literal(0),
    modelId: z.string().min(1).max(200),
    trainedAt: timestamp,
    modelExpiresAt: timestamp,
    datasetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    forecastId: z.string().regex(/^[a-f0-9]{64}$/),
    dataQuality: z.strictObject({
      rows: z.number().int().min(500),
      missingDays: z.literal(0),
      provenance: z.literal("verified_binance_ohlcv"),
    }),
    validation: z.strictObject({
      status: z.literal("approved_prospective"),
      historicalReference: z.string().min(1).max(300),
      forwardReference: z.string().min(1).max(300),
      forwardSamples: z.number().int().min(30),
      evaluatedAt: timestamp,
      policy: z.strictObject({
        requiredRelativeRmseImprovement: z.number().min(0).lt(1),
        minimumFoldWins: z.number().int().positive(),
        minimumFoldCount: z.number().int().min(2),
        minimumForwardSamples: z.number().int().min(30),
      }),
      metrics: z.strictObject({
        selectionReturnRmse: z.number().finite().nonnegative(),
        baselineReturnRmse: positive,
        prospectiveReturnRmse: z.number().finite().nonnegative(),
        prospectiveBaselineReturnRmse: positive,
        foldWins: z.number().int().positive(),
        foldCount: z.number().int().positive(),
      }),
    }),
    interval: intervalSchema,
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const generated = Date.parse(value.generatedAt),
      source = Date.parse(value.sourceCandleCloseTime),
      target = Date.parse(value.targetCloseTime);
    if (
      !(source < generated && generated < target) ||
      target - source !== 86400000 ||
      (target + 1) % 86400000 !== 0
    )
      issue("Require completed source and future next UTC daily target");
    if (
      Date.parse(value.trainedAt) > generated ||
      Date.parse(value.modelExpiresAt) <= generated ||
      Date.parse(value.validation.evaluatedAt) < Date.parse(value.trainedAt) ||
      Date.parse(value.validation.evaluatedAt) >= target
    )
      issue("Invalid model/evaluation chronology");
    const interval = value.interval;
    const { policy, metrics } = value.validation;
    if (
      metrics.foldWins > metrics.foldCount ||
      metrics.foldWins < policy.minimumFoldWins ||
      metrics.foldCount < policy.minimumFoldCount ||
      value.validation.forwardSamples < policy.minimumForwardSamples ||
      metrics.selectionReturnRmse >=
        metrics.baselineReturnRmse *
          (1 - policy.requiredRelativeRmseImprovement) ||
      metrics.prospectiveReturnRmse >=
        metrics.prospectiveBaselineReturnRmse *
          (1 - policy.requiredRelativeRmseImprovement)
    )
      issue(
        "Approval evidence does not meet its declared historical and prospective gates",
      );
    if (
      Date.parse(interval.calibrationEnd) >=
        Date.parse(interval.validationStart) ||
      Date.parse(interval.evaluatedAt) < Date.parse(interval.validationStart) ||
      Date.parse(interval.evaluatedAt) > Date.parse(value.trainedAt)
    )
      issue("Calibration must precede validation and training publication");
    const equal = (a: number, b: number) =>
      Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);
    if (
      !equal(
        value.predictedPrice,
        value.referencePrice * (1 + value.predictedReturn),
      ) ||
      !equal(
        interval.lowerPrice,
        value.referencePrice *
          (1 + value.predictedReturn - interval.radiusReturn),
      ) ||
      !equal(
        interval.upperPrice,
        value.referencePrice *
          (1 + value.predictedReturn + interval.radiusReturn),
      )
    )
      issue(
        "Numeric values must derive exactly from ML output and calibrated residuals",
      );
    if (
      interval.lowerPrice > value.predictedPrice ||
      interval.upperPrice < value.predictedPrice
    )
      issue("Invalid interval bounds");
    if (
      value.direction !==
      (value.predictedReturn > 0
        ? "UP"
        : value.predictedReturn < 0
          ? "DOWN"
          : "NEUTRAL")
    )
      issue("Direction must derive from ML return only");
  });
export type NumericForecast = z.infer<typeof numericForecastSchema>;
export const mlResultSchema = z
  .strictObject({
    symbol: symbolSchema,
    status: z.enum(["validated", "unavailable"]),
    reason: z.string().min(1).max(160).nullable(),
    data: numericForecastSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.status === "validated"
        ? !value.data || value.reason || value.data.symbol !== value.symbol
        : value.data || !value.reason
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent ML availability" });
  });
export type MlResult = z.infer<typeof mlResultSchema>;
export const forecastModeSchema = z.enum(["approved", "experimental"]);
export type ForecastMode = z.infer<typeof forecastModeSchema>;
// A separate contract deliberately carries no prospective approval assertion.
export const experimentalForecastSchema = z
  .strictObject({
    ...numericForecastSchema.shape,
    interval: intervalSchema.nullable(),
    validation: z.strictObject({
      status: z.literal("experimental_not_validated"),
      algorithm: z.enum(["ridge", "random_forest", "gradient_boosting"]),
      trainingWindow: z.enum(["full", "3y", "2y", "1y"]),
      historicalReference: z.string().min(1).max(300),
      selectionRule: z.literal("lowest_selection_return_rmse_then_model_id_v1"),
      eligibleCandidates: z.number().int().positive(),
      selectionReturnRmse: z.number().finite().nonnegative(),
      baselineReturnRmse: z.number().finite().nonnegative(),
      selectionSamples: z.number().int().positive(),
      selectionStart: timestamp,
      selectionEnd: timestamp,
      foldWins: z.number().int().nonnegative(),
      foldCount: z.number().int().positive(),
      historicalGatePassed: z.boolean(),
      forwardSamples: z.number().int().nonnegative(),
    }),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const source = Date.parse(value.sourceCandleCloseTime),
      generated = Date.parse(value.generatedAt),
      target = Date.parse(value.targetCloseTime),
      trained = Date.parse(value.trainedAt),
      validation = value.validation;
    if (
      !(
        source < generated &&
        generated < target &&
        trained <= generated &&
        Date.parse(value.modelExpiresAt) > generated
      ) ||
      target - source !== 86400000 ||
      (target + 1) % 86400000 !== 0 ||
      Date.parse(validation.selectionStart) >
        Date.parse(validation.selectionEnd) ||
      Date.parse(validation.selectionEnd) > Math.min(trained, source) ||
      validation.foldWins > validation.foldCount
    )
      issue("Invalid experimental forecast/evidence chronology");
    const equal = (a: number, b: number) =>
      Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);
    if (
      !equal(
        value.predictedPrice,
        value.referencePrice * (1 + value.predictedReturn),
      ) ||
      value.direction !==
        (value.predictedReturn > 0
          ? "UP"
          : value.predictedReturn < 0
            ? "DOWN"
            : "NEUTRAL")
    )
      issue("Experimental values must preserve ML output");
    const interval = value.interval;
    if (
      interval &&
      (Date.parse(interval.calibrationEnd) >=
        Date.parse(interval.validationStart) ||
        Date.parse(interval.validationStart) >
          Date.parse(interval.evaluatedAt) ||
        Date.parse(interval.evaluatedAt) > trained ||
        !equal(
          interval.lowerPrice,
          value.referencePrice *
            (1 + value.predictedReturn - interval.radiusReturn),
        ) ||
        !equal(
          interval.upperPrice,
          value.referencePrice *
            (1 + value.predictedReturn + interval.radiusReturn),
        ))
    )
      issue("Invalid experimental model-derived interval");
  });
export type ExperimentalForecast = z.infer<typeof experimentalForecastSchema>;
export const experimentalResultSchema = z
  .strictObject({
    symbol: symbolSchema,
    status: z.literal("experimental"),
    reason: z.null(),
    data: experimentalForecastSchema,
  })
  .refine(
    (value) => value.symbol === value.data.symbol,
    "Wrong experimental asset",
  );
export const analysisMlResultSchema = z.union([
  mlResultSchema,
  experimentalResultSchema,
]);
export type AnalysisMlResult = z.infer<typeof analysisMlResultSchema>;
export const experimentalPublicationSchema = z
  .strictObject({
    version: z.literal("ml-experimental-v1"),
    generatedAt: timestamp,
    registry: z.strictObject({
      size: z.number().int().nonnegative(),
      mtimeNs: z.string().regex(/^\d+$/),
    }),
    forecasts: z.array(analysisMlResultSchema).length(assets.length),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.forecasts.map((item) => item.symbol)).size !==
        assets.length ||
      value.forecasts.some((item) => item.status === "validated")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Require every asset once with experimental or unavailable status",
      });
  });
export const mlPublicationSchema = z
  .strictObject({
    version: z.literal("ml-publication-v1"),
    generatedAt: timestamp,
    registry: z.strictObject({
      size: z.number().int().nonnegative(),
      mtimeNs: z.string().regex(/^\d+$/),
    }),
    forecasts: z.array(mlResultSchema).length(assets.length),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.forecasts.map((item) => item.symbol)).size !== assets.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Require every shared asset exactly once",
      });
  });
export const reviewContentSchema = z.strictObject({
  symbol: symbolSchema,
  horizon: z.literal("1d"),
  mlModelId: z.string().max(200).nullable(),
  forecastFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reviewStatus: z.enum([
    "SUPPORTED_BY_CONTEXT",
    "CONFLICTING_EVIDENCE",
    "INSUFFICIENT_EVIDENCE",
    "HIGH_UNCERTAINTY",
  ]),
  overallOutlook: z.enum([
    "context_supportive",
    "context_conflicting",
    "mixed",
    "insufficient",
  ]),
  executiveSummary: z.string().min(20).max(1200),
  criticalReview: z.string().min(20).max(1800),
  developments: z.array(z.string().min(12).max(600)).max(6),
  risks: z.array(z.string().min(12).max(600)).max(6),
  upcomingEvents: z.array(z.string().min(12).max(600)).max(4),
  scenarios: z.strictObject({
    bullish: z.string().min(15).max(700),
    base: z.string().min(15).max(700),
    bearish: z.string().min(15).max(700),
  }),
  recommendations: z.array(z.string().min(12).max(600)).min(1).max(6),
  limitations: z.array(z.string().min(12).max(400)).min(1).max(6),
});
export type ReviewContent = z.infer<typeof reviewContentSchema>;

// Extract verbatim sections locally, so formatting never needs another model
// call and every displayed statement remains traceable to the original text.
export function reviewFromGroundedText(
  text: string,
  identity: Pick<ReviewContent, "symbol" | "mlModelId" | "forecastFingerprint">,
): ReviewContent {
  const headings = [
    ...text.matchAll(
      /^[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(Summary|Critical review|Developments|Risks|Upcoming events|Bullish scenario|Base scenario|Bearish scenario|Conditional recommendations|Limitations):?(?:\*\*)?:?[ \t]*\r?$/gim,
    ),
  ];
  const sections = new Map<string, string>();
  headings.forEach((heading, index) => {
    const name = heading[1].toLowerCase();
    if (sections.has(name)) throw new Error("Duplicate review section");
    sections.set(
      name,
      text
        .slice(
          heading.index! + heading[0].length,
          headings[index + 1]?.index ?? text.length,
        )
        .trim(),
    );
  });
  const section = (name: string) => sections.get(name) ?? "";
  const items = (name: string) =>
    section(name)
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*][ \t]+/, ""))
      .filter(Boolean);
  return reviewContentSchema.parse({
    ...identity,
    horizon: "1d",
    reviewStatus:
      text.match(/^Review status:[ \t]*([A-Z_]+)[ \t]*\r?$/m)?.[1] ??
      "HIGH_UNCERTAINTY",
    overallOutlook:
      text.match(/^Overall outlook:[ \t]*([a-z_]+)[ \t]*\r?$/m)?.[1] ?? "mixed",
    executiveSummary: section("summary"),
    criticalReview: section("critical review"),
    developments: items("developments"),
    risks: items("risks"),
    upcomingEvents: items("upcoming events"),
    scenarios: {
      bullish: section("bullish scenario"),
      base: section("base scenario"),
      bearish: section("bearish scenario"),
    },
    recommendations: items("conditional recommendations"),
    limitations: items("limitations"),
  });
}
export const groundedReportSchema = z
  .strictObject({
    symbol: symbolSchema,
    provider: z.literal("gemini_google_search"),
    model: z.string().min(1).max(100),
    generatedAt: timestamp,
    expiresAt: timestamp,
    text: z.string().min(30).max(16000),
    sources: z
      .array(
        z.strictObject({
          id: z.string().regex(/^source-\d+$/),
          title: z.string().min(1).max(300),
          url: sourceUrlSchema,
          publishedAt: z.null(),
          retrievedAt: timestamp,
        }),
      )
      .min(1)
      .max(16),
    citations: z
      .array(
        z.strictObject({
          startByte: z.number().int().nonnegative(),
          endByte: z.number().int().positive(),
          quote: z.string().min(1).max(4000),
          sourceIds: z.array(z.string()).min(1).max(16),
        }),
      )
      .min(1)
      .max(64),
    searchSuggestionsHtml: z.string().min(1).max(40000),
    searchQueryCount: z.number().int().nonnegative().nullable(),
    content: reviewContentSchema,
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (Date.parse(value.expiresAt) <= Date.parse(value.generatedAt))
      issue("Invalid report expiry");
    const ids = new Set(value.sources.map((source) => source.id)),
      bytes = new TextEncoder().encode(value.text);
    if (ids.size !== value.sources.length) issue("Duplicate sources");
    for (const source of value.sources)
      if (source.retrievedAt !== value.generatedAt)
        issue("Invalid source retrieval time");
    for (const citation of value.citations) {
      try {
        if (
          citation.endByte > bytes.length ||
          citation.startByte >= citation.endByte ||
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.slice(citation.startByte, citation.endByte),
          ) !== citation.quote ||
          citation.sourceIds.some((id) => !ids.has(id))
        )
          issue("Invalid grounding support span/reference");
      } catch {
        issue("Invalid UTF-8 grounding span");
      }
    }
    try {
      const original = value.text.trimStart().startsWith("{")
        ? reviewContentSchema.parse(JSON.parse(value.text))
        : reviewFromGroundedText(value.text, value.content);
      if (JSON.stringify(original) !== JSON.stringify(value.content))
        issue("Review must match the unmodified grounded response");
    } catch {
      issue("Invalid structured grounded response");
    }
    if (value.content.symbol !== value.symbol) issue("Wrong reviewed asset");
  });
export type GroundedReport = z.infer<typeof groundedReportSchema>;
export const researchResultSchema = z
  .strictObject({
    status: z.enum([
      "available",
      "stale",
      "not_requested",
      "disabled",
      "unavailable",
      "insufficient_evidence",
    ]),
    reason: z.string().min(1).max(160).nullable(),
    data: groundedReportSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      ["available", "stale"].includes(value.status)
        ? !value.data
        : value.data !== null
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent research availability",
      });
  });
export const futureAnalysisSchema = z
  .strictObject({
    schemaVersion: z.literal("future-analysis-v1"),
    mode: forecastModeSchema.default("approved"),
    symbol: symbolSchema,
    checkedAt: timestamp,
    forecastFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    mlFreshness: z.enum(["fresh", "stale", "unavailable"]),
    ml: analysisMlResultSchema,
    research: researchResultSchema,
    conflict: z.enum(["CONFLICTING_EVIDENCE"]).nullable(),
    limitations: z.array(z.string().min(1).max(400)).min(1).max(12),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      (value.mode === "approved" && value.ml.status === "experimental") ||
      (value.mode === "experimental" && value.ml.status === "validated")
    )
      issue("Forecast must match the explicitly selected mode");
    if (
      value.ml.symbol !== value.symbol ||
      (value.research.data && value.research.data.symbol !== value.symbol)
    )
      issue("Wrong asset");
    if (
      value.ml.status === "unavailable" &&
      (value.mlFreshness !== "unavailable" || value.conflict)
    )
      issue("No direction/conflict without ML");
    if (value.ml.data && value.mlFreshness === "unavailable")
      issue("Available ML requires an explicit fresh or stale state");
    const report = value.research.data;
    const expected =
      value.ml.data && report?.content.reviewStatus === "CONFLICTING_EVIDENCE"
        ? "CONFLICTING_EVIDENCE"
        : null;
    if (value.conflict !== expected)
      issue("Conflict must preserve original ML direction");
    if (
      report &&
      (report.content.mlModelId !== (value.ml.data?.modelId ?? null) ||
        report.content.forecastFingerprint !== value.forecastFingerprint)
    )
      issue("Review is bound to a different ML forecast");
    if (
      !value.ml.data &&
      report?.content.reviewStatus === "SUPPORTED_BY_CONTEXT"
    )
      issue("Cannot support an unavailable ML prediction");
  });
export type FutureAnalysis = z.infer<typeof futureAnalysisSchema>;
