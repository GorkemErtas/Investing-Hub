import { z } from "zod";

// Future composition contract only. No provider calls or public endpoint.
const timestamp = z.string().datetime();
const numericForecast = z.object({
  status: z.literal("validated"),
  modelVersion: z.string().min(1),
  validationReference: z.string().min(1),
  predictedReturn: z.number().finite().gt(-1),
  predictedPrice: z.number().finite().positive(),
  referencePrice: z.number().finite().positive(),
  sourceCandleCloseTime: timestamp,
  calibration: z
    .object({
      method: z.string().min(1),
      evidenceReference: z.string().min(1),
      samples: z.number().int().min(30),
      evaluatedAt: timestamp,
      intervalCoverage: z.number().min(0).max(1),
      lowerPrice: z.number().positive(),
      upperPrice: z.number().positive(),
    })
    .nullable(),
});

export const hybridAnalysisSchema = z
  .object({
    contractVersion: z.literal("hybrid-analysis-v1"),
    symbol: z.enum(["BTCUSDT", "ETHUSDT"]),
    horizon: z.literal("1d"),
    generatedAt: timestamp,
    targetCloseTime: timestamp,
    ml: z.discriminatedUnion("status", [
      numericForecast,
      z.object({
        status: z.literal("unavailable"),
        reason: z.string().min(1),
        modelVersion: z.string().nullable(),
        predictedReturn: z.null(),
        predictedPrice: z.null(),
        calibration: z.null(),
      }),
    ]),
    observations: z.array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["news", "social"]),
        sourceUrl: z.url().refine((url) => /^https?:\/\//.test(url)),
        publishedAt: timestamp,
        observedAt: timestamp,
        evidenceExcerpt: z.string().min(1),
        sentiment: z.enum([
          "positive",
          "negative",
          "mixed",
          "neutral",
          "unknown",
        ]),
        uncertainty: z.enum(["low", "medium", "high", "unknown"]),
      }),
    ),
    outlook: z.enum(["bullish", "bearish", "neutral", "mixed", "unavailable"]),
    explanation: z.string(),
    supportingObservationIds: z.array(z.string()),
    explanationProvider: z.string().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const generated = Date.parse(value.generatedAt);
    const target = Date.parse(value.targetCloseTime);
    if (generated >= target || (target + 1) % 86400000 !== 0)
      issue("Require a future completed-UTC-day target boundary");
    if (value.ml.status === "validated") {
      const ml = value.ml;
      const source = Date.parse(ml.sourceCandleCloseTime);
      if (source >= generated || target - source !== 86400000)
        issue("ML source must be completed and exactly one day before target");
      if (
        Math.abs(
          ml.predictedPrice - ml.referencePrice * (1 + ml.predictedReturn),
        ) > Math.max(1e-8, ml.predictedPrice * 1e-10)
      )
        issue(
          "Numeric forecast must derive from the ML return and reference price",
        );
      if (
        ml.calibration &&
        (Date.parse(ml.calibration.evaluatedAt) > generated ||
          ml.calibration.lowerPrice > ml.calibration.upperPrice)
      )
        issue("Calibration requires past evidence and ordered interval bounds");
    }
    const ids = new Set(value.observations.map((event) => event.id));
    if (ids.size !== value.observations.length)
      issue("Observation IDs must be unique");
    for (const event of value.observations) {
      if (
        Date.parse(event.publishedAt) > Date.parse(event.observedAt) ||
        Date.parse(event.observedAt) > generated
      )
        issue(
          "Observations must have been published and observed by generation time",
        );
    }
    if (value.supportingObservationIds.some((id) => !ids.has(id)))
      issue("Explanation references missing evidence");
    if (
      value.ml.status === "unavailable" &&
      !value.observations.length &&
      value.outlook !== "unavailable"
    )
      issue("No outlook without validated ML or observed evidence");
  });

export type HybridAnalysis = z.infer<typeof hybridAnalysisSchema>;
