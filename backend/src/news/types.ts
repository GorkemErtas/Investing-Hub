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
    } = {},
  ) {
    super(code);
  }
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
