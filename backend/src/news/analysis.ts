import {
  newsEventSchema,
  newsSnapshotSchema,
  type NewsEvent,
  type NewsEvidence,
  type NewsSnapshot,
  type NewsSymbol,
} from "@investing-hub/shared/news";
import {
  normalizeText,
  unsafeContent,
  evidenceFingerprint,
} from "./evidence.js";
import { analysisSchema, NewsError } from "./types.js";

export function sourceEvents(
  evidence: NewsEvidence[],
  status: "not_configured" | "disabled" | "not_analyzed",
): NewsEvent[] {
  return evidence.flatMap((record) =>
    record.symbols.map((symbol) =>
      newsEventSchema.parse({
        evidence: record,
        symbol,
        analysisStatus: status,
        analyzedAt: null,
        sentiment: "unknown",
        potentialImpact: "unknown",
        uncertainty: record.reliability === "news_index" ? "high" : "unknown",
        reportType:
          record.reliability === "official_primary"
            ? "primary_statement"
            : "unverified_reporting",
        evidenceQuote: null,
        explanation: null,
      }),
    ),
  );
}
export function analyzeEvents(
  json: string,
  evidence: NewsEvidence[],
  now: number,
): NewsEvent[] {
  let parsed;
  try {
    parsed = analysisSchema.parse(JSON.parse(json));
  } catch {
    throw new NewsError("INVALID_ANALYSIS");
  }
  const sources = new Map(evidence.map((e) => [e.id, e])),
    seen = new Set<string>();
  const results: NewsEvent[] = [];
  for (const result of parsed.analyses) {
    const source = sources.get(result.evidenceId),
      quote = normalizeText(result.supportingQuote);
    if (
      !source ||
      seen.has(source.id) ||
      !source.title.includes(quote) ||
      unsafeContent(quote)
    )
      throw new NewsError("INVALID_ANALYSIS");
    seen.add(source.id);
    if (!result.relevant) continue;
    const symbols: NewsSymbol[] =
      result.scope === "market_wide"
        ? ["BTCUSDT", "ETHUSDT"]
        : [...new Set(result.symbols)];
    if (symbols.some((s) => !source.symbols.includes(s)))
      throw new NewsError("INVALID_ANALYSIS");
    const reportType = /\b(opinion|predict\w*|rumou?r|speculat\w*)\b/i.test(
      source.title,
    )
      ? "opinion"
      : source.reliability === "news_index"
        ? result.reportType === "speculation"
          ? "speculation"
          : "unverified_reporting"
        : result.reportType === "speculation" || result.reportType === "opinion"
          ? result.reportType
          : "primary_statement";
    for (const symbol of symbols)
      results.push(
        newsEventSchema.parse({
          evidence: source,
          symbol,
          analysisStatus: "analyzed",
          analyzedAt: new Date(now).toISOString(),
          sentiment: result.sentiment,
          potentialImpact: result.potentialImpact,
          uncertainty: "high",
          reportType,
          evidenceQuote: quote,
          explanation: `Headline-only assessment: ${result.sentiment} sentiment; ${result.potentialImpact} potential relevance. The linked article was not read or fact-checked.`,
        }),
      );
  }
  // Every accepted classification must map to exactly one supplied evidence ID;
  // omitted/irrelevant records remain source-only rather than disappearing.
  return results;
}
export interface SnapshotInput {
  evidence: NewsEvidence[];
  coverage: NewsSnapshot["coverage"];
  attribution: NewsSnapshot["attribution"];
  generatedAt: string;
  lastCheckedAt: string;
  expiresAt: string;
}
export function snapshots(
  input: SnapshotInput,
  status: NewsSnapshot["analysisStatus"],
  model: string | null = null,
  analyzed: NewsEvent[] = [],
  analyzedAt: string | null = null,
): Record<NewsSymbol, NewsSnapshot> {
  const base = sourceEvents(
    input.evidence,
    status === "analyzed" ? "not_analyzed" : status,
  );
  const merged = base.map(
    (e) =>
      analyzed.find(
        (a) => a.symbol === e.symbol && a.evidence.id === e.evidence.id,
      ) ?? e,
  );
  return Object.fromEntries(
    (["BTCUSDT", "ETHUSDT"] as const).map((symbol) => {
      const events = merged.filter((e) => e.symbol === symbol);
      const sentiments = new Set(
        events
          .filter((e) => e.analysisStatus === "analyzed")
          .map((e) => e.sentiment)
          .filter((s) => s !== "unknown"),
      );
      const outlook =
        status === "analyzed"
          ? sentiments.size > 1
            ? "mixed"
            : ([...sentiments][0] ?? "unknown")
          : "unknown";
      return [
        symbol,
        newsSnapshotSchema.parse({
          schemaVersion: "news-insight-v2",
          symbol,
          status: events.length ? "available" : "insufficient_evidence",
          generatedAt: input.generatedAt,
          lastCheckedAt: input.lastCheckedAt,
          expiresAt: input.expiresAt,
          model: status === "analyzed" ? model : null,
          analysisStatus: status,
          analyzedAt: status === "analyzed" ? analyzedAt : null,
          evidenceFingerprint: evidenceFingerprint(input.evidence),
          outlook,
          summary:
            status === "analyzed"
              ? `Headline-only news sentiment: ${outlook}. This is not a market forecast or independent verification.`
              : null,
          events,
          attribution: input.attribution,
          coverage: input.coverage,
          limitations: [
            "Only headlines and source metadata were collected; original articles and images were not downloaded.",
            "GDELT indexing is not fact-checking; its indexedAt is not an article publication date.",
            "Coverage is selective; see per-source availability. No live X/Twitter coverage.",
            "Unknown sentiment/impact means no AI conclusion; headline-based analysis has high uncertainty.",
          ],
        }),
      ];
    }),
  ) as Record<NewsSymbol, NewsSnapshot>;
}
