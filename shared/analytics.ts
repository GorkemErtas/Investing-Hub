import { z } from "zod";
import { assets, symbolSchema } from "./contracts.js";

const number = z.number().finite();
const count = z.number().int().nonnegative();
const ratio = number.min(0).max(1);
const time = z.string().datetime();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(600);
export const distributionSchema = z
  .strictObject({
    samples: count.positive(),
    mean: number,
    median: number,
    variance: number.nonnegative().nullable(),
    std: number.nonnegative().nullable(),
    q05: number,
    q25: number,
    q75: number,
    q95: number,
    skewness: number.nullable(),
    excessKurtosis: number.nullable(),
  })
  .refine(
    (v) => v.q05 <= v.q25 && v.q25 <= v.q75 && v.q75 <= v.q95,
    "Invalid quantile order",
  );
const availableTest = z
  .strictObject({
    name: z.enum(["mean_return_difference", "mean_absolute_return_difference"]),
    status: z.literal("available"),
    effect: number,
    ciLow: number,
    ciHigh: number,
    pValue: ratio,
    adjustedP: ratio,
    samplesA: count.min(60),
    samplesB: count.min(60),
    blockDays: z.literal(14),
    periodAStart: time,
    periodAEnd: time,
    periodBStart: time,
    periodBEnd: time,
    sensitivity: z
      .array(
        z.strictObject({
          blockDays: z.union([z.literal(7), z.literal(28)]),
          ciLow: number,
          ciHigh: number,
        }),
      )
      .length(2),
  })
  .refine(
    (v) =>
      v.ciLow <= v.ciHigh &&
      v.adjustedP >= v.pValue &&
      Date.parse(v.periodAEnd) < Date.parse(v.periodBStart),
    "Invalid inference chronology or correction",
  );
const unavailableTest = z.strictObject({
  name: z.enum(["mean_return_difference", "mean_absolute_return_difference"]),
  status: z.literal("insufficient_data"),
  reason: text,
});
export const classificationMetricsSchema = z
  .strictObject({
    samples: count.positive(),
    positives: count,
    prevalence: ratio,
    accuracy: ratio,
    balancedAccuracy: ratio.nullable(),
    precision: ratio,
    recall: ratio,
    f1: ratio,
    rocAuc: ratio.nullable(),
    averagePrecision: ratio.nullable(),
    brier: ratio,
    falsePositiveRate: ratio.nullable(),
    confusion: z.tuple([count, count, count, count]),
  })
  .superRefine((v, ctx) => {
    const [tn, fp, fn, tp] = v.confusion;
    if (
      tn + fp + fn + tp !== v.samples ||
      fn + tp !== v.positives ||
      Math.abs(v.prevalence - v.positives / v.samples) > 1e-9 ||
      Math.abs(v.accuracy - (tn + tp) / v.samples) > 1e-9
    )
      ctx.addIssue({
        code: "custom",
        message: "Confusion counts disagree with metrics",
      });
    if (
      (v.positives === 0 || v.positives === v.samples) &&
      (v.rocAuc !== null ||
        v.averagePrecision !== null ||
        v.balancedAccuracy !== null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Single-class ranking metrics must be unavailable",
      });
  });
const classifier = z
  .strictObject({
    task: z.enum(["direction", "extreme_event"]),
    model: text,
    fold: count.min(1).max(12),
    phase: z.literal("historical_development"),
    version: hash,
    datasetFingerprint: hash,
    trainStart: time,
    trainEnd: time,
    validationStart: time,
    validationEnd: time,
    evaluationStart: time,
    evaluationEnd: time,
    eventThreshold: number.nonnegative(),
    trainingPrevalence: ratio,
    threshold: ratio,
    thresholdPolicy: z.enum([
      "fixed",
      "validation_f1",
      "single_class_validation_default",
    ]),
    status: z.enum(["available", "single_class_training"]),
    metrics: classificationMetricsSchema.nullable(),
  })
  .refine(
    (v) =>
      Date.parse(v.trainEnd) < Date.parse(v.validationStart) &&
      Date.parse(v.validationEnd) < Date.parse(v.evaluationStart) &&
      (v.status === "available") === Boolean(v.metrics),
    "Invalid classifier isolation",
  );
const method = z.enum([
  "rolling_z",
  "rolling_iqr",
  "rolling_mad",
  "isolation_forest",
]);
const event = z
  .strictObject({
    time,
    method,
    indicator: text,
    score: number,
    threshold: number,
    referenceStart: time,
    referenceEnd: time,
    severity: z.enum(["moderate", "high"]),
  })
  .refine(
    (v) =>
      Date.parse(v.referenceStart) <= Date.parse(v.referenceEnd) &&
      Date.parse(v.referenceEnd) < Date.parse(v.time) &&
      v.score > v.threshold,
    "Invalid observed alert reference",
  );
