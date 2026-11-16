import { z } from "zod";
import { assets, symbolSchema } from "./contracts.js";

// Independent of chart sampling intervals; case is significant.
export const forecastHorizonSchema = z.enum(["1m", "15m", "1h", "1M"]);
export type ForecastHorizon = z.infer<typeof forecastHorizonSchema>;
export const horizonMilliseconds = {
  "1m": 60000,
  "15m": 900000,
  "1h": 3600000,
  "1M": null,
} as const;
const metric = z.number().finite().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const forecastSchema = z
  .strictObject({
    version: z.literal("forecast-v2"),
    symbol: symbolSchema,
    horizon: forecastHorizonSchema,
    status: z.enum(["experimental", "unavailable"]),
    reason: z.string().min(1).max(256),
    stale: z.boolean(),
    referencePrice: z.number().finite().positive().nullable(),
    predictedPrice: z.number().finite().positive().nullable(),
    predictedLogReturn: z.number().finite().min(-2).max(2).nullable(),
    marketUpdatedAt: z.string().datetime().nullable(),
    sourceCandleTime: z.string().datetime().nullable(),
    generatedAt: z.string().datetime(),
    targetTime: z.string().datetime().nullable(),
    modelVersion: z.string().min(1).max(200).nullable(),
    algorithm: z
      .enum([
        "ridge",
        "random_forest",
        "hist_gradient_boosting",
        "lightgbm",
        "xgboost",
        "lstm",
      ])
      .nullable(),
    featureSchema: z.string().min(1).max(100).nullable(),
    datasetFingerprint: hash.nullable(),
    evaluationMetrics: z
      .strictObject({
        validationReturnRmse: metric,
        holdoutReturnRmse: metric,
        baselineHoldoutReturnRmse: metric.positive(),
        holdoutDirectionalAccuracy: z.number().finite().min(0).max(1),
      })
      .nullable(),
  })
  .superRefine((f, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (f.status === "unavailable") {
      if (
        [
          f.referencePrice,
          f.predictedPrice,
          f.predictedLogReturn,
          f.modelVersion,
          f.algorithm,
          f.evaluationMetrics,
        ].some((v) => v !== null)
      )
        issue("Unavailable forecasts must not carry numbers or models");
      return;
    }
    if (
      f.horizon === "1M" ||
      f.stale ||
      f.referencePrice === null ||
      f.predictedPrice === null ||
      f.predictedLogReturn === null ||
      !f.sourceCandleTime ||
      !f.targetTime ||
      !f.marketUpdatedAt ||
      !f.modelVersion ||
      !f.algorithm ||
      !f.featureSchema ||
      !f.datasetFingerprint ||
      !f.evaluationMetrics
    ) {
      issue(
        "Experimental forecast requires validated short-horizon evidence and provenance",
      );
      return;
    }
    const source = Date.parse(f.sourceCandleTime),
      target = Date.parse(f.targetTime),
      generated = Date.parse(f.generatedAt),
      market = Date.parse(f.marketUpdatedAt);
    if (!(
      (source + 1) % 60000 === 0 &&
      source < market &&
      market <= generated &&
      generated < target &&
      target - source === horizonMilliseconds[f.horizon]
    ))
      issue("Invalid completed-minute forecast chronology");
    const expected = f.referencePrice * Math.exp(f.predictedLogReturn);
    if (
      Math.abs(expected - f.predictedPrice) > Math.max(1e-9, expected * 1e-10)
    )
      issue("Price/log-return mismatch");
  });
export type Forecast = z.infer<typeof forecastSchema>;
export const forecastPublicationSchema = z
  .strictObject({
    version: z.literal("forecast-publication-v2"),
    generatedAt: z.string().datetime(),
    forecasts: z
      .array(forecastSchema)
      .length(assets.length * forecastHorizonSchema.options.length),
  })
  .superRefine((p, ctx) => {
    const pairs = new Set(p.forecasts.map((f) => `${f.symbol}/${f.horizon}`));
    if (
      pairs.size !== p.forecasts.length ||
      p.forecasts.some(
        (f) => Date.parse(f.generatedAt) > Date.parse(p.generatedAt),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Require each symbol/horizon once and valid publication chronology",
      });
  });
