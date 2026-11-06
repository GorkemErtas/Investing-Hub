import { describe, expect, it } from "vitest";
import {
  newsEventSchema,
  newsInsightResponseSchema,
  newsSnapshotSchema,
} from "../news.js";

const event = {
  id: "a".repeat(32),
  symbol: "ETHUSDT",
  title: "TEST FIXTURE protocol announcement",
  summary: "Synthetic evidence used only in tests.",
  sourceUrl: "https://example.com/fixture",
  providerUrl: "https://cryptopanic.com/news/123/fixture",
  provider: "cryptopanic",
  sourceName: "Fixture publisher",
  publishedAt: "2026-11-06T10:00:00.000Z",
  observedAt: "2026-11-06T11:00:00.000Z",
  analyzedAt: "2026-11-06T12:00:00.000Z",
  category: "network",
  scope: "coin_specific",
  sentiment: "neutral",
  potentialImpact: "medium",
  uncertainty: "high",
  reportType: "reported",
  evidenceReference: "b".repeat(32),
  sourceResponseSha256: "c".repeat(64),
  evidenceQuote: "Synthetic evidence used only in tests.",
  verification: "api_record_metadata",
};
const snapshot = {
  schemaVersion: "news-insight-v1",
  symbol: "ETHUSDT",
  status: "available",
  generatedAt: "2026-11-06T12:00:00.000Z",
  lastCheckedAt: "2026-11-06T12:00:00.000Z",
  expiresAt: "2026-11-06T18:00:00.000Z",
  model: "gemini-3.5-flash-lite",
  evidenceFingerprint: "d".repeat(64),
  outlook: "neutral",
  summary: "Synthetic test-only outlook.",
  events: [event],
  attribution: [
    {
      provider: "cryptopanic",
      name: "CryptoPanic",
      url: "https://cryptopanic.com",
      termsUrl: "https://cryptopanic.com/terms/",
    },
  ],
  limitations: ["Provider provenance is not independent factual verification."],
};
describe("focused news contracts", () => {
  it("accepts source-attributed news without introducing an ML forecast", () => {
    expect(newsSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      newsSnapshotSchema.safeParse({ ...snapshot, predictedPrice: 123 })
        .success,
    ).toBe(false);
  });
  it("rejects future evidence, invented classification values and missing provenance", () => {
    expect(
      newsEventSchema.safeParse({
        ...event,
        publishedAt: "2026-11-07T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      newsEventSchema.safeParse({ ...event, sentiment: "guaranteed" }).success,
    ).toBe(false);
    expect(
      newsEventSchema.safeParse({ ...event, sourceResponseSha256: undefined })
        .success,
    ).toBe(false);
    expect(
      newsEventSchema.safeParse({ ...event, sourceUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
  it("requires nonempty evidence, unique events and matching coin contracts", () => {
    expect(
      newsSnapshotSchema.safeParse({ ...snapshot, events: [] }).success,
    ).toBe(false);
    expect(
      newsSnapshotSchema.safeParse({ ...snapshot, events: [event, event] })
        .success,
    ).toBe(false);
    expect(
      newsSnapshotSchema.safeParse({ ...snapshot, symbol: "BTCUSDT" }).success,
    ).toBe(false);
    expect(
      newsSnapshotSchema.safeParse({
        ...snapshot,
        status: "insufficient_evidence",
        events: [],
        outlook: "unknown",
      }).success,
    ).toBe(true);
  });
  it("represents unavailability explicitly with null data", () => {
    expect(
      newsInsightResponseSchema.safeParse({
        symbol: "ETHUSDT",
        status: "unavailable",
        freshness: "unavailable",
        lastUpdatedAt: null,
        lastCheckedAt: null,
        expiresAt: null,
        reason: "disabled",
        data: null,
      }).success,
    ).toBe(true);
    expect(
      newsInsightResponseSchema.safeParse({
        symbol: "ETHUSDT",
        status: "unavailable",
        freshness: "fresh",
        lastUpdatedAt: snapshot.generatedAt,
        lastCheckedAt: snapshot.lastCheckedAt,
        expiresAt: snapshot.expiresAt,
        reason: "disabled",
        data: snapshot,
      }).success,
    ).toBe(false);
  });
});