const regressionInterval = z.strictObject({
  method: z.literal("chronological_oos_absolute_return_quantile_v1"),
  nominalCoverage: z.literal(0.9),
  empiricalCoverage: ratio,
  radiusReturn: number.nonnegative(),
  calibrationSamples: count.min(30),
  validationSamples: count.positive(),
  calibrationEnd: count,
  validationStart: count,
  evaluatedAt: count,
  status: z.enum(["empirically_calibrated", "experimental"]),
});
const regression = z
  .strictObject({
    modelId: text,
    model: text,
    version: text,
    status: z.enum(["candidate", "approved", "active", "rejected", "archived"]),
    phase: z.literal("historical_selection"),
    datasetFingerprint: hash,
    featureVersion: text,
    trainedAt: time,
    trainStart: time,
    trainEnd: time,
    evaluationStart: time,
    evaluationEnd: time,
    samples: count.positive(),
    returnMae: number.nonnegative(),
    returnRmse: number.nonnegative(),
    priceMaeUsdt: number.nonnegative(),
    priceRmseUsdt: number.nonnegative(),
    baselineRmse: number.nonnegative(),
    foldRmses: z.array(number.nonnegative()).min(2).max(12),
    foldWins: count,
    selected: z.boolean().default(false),
    comparisonId: hash.nullable().default(null),
    directionalAccuracy: ratio.nullable().default(null),
    finalEvaluation: z
      .strictObject({
        evaluationStart: time,
        evaluationEnd: time,
        samples: count.positive(),
        returnMae: number.nonnegative(),
        returnRmse: number.nonnegative(),
        priceMaeUsdt: number.nonnegative(),
        priceRmseUsdt: number.nonnegative(),
        directionalAccuracy: ratio,
        baselineReturnRmse: number.nonnegative(),
        baselinePriceRmseUsdt: number.nonnegative(),
      })
      .nullable()
      .default(null),
    interval: regressionInterval.nullable(),
  })
  .refine(
    (v) =>
      v.foldWins <= v.foldRmses.length &&
      Date.parse(v.evaluationEnd) <= Date.parse(v.trainedAt),
    "Invalid regression evidence",
  );
const monitoring = z
  .strictObject({
    modelId: text,
    phase: z.enum(["prospective_active", "prospective_shadow"]),
    samples: count.positive(),
    returnRmse: number.nonnegative(),
    baselineRmse: number.nonnegative(),
    residuals: distributionSchema,
    regimes: z
      .array(
        z.strictObject({
          regime: z.enum([
            "high_volatility",
            "lower_volatility",
            "unavailable",
          ]),
          samples: count.positive(),
          returnRmse: number.nonnegative(),
        }),
      )
      .max(3),
    intervalSamples: count,
    nominalCoverage: z.literal(0.9).nullable(),
    intervalCoverage: ratio.nullable(),
    meanRelativeIntervalWidth: number.nonnegative().nullable(),
  })
  .refine(
    (v) =>
      v.intervalSamples <= v.samples &&
      (v.intervalSamples > 0
        ? v.intervalCoverage !== null && v.meanRelativeIntervalWidth !== null
        : v.intervalCoverage === null && v.meanRelativeIntervalWidth === null),
    "Missing interval observations",
  );
