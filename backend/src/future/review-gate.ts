import {
  groundedReportSchema,
  type GroundedReport,
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
export function validateSuggestions(suggestions: string): void {
  if (
    /<(?:script|iframe|object|embed|form|base|meta|link)\b|\bon\w+\s*=|@import|url\(\s*["']?https?:|\bsrc\s*=\s*["']https?:/i.test(
      suggestions,
    )
  )
    throw insufficient("search_suggestions");
  const links = [...suggestions.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)];
  if (
    !links.length ||
    !links.every((match) => {
      try {
        const url = new URL(match[1].replaceAll("&amp;", "&"));
        return (
          url.protocol === "https:" &&
          ["google.com", "www.google.com"].includes(url.hostname)
        );
      } catch {
        return false;
      }
    })
  )
    throw insufficient("search_suggestions");
}
export function validateReview(
  input: GroundedReport,
  context: ReviewContext,
): GroundedReport {
  const parsed = groundedReportSchema.safeParse(input);
  if (!parsed.success) throw insufficient("report_schema");
  const report = parsed.data,
    content = report.content;
  validateSuggestions(report.searchSuggestionsHtml);
  if (content.forecastFingerprint !== context.fingerprint)
    throw insufficient("review_fingerprint");
  if (
    report.symbol !== context.symbol ||
    content.symbol !== context.symbol ||
    content.horizon !== "1d" ||
    content.mlModelId !== (context.ml.data?.modelId ?? null) ||
    (!context.ml.data && content.reviewStatus === "SUPPORTED_BY_CONTEXT")
  )
    throw insufficient("review_identity");
  const prose = [
    content.executiveSummary,
    content.criticalReview,
    ...content.developments,
    ...content.risks,
    ...content.upcomingEvents,
    ...Object.values(content.scenarios),
    ...content.recommendations,
    ...content.limitations,
  ];
  if (
    prose.some((text) =>
      /https?:\/\/|www\.|[$€£]\s*\d|\b\d+(?:\.\d+)?\s*%|price target|corrected price|guaranteed returns?|\bbuy now\b|\bsell now\b|ignore\s+(?:all\s+)?(?:previous|system)\s+instructions|reveal.{0,20}(?:api.?key|secret)/i.test(
        text,
      ),
    )
  )
    throw insufficient("unsafe_review");
  // Each external claim must be fully covered by genuine provider spans in
  // the original response, never by a model-supplied URL or citation list.
  const citations = [...report.citations].sort(
    (a, b) => a.startByte - b.startByte,
  );
  const supported = (text: string) => {
    const escaped = report.text.trimStart().startsWith("{")
      ? JSON.stringify(text).slice(1, -1)
      : text;
    for (
      let start = report.text.indexOf(escaped);
      start >= 0;
      start = report.text.indexOf(escaped, start + escaped.length)
    ) {
      const left = Buffer.byteLength(report.text.slice(0, start)),
        right = left + Buffer.byteLength(escaped);
      let covered = left;
      for (const citation of citations) {
        if (citation.endByte <= covered) continue;
        if (citation.startByte > covered) break;
        covered = citation.endByte;
        if (covered >= right) return true;
      }
    }
    return false;
  };
  if (
    ![
      ...content.developments,
      ...content.risks,
      ...content.upcomingEvents,
    ].every(supported)
  )
    throw insufficient("unsupported_structured_claims");
  return report;
}
