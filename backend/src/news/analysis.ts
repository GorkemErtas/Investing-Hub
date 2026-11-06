import type {
  NewsEvent,
  NewsSnapshot,
  NewsSymbol,
} from "@investing-hub/shared/news";
import {
  newsEventSchema,
  newsSnapshotSchema,
} from "@investing-hub/shared/news";
import { normalizeText, unsafeContent } from "./evidence.js";
import { analysisSchema, hash, NewsError, type Evidence } from "./types.js";

export function analyzeEvents(
  json: string,
  evidence: Evidence[],
  now: number,
): NewsEvent[] {
  let parsed;
  try {
    parsed = analysisSchema.parse(JSON.parse(json));
  } catch {
    throw new NewsError("INVALID_ANALYSIS");
  }
  const sources = new Map(evidence.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const result: NewsEvent[] = [];
  for (const analysis of parsed.analyses) {
    const source = sources.get(analysis.evidenceId);
    const quote = normalizeText(analysis.supportingQuote);
    if (
      !source ||
      seen.has(source.id) ||
      !source.text.includes(quote) ||
      unsafeContent(quote)
    )
      throw new NewsError("INVALID_ANALYSIS");
    seen.add(source.id);
    if (
      !analysis.relevant ||
      analysis.category === "other" ||
      analysis.potentialImpact === "unknown"
    )
      continue;
    const symbols: NewsSymbol[] =
      analysis.scope === "market_wide"
        ? ["BTCUSDT", "ETHUSDT"]
        : [...new Set(analysis.symbols)];
    if (symbols.some((symbol) => !source.symbols.includes(symbol)))
      throw new NewsError("INVALID_ANALYSIS");
    const reportType = source.opinion
      ? "opinion"
      : analysis.reportType === "primary_statement" && !source.primary
        ? "reported"
        : analysis.reportType;
    for (const symbol of symbols) {
      result.push(
        newsEventSchema.parse({
          id: hash(`${symbol}:${source.id}:${source.contentHash}`).slice(0, 32),
          symbol,
          title: source.title,
          summary: source.summary,
          sourceUrl: source.sourceUrl,
          providerUrl: source.providerUrl,
          provider: source.provider,
          sourceName: source.sourceName,
          publishedAt: source.publishedAt,
          observedAt: source.observedAt,
          analyzedAt: new Date(now).toISOString(),
          category: analysis.category,
          scope: analysis.scope,
          sentiment: analysis.sentiment,
          potentialImpact: analysis.potentialImpact,
          uncertainty:
            reportType === "opinion" || reportType === "speculation"
              ? "high"
              : analysis.uncertainty,
          reportType,
          evidenceReference: source.id,
          sourceResponseSha256: source.sourceResponseSha256,
          evidenceQuote: quote,
          verification:
            source.provider === "cryptopanic"
              ? "api_record_metadata"
              : "official_rss_metadata",
        }),
      );
    }
  }
  return result;
}

export function snapshot(
  symbol: NewsSymbol,
  events: NewsEvent[],
  fingerprint: string,
  model: string,
  now: number,
  ttl: number,
  attribution: NewsSnapshot["attribution"],
): NewsSnapshot {
  const relevant = events.filter((e) => e.symbol === symbol);
  const sentiments = new Set(
    relevant.map((e) => e.sentiment).filter((s) => s !== "unknown"),
  );
  const outlook =
    sentiments.size > 1 ? "mixed" : ([...sentiments][0] ?? "unknown");
  return newsSnapshotSchema.parse({
    schemaVersion: "news-insight-v1",
    symbol,
    status: relevant.length ? "available" : "insufficient_evidence",
    generatedAt: new Date(now).toISOString(),
    lastCheckedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl * 1000).toISOString(),
    model,
    evidenceFingerprint: fingerprint,
    outlook,
    summary: relevant.length
      ? `Source-supported news sentiment: ${outlook}. Sentiment does not establish future market direction.`
      : "Insufficient verified evidence.",
    events: relevant,
    attribution,
    limitations: [
      "Source validation establishes API/RSS provenance and publication metadata, not independent factual truth.",
      "Coverage is selective and may omit material events; no comprehensive real-time X/Twitter coverage.",
      "No numerical market forecast or calibrated probability is produced.",
    ],
  });
}
