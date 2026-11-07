import { z } from "zod";

export const newsSymbolSchema = z.enum(["BTCUSDT", "ETHUSDT"]);
export type NewsSymbol = z.infer<typeof newsSymbolSchema>;
export const newsProviderSchema = z.enum([
  "gdelt",
  "federal_reserve_rss",
  "ethereum_foundation_rss",
  "bitcoin_core_rss",
  "sec_rss",
]);
export type NewsProviderId = z.infer<typeof newsProviderSchema>;
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
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const newsLinkSchema = z
  .url()
  .max(4096)
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  });
export const newsEvidenceSchema = z
  .strictObject({
    id: z.string().regex(/^[a-f0-9]{32}$/),
    title: z.string().min(8).max(300),
    sourceUrl: newsLinkSchema,
    providerUrl: newsLinkSchema,
    provider: newsProviderSchema,
    sourceName: z.string().min(1).max(100),
    publisherDomain: z.string().min(1).max(253),
    language: z.string().min(1).max(50),
    publishedAt: timestamp.nullable(),
    indexedAt: timestamp.nullable(),
    observedAt: timestamp,
    contentLevel: z.literal("headline_only"),
    reliability: z.enum(["official_primary", "news_index"]),
    category: newsCategorySchema,
    scope: z.enum(["market_wide", "coin_specific"]),
    symbols: z.array(newsSymbolSchema).min(1).max(2),
    sourceResponseSha256: digest,
  })
  .superRefine((record, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      record.publishedAt &&
      Date.parse(record.publishedAt) > Date.parse(record.observedAt)
    )
      issue("Future publication time");
    if (
      record.indexedAt &&
      Date.parse(record.indexedAt) > Date.parse(record.observedAt)
    )
      issue("Future indexing time");
    if (
      record.provider === "gdelt"
        ? record.publishedAt !== null ||
          !record.indexedAt ||
          record.reliability !== "news_index"
        : !record.publishedAt ||
          record.indexedAt !== null ||
          record.reliability !== "official_primary"
    )
      issue("Invalid provider time/reliability contract");
    if (new Set(record.symbols).size !== record.symbols.length)
      issue("Duplicate symbols");
  });
export type NewsEvidence = z.infer<typeof newsEvidenceSchema>;
export const newsEventSchema = z
  .strictObject({
    evidence: newsEvidenceSchema,
    symbol: newsSymbolSchema,
    analysisStatus: z.enum([
      "not_configured",
      "disabled",
      "not_analyzed",
      "analyzed",
    ]),
    analyzedAt: timestamp.nullable(),
    sentiment: newsSentimentSchema,
    potentialImpact: newsImpactSchema,
    uncertainty: newsUncertaintySchema,
    reportType: z.enum([
      "primary_statement",
      "unverified_reporting",
      "opinion",
      "speculation",
    ]),
    evidenceQuote: z.string().min(8).max(300).nullable(),
    explanation: z.string().max(600).nullable(),
  })
  .superRefine((event, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (!event.evidence.symbols.includes(event.symbol))
      issue("Symbol outside source evidence");
    if (event.analysisStatus !== "analyzed") {
      if (
        event.analyzedAt ||
        event.sentiment !== "unknown" ||
        event.potentialImpact !== "unknown" ||
        event.evidenceQuote ||
        event.explanation
      )
        issue("Unanalyzed news must not carry AI conclusions");
    } else if (
      !event.analyzedAt ||
      Date.parse(event.analyzedAt) < Date.parse(event.evidence.observedAt) ||
      !event.evidenceQuote ||
      !event.evidence.title.includes(event.evidenceQuote) ||
      !event.explanation ||
      event.uncertainty !== "high"
    )
      issue(
        "Headline analysis requires past evidence, exact quote and high uncertainty",
      );
    if (
      event.evidence.reliability === "news_index" &&
      event.reportType === "primary_statement"
    )
      issue("Indexing does not establish primary verification");
  });
export type NewsEvent = z.infer<typeof newsEventSchema>;
export const newsCoverageSchema = z.strictObject({
  sourceId: z.string().min(1).max(50),
  provider: newsProviderSchema,
  status: z.enum([
    "ok",
    "empty",
    "partial",
    "unavailable",
    "rate_limited",
    "cooldown",
    "disabled",
  ]),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  reason: z.string().max(80).nullable(),
  checkedAt: timestamp,
});
export type NewsCoverage = z.infer<typeof newsCoverageSchema>;
export const newsAttributionSchema = z.strictObject({
  provider: newsProviderSchema,
  name: z.string().min(1).max(100),
  url: newsLinkSchema,
  termsUrl: newsLinkSchema,
  usage: z.literal("headline_metadata_and_links_only"),
});
export const newsSnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal("news-insight-v2"),
    symbol: newsSymbolSchema,
    status: z.enum(["available", "insufficient_evidence"]),
    generatedAt: timestamp,
    lastCheckedAt: timestamp,
    expiresAt: timestamp,
    model: z.string().max(100).nullable(),
    analysisStatus: z.enum([
      "not_configured",
      "disabled",
      "not_analyzed",
      "analyzed",
    ]),
    analyzedAt: timestamp.nullable(),
    evidenceFingerprint: digest,
    outlook: newsSentimentSchema,
    summary: z.string().max(600).nullable(),
    events: z.array(newsEventSchema).max(8),
    attribution: z.array(newsAttributionSchema).max(5),
    coverage: z.array(newsCoverageSchema).max(10),
    limitations: z.array(z.string().max(300)).min(1).max(10),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      Date.parse(value.generatedAt) > Date.parse(value.lastCheckedAt) ||
      Date.parse(value.lastCheckedAt) >= Date.parse(value.expiresAt)
    )
      issue("Invalid cache timestamps");
    if (
      new Set(value.events.map((e) => e.evidence.id)).size !==
      value.events.length
    )
      issue("Duplicate evidence");
    if (value.events.some((e) => e.symbol !== value.symbol))
      issue("Wrong symbol");
    if (
      value.status === "available"
        ? !value.events.length
        : value.events.length > 0
    )
      issue("Inconsistent evidence status");
    if (
      value.analysisStatus !== "analyzed" &&
      (value.model ||
        value.analyzedAt ||
        value.summary ||
        value.outlook !== "unknown" ||
        value.events.some((e) => e.analysisStatus === "analyzed"))
    )
      issue("Source-only snapshot must not imply AI analysis");
    if (
      value.analysisStatus === "analyzed" &&
      (!value.model || !value.analyzedAt || !value.summary)
    )
      issue("Missing analysis metadata");
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
        value.data ||
        !value.reason ||
        value.freshness !== "unavailable" ||
        value.lastUpdatedAt ||
        value.lastCheckedAt ||
        value.expiresAt
      )
        issue("Invalid unavailable response");
      return;
    }
    if (!value.data || value.reason) {
      issue("Missing snapshot");
      return;
    }
    if (
      value.symbol !== value.data.symbol ||
      value.lastUpdatedAt !== value.data.generatedAt ||
      value.lastCheckedAt !== value.data.lastCheckedAt ||
      value.expiresAt !== value.data.expiresAt
    )
      issue("Metadata mismatch");
    if (
      value.status === "stale"
        ? value.freshness !== "stale"
        : value.freshness !== "fresh" || value.status !== value.data.status
    )
      issue("Inconsistent freshness");
  });
export type NewsInsightResponse = z.infer<typeof newsInsightResponseSchema>;
