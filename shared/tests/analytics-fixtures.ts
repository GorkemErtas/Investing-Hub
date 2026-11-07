import { assets, type Symbol } from "../contracts.js";
import {
  analyticsReportSchema,
  analyticsResponseSchema,
} from "../analytics.js";

// Explicitly synthetic TEST FIXTURE values; never imported by application code.
export function analyticsFixture(now = Date.now(), ready = true) {
  const end = Math.floor(now / 86400000) * 86400000 - 1,
    iso = (n: number) => new Date(n).toISOString();
  const report = {
    version: "analytics-lab-v1",
    generatedAt: iso(now),
    runId: "a".repeat(64),
    scope: "local_research_only",
    provenance: {
      codeHash: "b".repeat(64),
      configHash: "c".repeat(64),
      featureVersion: "daily-past-only-v2",
      seed: 42,
      registry: { size: 12, mtimeNs: "1" },
      environment: {
        python: "TEST",
        numpy: "TEST",
        pandas: "TEST",
        scipy: "TEST",
        sklearn: "TEST",
      },
    },
    config: {
      seed: 42,
      period_days: 180,
      block_days: 14,
      bootstrap_resamples: 999,
      walk_forward_splits: 3,
      fold_days: 60,
      min_train_samples: 180,
      threshold_days: 60,
      event_quantile: 0.95,
      anomaly_train_days: 180,
      max_rows: 6000,
    },
    hypothesisFamilySize: 0,
    limitations: ["TEST FIXTURE: historical synthetic research only."],
    assets: assets.map((asset, index) => {
      const available = ready && index < 2;
      return {
        symbol: asset.symbol,
        status: available ? "available" : "unavailable",
        reason: available ? null : "no_verified_dataset",
        dataset: available
          ? {
              fingerprint: "d".repeat(64),
              rows: 600,
              missingDays: 0,
              firstClose: iso(end - 599 * 86400000),
              lastClose: iso(end),
              usableSamples: 585,
              freshness: "current",
            }
          : null,
        statistics: available
          ? {
              returns: {
                samples: 4,
                mean: 0,
                median: 0,
                variance: 0.0002,
                std: Math.sqrt(0.0002),
                q05: -0.02,
                q25: -0.01,
                q75: 0.01,
                q95: 0.02,
                skewness: 0,
                excessKurtosis: 0,
              },
              priceVolumeSpearman: 0.2,
              returnAutocorrelation1: 0.1,
              absoluteReturnAutocorrelation1: 0.2,
              histogram: [
                { low: -0.02, high: 0, count: 2 },
                { low: 0, high: 0.02, count: 2 },
              ],
              series: [
                {
                  time: iso(end - 7 * 86400000),
                  dailyReturn: -0.01,
                  volatility14: 0.02,
                },
                { time: iso(end), dailyReturn: 0.01, volatility14: 0.025 },
              ],
              tests: [
                {
                  name: "mean_return_difference",
                  status: "insufficient_data",
                  reason: "TEST FIXTURE insufficient comparison periods",
                },
                {
                  name: "mean_absolute_return_difference",
                  status: "insufficient_data",
                  reason: "TEST FIXTURE insufficient comparison periods",
                },
              ],
            }
          : null,
        correlations: [],
        classifiers: available
          ? ["majority_baseline", "logistic"].map((model, i) => ({
              task: "direction",
              model,
              fold: 3,
              phase: "historical_development",
              version: String(i + 1).repeat(64),
              datasetFingerprint: "d".repeat(64),
              trainStart: iso(end - 500 * 86400000),
              trainEnd: iso(end - 200 * 86400000),
              validationStart: iso(end - 199 * 86400000),
              validationEnd: iso(end - 140 * 86400000),
              evaluationStart: iso(end - 139 * 86400000),
              evaluationEnd: iso(end),
              eventThreshold: 0,
              trainingPrevalence: 0.5,
              threshold: 0.5,
              thresholdPolicy: "fixed",
              status: "available",
              metrics: {
                samples: 4,
                positives: 2,
                prevalence: 0.5,
                accuracy: 0.5,
                balancedAccuracy: 0.5,
                precision: 0.5,
                recall: 0.5,
                f1: 0.5,
                rocAuc: 0.5,
                averagePrecision: 0.5,
                brier: 0.25,
                falsePositiveRate: 0.5,
                confusion: [1, 1, 1, 1],
              },
            }))
          : [],
        regressions: [],
        monitoring: [],
        deterioration: [],
        anomalies: available
          ? {
              observations: 585,
              labelsAvailable: false,
              totals: [
                "rolling_z",
                "rolling_iqr",
                "rolling_mad",
                "isolation_forest",
              ].map((method) => ({
                method,
                eligible: 400,
                flagged: method === "rolling_z" ? 1 : 0,
              })),
              events: [
                {
                  time: iso(end),
                  method: "rolling_z",
                  indicator: "return_1",
                  score: 4,
                  threshold: 3,
                  referenceStart: iso(end - 60 * 86400000),
                  referenceEnd: iso(end - 86400000),
                  severity: "moderate",
                },
              ],
              eventsTruncated: false,
            }
          : null,
        anomalyFrequency: [],
        findings: available
          ? [
              "TEST FIXTURE verified historical research, not an approved forecast.",
            ]
          : [],
      };
    }),
  };
  return analyticsReportSchema.parse(report);
}
export function analyticsResponseFixture(
  symbol: Symbol = "BTCUSDT",
  now = Date.now(),
  ready = true,
) {
  const { assets, ...metadata } = analyticsFixture(now, ready);
  return analyticsResponseSchema.parse({
    symbol,
    status: "available",
    reason: null,
    report: { ...metadata, asset: assets.find((a) => a.symbol === symbol) },
  });
}
