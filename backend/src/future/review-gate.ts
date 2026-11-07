import {
  groundedReportSchema,
  type GroundedReport,
  type MlResult,
} from "@investing-hub/shared/future-analysis";
import type { Symbol } from "@investing-hub/shared/contracts";
import { hash, FutureError } from "./errors.js";

export interface ReviewContext {
  symbol: Symbol;
  ml: MlResult;
  freshness: "fresh" | "stale" | "unavailable";
  fingerprint: string;
}
export const fingerprint = (
  ml: MlResult,
  freshness: ReviewContext["freshness"],
) => hash(JSON.stringify({ ml, freshness }));
export function validateSuggestions(suggestions: string): void {
  if (
    /<(?:script|iframe|object|embed|form|base|meta|link)\b|\bon\w+\s*=|@import|url\(\s*["']?https?:|\bsrc\s*=\s*["']https?:/i.test(
      suggestions,
    )
  )
    throw new FutureError("INSUFFICIENT_EVIDENCE");
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
    throw new FutureError("INSUFFICIENT_EVIDENCE");
}
export function validateReview(
  input: GroundedReport,
  context: ReviewContext,
): GroundedReport {
  const report = groundedReportSchema.parse(input),
    content = report.content;
  validateSuggestions(report.searchSuggestionsHtml);
  if (
    report.symbol !== context.symbol ||
    content.symbol !== context.symbol ||
    content.horizon !== "1d" ||
    content.mlModelId !== (context.ml.data?.modelId ?? null) ||
    content.forecastFingerprint !== context.fingerprint ||
    (!context.ml.data && content.reviewStatus === "SUPPORTED_BY_CONTEXT")
  )
    throw new FutureError("INSUFFICIENT_EVIDENCE");
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
    throw new FutureError("INSUFFICIENT_EVIDENCE");
  // Every externally researched development, risk and event needs genuine support
  // inside its original serialized response, never a model-supplied URL list.
  const supported = (text: string) => {
    const escaped = JSON.stringify(text).slice(1, -1);
    const start = report.text.indexOf(escaped);
    if (start < 0) return false;
    const left = Buffer.byteLength(report.text.slice(0, start)),
      right = left + Buffer.byteLength(escaped);
    return report.citations.some(
      (citation) => citation.startByte < right && citation.endByte > left,
    );
  };
  if (
    ![
      ...content.developments,
      ...content.risks,
      ...content.upcomingEvents,
    ].every(supported)
  )
    throw new FutureError("INSUFFICIENT_EVIDENCE");
  return report;
}
