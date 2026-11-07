import { describe, expect, it } from "vitest";
import {
  newsEvidenceSchema,
  newsEventSchema,
  newsSnapshotSchema,
} from "../news.js";
const evidence = {
  id: "a".repeat(32),
  title: "TEST FIXTURE Bitcoin ETF announcement",
  sourceUrl: "https://publisher.example.com/article",
  providerUrl: "https://www.gdeltproject.org/",
  provider: "gdelt",
  sourceName: "publisher.example.com",
  publisherDomain: "publisher.example.com",
  language: "English",
  publishedAt: null,
  indexedAt: "2026-11-06T10:00:00.000Z",
  observedAt: "2026-11-06T11:00:00.000Z",
  contentLevel: "headline_only",
  reliability: "news_index",
  category: "etf",
  scope: "coin_specific",
  symbols: ["BTCUSDT"],
  sourceResponseSha256: "b".repeat(64),
};
const event = {
  evidence,
  symbol: "BTCUSDT",
  analysisStatus: "not_configured",
  analyzedAt: null,
  sentiment: "unknown",
  potentialImpact: "unknown",
  uncertainty: "high",
  reportType: "unverified_reporting",
  evidenceQuote: null,
  explanation: null,
};
const snapshot = {
  schemaVersion: "news-insight-v2",
  symbol: "BTCUSDT",
  status: "available",
  generatedAt: "2026-11-06T11:00:00.000Z",
  lastCheckedAt: "2026-11-06T11:00:00.000Z",
  expiresAt: "2026-11-06T17:00:00.000Z",
  model: null,
  analysisStatus: "not_configured",
  analyzedAt: null,
  evidenceFingerprint: "c".repeat(64),
  outlook: "unknown",
  summary: null,
  events: [event],
  attribution: [],
  coverage: [],
  limitations: ["Headline metadata only; not fact-checked."],
};
describe("free source-only news contracts", () => {
  it("preserves unknown publication time while carrying an index timestamp", () =>
    expect(newsEvidenceSchema.safeParse(evidence).success).toBe(true));
  it("rejects treating index time as publication or independent fact checking", () => {
    expect(
      newsEvidenceSchema.safeParse({
        ...evidence,
        publishedAt: evidence.indexedAt,
      }).success,
    ).toBe(false);
    expect(
      newsEvidenceSchema.safeParse({
        ...evidence,
        reliability: "official_primary",
      }).success,
    ).toBe(false);
    expect(
      newsEvidenceSchema.safeParse({
        ...evidence,
        indexedAt: "2026-11-07T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
  it("accepts source-only responses without invented AI output", () => {
    expect(newsSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      newsEventSchema.safeParse({ ...event, sentiment: "positive" }).success,
    ).toBe(false);
    expect(
      newsSnapshotSchema.safeParse({ ...snapshot, summary: "AI forecast" })
        .success,
    ).toBe(false);
    expect(
      newsSnapshotSchema.safeParse({ ...snapshot, predictedPrice: 100 })
        .success,
    ).toBe(false);
  });
  it("requires exact headline evidence and high uncertainty for analyzed items", () => {
    const analyzed = {
      ...event,
      analysisStatus: "analyzed",
      analyzedAt: "2026-11-06T12:00:00.000Z",
      sentiment: "neutral",
      potentialImpact: "medium",
      evidenceQuote: evidence.title,
      explanation: "Headline-only classification.",
    };
    expect(newsEventSchema.safeParse(analyzed).success).toBe(true);
    expect(
      newsEventSchema.safeParse({ ...analyzed, uncertainty: "medium" }).success,
    ).toBe(false);
    expect(
      newsEventSchema.safeParse({
        ...analyzed,
        evidenceQuote: "Fabricated evidence text",
      }).success,
    ).toBe(false);
  });
});