export const analyticsAssetSchema = z
  .strictObject({
    symbol: symbolSchema,
    status: z.enum(["available", "insufficient_data", "unavailable"]),
    reason: text.nullable(),
    dataset: z
      .strictObject({
        fingerprint: hash,
        rows: count.positive().max(6000),
        missingDays: count,
        firstClose: time,
        lastClose: time,
        usableSamples: count,
        freshness: z.enum(["current", "stale"]),
      })
      .nullable(),
    statistics: z
      .strictObject({
        returns: distributionSchema.nullable(),
        priceVolumeSpearman: number.min(-1).max(1).nullable(),
        returnAutocorrelation1: number.min(-1).max(1).nullable(),
        absoluteReturnAutocorrelation1: number.min(-1).max(1).nullable(),
        histogram: z
          .array(z.strictObject({ low: number, high: number, count }))
          .max(21),
        series: z
          .array(
            z.strictObject({
              time,
              dailyReturn: number.nullable(),
              volatility14: number.nonnegative().nullable(),
            }),
          )
          .max(26),
        tests: z.array(z.union([availableTest, unavailableTest])).length(2),
      })
      .nullable(),
    correlations: z
      .array(
        z.strictObject({
          otherSymbol: symbolSchema,
          windowDays: z.literal(30),
          samples: count.max(30),
          value: number.min(-1).max(1).nullable(),
          points: z
            .array(
              z.strictObject({ time, value: number.min(-1).max(1).nullable() }),
            )
            .max(26),
        }),
      )
      .max(7),
    classifiers: z.array(classifier).max(132),
    regressions: z.array(regression).max(100),
    monitoring: z.array(monitoring).max(200),
    deterioration: z
      .array(
        z.strictObject({
          model_id: text,
          phase: z.enum(["prospective_active", "prospective_shadow"]),
          recent_samples: count.max(30),
          previous_samples: count.max(30),
          recent_mse: number.nonnegative().nullable(),
          previous_mse: number.nonnegative().nullable(),
        }),
      )
      .max(200),
    anomalies: z
      .strictObject({
        observations: count.max(6000),
        labelsAvailable: z.literal(false),
        totals: z
          .array(
            z.strictObject({
              method,
              eligible: count.max(6000),
              flagged: count.max(6000),
            }),
          )
          .length(4),
        events: z.array(event).max(200),
        eventsTruncated: z.boolean(),
      })
      .nullable(),
    anomalyFrequency: z
      .array(
        z.strictObject({
          month: z.string().regex(/^\d{4}-\d{2}$/),
          method,
          flags: count.positive(),
        }),
      )
      .max(1000),
    findings: z.array(text).max(12),
  })
  .superRefine((v, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      v.status === "unavailable"
        ? !v.reason ||
          v.dataset ||
          v.statistics ||
          v.classifiers.length ||
          v.anomalies
        : !v.dataset || !v.statistics
    )
      issue("Inconsistent availability");
    if (
      v.status === "available" &&
      (v.reason ||
        !v.dataset ||
        v.dataset.usableSamples < 500 ||
        v.dataset.missingDays)
    )
      issue("Insufficient classification history");
    if (
      v.statistics?.returns &&
      v.statistics.histogram.reduce((n, bin) => n + bin.count, 0) !==
        v.statistics.returns.samples
    )
      issue("Histogram counts disagree with observations");
    if (
      v.classifiers.some(
        (row) => row.datasetFingerprint !== v.dataset?.fingerprint,
      )
    )
      issue("Wrong classifier dataset");
    if (v.anomalies?.totals.some((row) => row.flagged > row.eligible))
      issue("Alert frequency exceeds evaluated observations");
    if (v.correlations.some((row) => row.otherSymbol === v.symbol))
      issue("Self correlation");
  });
export type AnalyticsAsset = z.infer<typeof analyticsAssetSchema>;
const analyticsBaseSchema = z.strictObject({
  version: z.literal("analytics-lab-v1"),
  generatedAt: time,
  runId: hash,
  scope: z.literal("local_research_only"),
  provenance: z.strictObject({
    codeHash: hash,
    configHash: hash,
    featureVersion: z.literal("daily-past-only-v2"),
    seed: count,
    registry: z.strictObject({
      size: count,
      mtimeNs: z.string().regex(/^\d+$/),
    }),
    environment: z.strictObject({
      python: text,
      numpy: text,
      pandas: text,
      scipy: text,
      sklearn: text,
    }),
  }),
  config: z.strictObject({
    seed: count,
    period_days: count.min(112).max(365),
    block_days: z.literal(14),
    bootstrap_resamples: count.min(99).max(9999),
    walk_forward_splits: count.min(2).max(12),
    fold_days: count.min(30).max(180),
    min_train_samples: count.min(180),
    threshold_days: count.min(30),
    event_quantile: number.min(0.9).max(0.99),
    anomaly_train_days: count.min(60),
    max_rows: count.max(6000),
  }),
  hypothesisFamilySize: count.max(16),
  limitations: z.array(text).min(1).max(12),
});
export const analyticsReportSchema = analyticsBaseSchema
  .extend({ assets: z.array(analyticsAssetSchema).length(assets.length) })
  .refine(
    (v) =>
      new Set(v.assets.map((a) => a.symbol)).size === assets.length &&
      v.hypothesisFamilySize ===
        v.assets
          .flatMap((a) => a.statistics?.tests ?? [])
          .filter((t) => t.status === "available").length,
    "Incomplete asset or test family",
  );
export type AnalyticsReport = z.infer<typeof analyticsReportSchema>;
export const analyticsResponseSchema = z
  .strictObject({
    symbol: symbolSchema,
    status: z.enum(["available", "stale", "disabled", "unavailable"]),
    reason: text.nullable(),
    report: analyticsBaseSchema
      .extend({ asset: analyticsAssetSchema })
      .nullable(),
  })
  .refine(
    (v) =>
      ["available", "stale"].includes(v.status)
        ? v.report?.asset.symbol === v.symbol
        : v.report === null,
    "Invalid analytical response",
  );
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
