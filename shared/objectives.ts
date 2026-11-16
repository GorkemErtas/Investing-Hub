import { z } from "zod";
import { assets, symbolSchema } from "./contracts.js";
import { forecastHorizonSchema, horizonMilliseconds } from "./forecasts.js";

export const objectiveConfirmationEndMs = Date.UTC(2027, 2, 1);
const fraction = z.number().finite().min(0).max(1);
export const objectiveEvaluationSchema = z.strictObject({
  period: z.enum(["development", "future"]),
  candidate: z.string().min(1).max(160),
  primaryLoss: z.number().finite(),
  baselineRelativeImprovement: z.number().finite(),
  calibrationError: fraction.nullable(),
  intervalCoverage: fraction.nullable(),
  developmentEligible: z.boolean(),
  futureConfirmed: z.boolean(),
  confirmationEnd: z.string().datetime().nullable(),
});
const common = {
  status: z.enum(["validated", "unavailable"]),
  reason: z.string().min(1).max(256),
  generatedAt: z.string().datetime().nullable(),
  modelVersion: z.string().min(1).max(200).nullable(),
  algorithm: z.string().min(1).max(60).nullable(),
  evaluation: objectiveEvaluationSchema.nullable(),
};
const directionSchema = z.strictObject({
  ...common,
  algorithm: z
    .enum(["logistic", "random_forest", "lightgbm", "xgboost", "lstm"])
    .nullable(),
  direction: z.enum(["down", "neutral", "up"]).nullable(),
  probabilities: z
    .strictObject({ down: fraction, neutral: fraction, up: fraction })
    .nullable(),
  calibrated: z.boolean(),
});
const volatilitySchema = z.strictObject({
  ...common,
  algorithm: z
    .enum([
      "historical_rolling",
      "ewma",
      "har_rv",
      "garch",
      "lightgbm",
      "xgboost",
    ])
    .nullable(),
  expectedVolatility: z.number().finite().positive().nullable(),
  riskCategory: z.enum(["low", "medium", "high"]).nullable(),
  units: z.literal("horizon_log_return_std"),
  interval: z
    .strictObject({
      lower: z.number().finite().nonnegative(),
      upper: z.number().finite().positive(),
      nominalCoverage: fraction,
      measuredCoverage: fraction,
      method: z.literal("past_split_conformal"),
    })
    .nullable(),
});
export const objectiveForecastSchema = z
  .strictObject({
    version: z.literal("forecast-objectives-v3"),
    symbol: symbolSchema,
    horizon: forecastHorizonSchema,
    stale: z.boolean(),
    generatedAt: z.string().datetime(),
    marketUpdatedAt: z.string().datetime().nullable(),
    sourceCandleTime: z.string().datetime().nullable(),
    targetTime: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    direction: directionSchema,
    volatility: volatilitySchema,
  })
  .superRefine((f, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const active = [f.direction, f.volatility].filter(
      (o) => o.status === "validated",
    );
    if (f.direction.status === "unavailable") {
      if (
        f.direction.probabilities !== null ||
        f.direction.direction !== null ||
        f.direction.calibrated
      )
        issue("Unavailable direction cannot carry probabilities");
    } else {
      const p = f.direction.probabilities;
      if (
        !p ||
        !f.direction.calibrated ||
        !f.direction.direction ||
        Math.abs(p.down + p.neutral + p.up - 1) > 1e-8
      )
        issue(
          "Validated direction requires calibrated normalized probabilities",
        );
      else if (
        p[f.direction.direction] + 1e-8 <
        Math.max(p.down, p.neutral, p.up)
      )
        issue("Direction label must agree with class probabilities");
      if (
        f.direction.evaluation?.calibrationError === null ||
        (f.direction.evaluation?.calibrationError ?? 1) > 0.05
      )
        issue("Validated direction requires measured calibration quality");
    }
    if (f.volatility.status === "unavailable") {
      if (
        f.volatility.expectedVolatility !== null ||
        f.volatility.riskCategory !== null ||
        f.volatility.interval !== null
      )
        issue("Unavailable volatility cannot carry numeric estimates");
    } else if (
      f.volatility.expectedVolatility === null ||
      !f.volatility.riskCategory
    )
      issue(
        "Validated volatility requires an estimate and historical risk category",
      );
    const interval = f.volatility.interval;
    if (
      interval &&
      (interval.lower > interval.upper ||
        interval.measuredCoverage < 0.85 ||
        interval.measuredCoverage > 0.97 ||
        interval.nominalCoverage !== 0.9)
    )
      issue("Unvalidated volatility interval");
    for (const o of [f.direction, f.volatility]) {
      if (o.status === "unavailable") {
        if (
          o.modelVersion !== null ||
          o.algorithm !== null ||
          o.generatedAt !== null
        )
          issue("Unavailable objective cannot claim a live model");
      } else if (
        !o.modelVersion ||
        !o.algorithm ||
        !o.generatedAt ||
        !o.evaluation?.futureConfirmed ||
        !o.evaluation.developmentEligible ||
        o.evaluation.period !== "future" ||
        !o.evaluation.confirmationEnd ||
        Date.parse(o.evaluation.confirmationEnd) < objectiveConfirmationEndMs
      )
        issue(
          "Future confirmation evidence required independently per objective",
        );
    }
    if (active.length) {
      if (
        f.horizon === "1M" ||
        f.stale ||
        !f.sourceCandleTime ||
        !f.marketUpdatedAt ||
        !f.targetTime ||
        !f.expiresAt
      ) {
        issue("Completed fresh short-horizon inputs required");
        return;
      }
      const source = Date.parse(f.sourceCandleTime),
        target = Date.parse(f.targetTime),
        generated = Date.parse(f.generatedAt),
        market = Date.parse(f.marketUpdatedAt),
        expires = Date.parse(f.expiresAt);
      if (
        (source + 1) % 60000 !== 0 ||
        !(
          source < market &&
          market <= generated &&
          generated < expires &&
          expires <= target
        ) ||
        target - source !== horizonMilliseconds[f.horizon] ||
        expires !== Math.min(source + 90000, target) ||
        active.some(
          (o) =>
            Date.parse(o.generatedAt!) <= source ||
            Date.parse(o.generatedAt!) > generated,
        )
      )
        issue("Invalid objective chronology or expiry");
    }
  });
export type ObjectiveForecast = z.infer<typeof objectiveForecastSchema>;
export const objectivePublicationSchema = z
  .strictObject({
    version: z.literal("objective-publication-v3"),
    generatedAt: z.string().datetime(),
    forecasts: z
      .array(objectiveForecastSchema)
      .length(assets.length * forecastHorizonSchema.options.length),
  })
  .superRefine((p, ctx) => {
    if (
      new Set(p.forecasts.map((f) => `${f.symbol}/${f.horizon}`)).size !==
        p.forecasts.length ||
      p.forecasts.some(
        (f) => Date.parse(f.generatedAt) > Date.parse(p.generatedAt),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Complete unique objective publication required",
      });
  });
