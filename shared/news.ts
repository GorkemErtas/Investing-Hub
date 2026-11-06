import { z } from "zod";

export const newsSymbolSchema = z.enum(["BTCUSDT", "ETHUSDT"]);
export type NewsSymbol = z.infer<typeof newsSymbolSchema>;
export const newsSentimentSchema = z.enum([
  "positive",
  "negative",
  "neutral",
  "mixed",
  "unknown",
]);
export const newsImpactSchema = z.enum(["low", "medium", "high", "unknown"]);
export const newsUncertaintySchema = z.enum(["medium", "high", "unknown"]);
export const newsCategorySchema = z.enum([
  "regulation",
  "etf",
  "monetary_policy",
  "exchange_disruption",
  "security",
  "ecosystem",
  "institutional_adoption",
  "network",
  "other",
]);
const timestamp = z.string().datetime();
const link = z
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.port
    );
  });

export const newsEventSchema = z
  .strictObject({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    symbol: newsSymbolSchema,
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(600),
    sourceUrl: link,
    providerUrl: link,
    provider: z.enum(["cryptopanic", "federal_reserve_rss"]),
    sourceName: z.string().min(1).max(100),
    publishedAt: timestamp,
    observedAt: timestamp,
    analyzedAt: timestamp,
    category: newsCategorySchema,
    scope: z.enum(["market_wide", "coin_specific"]),
    sentiment: newsSentimentSchema,
    potentialImpact: newsImpactSchema,
    uncertainty: newsUncertaintySchema,
    reportType: z.enum([
      "primary_statement",
      "reported",
      "opinion",
      "speculation",
    ]),
    evidenceReference: z.string().regex(/^[a-f0-9]{32}$/),
    sourceResponseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    evidenceQuote: z.string().min(20).max(500),
    verification: z.enum(["api_record_metadata", "official_rss_metadata"]),
  })
  .superRefine((event, ctx) => {
    if (
      Date.parse(event.publishedAt) > Date.parse(event.observedAt) ||
      Date.parse(event.observedAt) > Date.parse(event.analyzedAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "News evidence timestamps are not chronological",
      });
  });
export type NewsEvent = z.infer<typeof newsEventSchema>;

export const newsSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal("news-insight-v1"),
    symbol: newsSymbolSchema,
    status: z.enum(["available", "insufficient_evidence"]),
    generatedAt: timestamp,
    lastCheckedAt: timestamp,
    expiresAt: timestamp,
    model: z.string().min(1).max(100),
    evidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    outlook: newsSentimentSchema,
    summary: z.string().min(1).max(600),
    events: z.array(newsEventSchema).max(12),
    attribution: z
      .array(
        z.strictObject({
          provider: z.enum(["cryptopanic", "federal_reserve_rss"]),
          name: z.string().min(1).max(100),
          url: link,
          termsUrl: link,
        }),
      )
      .max(3),
    limitations: z.array(z.string().max(300)).min(1).max(10),
  })
  .superRefine((snapshot, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      Date.parse(snapshot.generatedAt) > Date.parse(snapshot.lastCheckedAt) ||
      Date.parse(snapshot.lastCheckedAt) >= Date.parse(snapshot.expiresAt)
    )
      issue("Invalid cache timestamps");
    if (
      new Set(snapshot.events.map((e) => e.id)).size !== snapshot.events.length
    )
      issue("Duplicate event IDs");
    for (const event of snapshot.events) {
      if (
        event.symbol !== snapshot.symbol ||
        Date.parse(event.analyzedAt) > Date.parse(snapshot.generatedAt)
      )
        issue("Event is outside the snapshot contract");
    }
    if (snapshot.status === "available" && !snapshot.events.length)
      issue("Available insight requires evidence");
    if (
      snapshot.status === "insufficient_evidence" &&
      (snapshot.events.length || snapshot.outlook !== "unknown")
    )
      issue("Insufficient evidence requires an unknown outlook and no events");
  });
export type NewsSnapshot = z.infer<typeof newsSnapshotSchema>;

export const newsInsightResponseSchema = z
  .strictObject({
    symbol: newsSymbolSchema,
    status: z.enum([
      "available",
      "stale",
      "insufficient_evidence",
      "unavailable",
    ]),
    freshness: z.enum(["fresh", "stale", "unavailable"]),
    lastUpdatedAt: timestamp.nullable(),
    lastCheckedAt: timestamp.nullable(),
    expiresAt: timestamp.nullable(),
    reason: z
      .enum([
        "disabled",
        "unconfigured",
        "no_snapshot",
        "retention_expired",
        "storage_unavailable",
      ])
      .nullable(),
    data: newsSnapshotSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (value.status === "unavailable") {
      if (
        value.data !== null ||
        value.reason === null ||
        value.freshness !== "unavailable" ||
        value.lastUpdatedAt !== null ||
        value.lastCheckedAt !== null ||
        value.expiresAt !== null
      )
        issue("Unavailable news must not expose a cached insight");
      return;
    }
    if (!value.data || value.reason !== null) {
      issue("Available/stale news requires snapshot data");
      return;
    }
    if (
      value.data.symbol !== value.symbol ||
      value.lastUpdatedAt !== value.data.generatedAt ||
      value.lastCheckedAt !== value.data.lastCheckedAt ||
      value.expiresAt !== value.data.expiresAt
    )
      issue("Response metadata must match its snapshot");
    if (
      value.status === "stale"
        ? value.freshness !== "stale"
        : value.freshness !== "fresh" || value.status !== value.data.status
    )
      issue("Inconsistent news freshness/status");
  });
export type NewsInsightResponse = z.infer<typeof newsInsightResponseSchema>;
