import {
  aiReviewReportSchema,
  type AiReviewReport,
  type AnalysisMlResult,
  type ForecastMode,
} from "@investing-hub/shared/future-analysis";
import type { Symbol } from "@investing-hub/shared/contracts";
import { hash, insufficient } from "./errors.js";

export interface ReviewContext {
  symbol: Symbol;
  mode: ForecastMode;
  ml: AnalysisMlResult;
  freshness: "fresh" | "stale" | "unavailable";
  fingerprint: string;
}
export const fingerprint = (
  ml: AnalysisMlResult,
  freshness: ReviewContext["freshness"],
  mode: ForecastMode = "approved",
) =>
  hash(
    JSON.stringify({
      ml,
      freshness,
      ...(mode === "experimental" ? { mode } : {}),
    }),
  );
export function validateReview(
  input: AiReviewReport,
  context: ReviewContext,
): AiReviewReport {
  const parsed = aiReviewReportSchema.safeParse(input);
  if (!parsed.success) throw insufficient("report_schema");
  const report = parsed.data,
    content = report.content;

  if (content.forecastFingerprint !== context.fingerprint)
    throw insufficient("review_fingerprint");
  if (
    report.symbol !== context.symbol ||
    content.symbol !== context.symbol ||
    content.horizon !== "1d" ||
    content.mlModelId !== (context.ml.data?.modelId ?? null) ||
    !context.ml.data
  )
    throw insufficient("review_identity");
  const prose = [
    content.executiveSummary,
    content.criticalReview,
    ...content.risks,
    ...Object.values(content.scenarios),
    ...content.recommendations,
    ...content.limitations,
  ];
  if (
    prose.some((text) =>
      /https?:\/\/|www\.|[$€£]\s*\d|\b\d+(?:\.\d+)?\s*%|\b\d+(?:[.,]\d+)?\b|price target|corrected price|guaranteed returns?|\b(?:today|yesterday|breaking news|latest news|according to|recently announced|recently reported)\b|\bbuy now\b|\bsell now\b|ignore\s+(?:all\s+)?(?:previous|system)\s+instructions|reveal.{0,20}(?:api.?key|secret)/i.test(
        text,
      ),
    )
  )
    throw insufficient("unsafe_review");
  return report;
}
