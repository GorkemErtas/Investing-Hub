import { createHash } from "node:crypto";
import { z } from "zod";
import {
  newsCategorySchema,
  newsImpactSchema,
  newsSentimentSchema,
  newsSymbolSchema,
  newsUncertaintySchema,
} from "@investing-hub/shared/news";

export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class NewsError extends Error {
  constructor(
    public code:
      | "DISABLED"
      | "UNCONFIGURED"
      | "BUSY"
      | "STORAGE"
      | "BUDGET"
      | "QUOTA"
      | "TIMEOUT"
      | "PROVIDER"
      | "EVIDENCE"
      | "INVALID_ANALYSIS",
    public transient = false,
    public retryAfterSeconds = 0,
  ) {
    super(code);
  }
}

export interface Evidence {
  id: string;
  sourceUrl: string;
  providerUrl: string;
  provider: "cryptopanic" | "federal_reserve_rss";
  sourceName: string;
  title: string;
  summary: string;
  text: string;
  publishedAt: string;
  observedAt: string;
  contentHash: string;
  sourceResponseSha256: string;
  primary: boolean;
  opinion: boolean;
  symbols: ("BTCUSDT" | "ETHUSDT")[];
}
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
        supportingQuote: z.string().min(20).max(500),
      }),
    )
    .max(8),
});
export type Analysis = z.infer<typeof analysisSchema>;
