import { createHash } from "node:crypto";
import { z } from "zod";
import {
  newsCategorySchema,
  newsImpactSchema,
  newsSentimentSchema,
  newsSymbolSchema,
  newsUncertaintySchema,
  type NewsEvidence,
} from "@investing-hub/shared/news";
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const providerCategorySchema = z.enum([
  "success",
  "bad_request",
  "unauthenticated",
  "permission_denied",
  "not_found",
  "rate_limited",
  "server_error",
  "http_error",
  "timeout",
  "network_error",
  "sdk_error",
  "invalid_response",
  "local_cooldown",
  "budget_exhausted",
]);
export const providerDiagnosticSchema = z.strictObject({
  httpStatus: z.number().int().min(100).max(599).nullable(),
  category: providerCategorySchema,
  elapsedMs: z.number().int().nonnegative().nullable(),
});
export type ProviderDiagnostic = z.infer<typeof providerDiagnosticSchema>;
export class NewsError extends Error {
  constructor(
    public code:
      | "DISABLED"
      | "UNCONFIGURED"
      | "BUSY"
      | "STORAGE"
      | "BUDGET"
      | "QUOTA"
      | "COOLDOWN"
      | "TIMEOUT"
      | "PROVIDER"
      | "EVIDENCE"
      | "INVALID_ANALYSIS",
    public transient = false,
    public retryAfterSeconds = 0,
    public details: {
      httpStatus?: number;
      elapsedMs?: number;
      reason?: string;
      category?: ProviderDiagnostic["category"];
    } = {},
  ) {
    super(code);
  }
}
// Pick only bounded numbers and an allowlisted category, never serialize details
// or the original exception (which can contain prompts, headers and credentials).
export function safeProviderDiagnostic(
  error: NewsError,
): ProviderDiagnostic | null {
  const category = providerCategorySchema.safeParse(error.details.category);
  if (!category.success) return null;
  return {
    category: category.data,
    httpStatus:
      providerDiagnosticSchema.shape.httpStatus.safeParse(
        error.details.httpStatus,
      ).data ?? null,
    elapsedMs:
      providerDiagnosticSchema.shape.elapsedMs.safeParse(
        error.details.elapsedMs,
      ).data ?? null,
  };
}
export type Evidence = NewsEvidence;
export const analysisSchema = z.strictObject({
  analyses: z
    .array(
      z.strictObject({
        evidenceId: z.string().regex(/^[a-f0-9]{32}$/),
        relevant: z.boolean(),
        symbols: z.array(newsSymbolSchema).min(1).max(2),
        scope: z.enum(["market_wide", "coin_specific"]),
        category: newsCategorySchema,
        sentiment: newsSentimentSchema,
        potentialImpact: newsImpactSchema,
        uncertainty: newsUncertaintySchema,
        reportType: z.enum([
          "primary_statement",
          "reported",
          "opinion",
          "speculation",
        ]),
        supportingQuote: z.string().min(8).max(300),
      }),
    )
    .max(16),
});
