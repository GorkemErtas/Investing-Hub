import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import {
  newsEvidenceSchema,
  type NewsEvidence,
  type NewsSymbol,
} from "@investing-hub/shared/news";
import { hash, NewsError } from "./types.js";
import { safeArticleUrl, type Source } from "./sources.js";

export const normalizeText = (text: string) =>
  text
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp);/g,
      (m) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&nbsp;": " ",
        })[m]!,
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export const unsafeContent = (text: string) =>
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|system)\s+(?:instructions|prompts)|(?:system|developer)\s*(?:message|prompt)\s*:|reveal.{0,30}(?:api.?key|secret)|<\|(?:im_start|system)|(?:execute|run).{0,20}(?:shell|command)|override.{0,20}instructions/i.test(
    text,
  );
const btc = /\b(bitcoin|btc)\b/i,
  eth = /\b(ethereum|ether|eth|eip-?\d+)\b/i;
const crypto = /\b(crypto(?:currency|currencies)?|digital assets?)\b/i;
export function categoryFor(title: string): NewsEvidence["category"] {
  if (/\b(hack|exploit|vulnerabilit\w*|security|stolen|breach)\b/i.test(title))
    return "security";
  if (/\betfs?\b|exchange.traded/i.test(title)) return "etf";
  if (
    /\b(interest rates?|monetary|fomc|federal funds|rate (?:cut|hike)|inflation)\b/i.test(
      title,
    )
  )
    return "monetary_policy";
  if (/\b(regulat\w*|sec|law|legislat\w*|enforcement|ban)\b/i.test(title))
    return "regulation";
  if (/\b(outage|halt|disruption|withdrawals?)\b/i.test(title))
    return "exchange_disruption";
  if (
    /\b(core|releases?|upgrade|fork|protocol|glamsterdam|network|validator|eip\w*)\b/i.test(
      title,
    )
  )
    return "network";
  if (/\b(institution\w*|adoption|treasury)\b/i.test(title))
    return "institutional_adoption";
  return "ecosystem";
}
function relevance(
  title: string,
  source: Source,
): { symbols: NewsSymbol[]; scope: NewsEvidence["scope"] } | null {
  if (
    /\b(price prediction|price forecast|technical analysis|price today|casino|giveaway|sponsored)\b/i.test(
      title,
    )
  )
    return null;
  if (["ethereum_foundation_rss", "bitcoin_core_rss"].includes(source.provider))
    return { symbols: source.symbols, scope: "coin_specific" };
  const symbols: NewsSymbol[] = [
    ...(btc.test(title) ? ["BTCUSDT" as const] : []),
    ...(eth.test(title) ? ["ETHUSDT" as const] : []),
  ];
  if (symbols.length)
    return {
      symbols,
      scope: symbols.length === 2 ? "market_wide" : "coin_specific",
    };
  const category = categoryFor(title);
  if (
    source.provider === "federal_reserve_rss" &&
    category === "monetary_policy"
  )
    return { symbols: ["BTCUSDT", "ETHUSDT"], scope: "market_wide" };
  if (crypto.test(title))
    return { symbols: ["BTCUSDT", "ETHUSDT"], scope: "market_wide" };
  return null;
}
function record(
  titleValue: string,
  urlValue: string,
  source: Source,
  times: { publishedAt: string | null; indexedAt: string | null },
  language: string,
  sha: string,
  now: number,
): NewsEvidence {
  const title = normalizeText(titleValue),
    sourceUrl = safeArticleUrl(urlValue);
  const selected = relevance(title, source);
  if (!selected || unsafeContent(title)) throw new NewsError("EVIDENCE");
  const official = source.provider !== "gdelt";
  const publisherDomain = new URL(sourceUrl).hostname;
  return newsEvidenceSchema.parse({
    id: hash(sourceUrl).slice(0, 32),
    title,
    sourceUrl,
    providerUrl: official ? source.url : "https://www.gdeltproject.org/",
    provider: source.provider,
    sourceName: official ? source.attribution.name : publisherDomain,
    publisherDomain,
    language,
    ...times,
    observedAt: new Date(now).toISOString(),
    contentLevel: "headline_only",
    reliability: official ? "official_primary" : "news_index",
    category: categoryFor(title),
    ...selected,
    sourceResponseSha256: sha,
  });
}
const gdeltArticle = z.object({
  url: z.string(),
  title: z.string(),
  domain: z.string(),
  language: z.string().min(1).max(50),
  seendate: z.string(),
});
export function parseGdelt(text: string, source: Source, now: number) {
  let rows: unknown[];
  try {
    const payload = JSON.parse(text);
    rows =
      Object.keys(payload).length === 0
        ? []
        : z.object({ articles: z.array(z.unknown()).max(250) }).parse(payload)
            .articles;
  } catch {
    throw new NewsError("EVIDENCE");
  }
  const evidence: NewsEvidence[] = [];
  let rejected = 0;
  for (const raw of rows) {
    try {
      const row = gdeltArticle.parse(raw),
        url = safeArticleUrl(row.url);
      if (
        new URL(url).hostname.replace(/^www\./, "") !==
        row.domain.toLowerCase().replace(/^www\./, "")
      )
        throw new NewsError("EVIDENCE");
      const stamp = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
        row.seendate,
      );
      if (!stamp) throw new NewsError("EVIDENCE");
      const indexedAt = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}.000Z`;
      if (
        !z.iso.datetime().safeParse(indexedAt).success ||
        Date.parse(indexedAt) > now ||
        now - Date.parse(indexedAt) > 72 * 3600000
      )
        throw new NewsError("EVIDENCE");
      // DOC ArticleList supplies a seen/indexing date, not verified publication.
      evidence.push(
        record(
          row.title,
          url,
          source,
          { publishedAt: null, indexedAt },
          row.language,
          hash(text),
          now,
        ),
      );
    } catch {
      rejected++;
    }
  }
  return { evidence, rejected };
}
function rssDate(value: string): string {
  const match =
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) ([0-2]\d):([0-5]\d):([0-5]\d) (GMT|[+-]\d{4})$/.exec(
      value,
    );
  if (!match) throw new NewsError("EVIDENCE");
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].indexOf(match[2]);
  if (
    Number(match[1]) < 1 ||
    Number(match[1]) >
      new Date(Date.UTC(Number(match[3]), month + 1, 0)).getUTCDate() ||
    Number(match[4]) > 23 ||
    (match[7] !== "GMT" &&
      (Number(match[7].slice(1, 3)) > 14 || Number(match[7].slice(3)) > 59))
  )
    throw new NewsError("EVIDENCE");
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new NewsError("EVIDENCE");
  return new Date(time).toISOString();
}
export function parseOfficialRss(
  text: string,
  source: Source,
  now: number,
  lookbackHours = 336,
) {
  if (
    Buffer.byteLength(text) > 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  )
    throw new NewsError("EVIDENCE");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    parseTagValue: false,
    trimValues: true,
    isArray: (name) => name === "item",
  }).parse(text);
  if (!parsed?.rss?.channel || typeof parsed.rss.channel !== "object")
    throw new NewsError("EVIDENCE");
  const rows = parsed.rss.channel.item ?? [];
  if (!Array.isArray(rows) || rows.length > 250)
    throw new NewsError("EVIDENCE");
  const evidence: NewsEvidence[] = [];
  let rejected = 0;
  for (const row of rows) {
    try {
      if (
        ![row.title, row.link, row.pubDate].every((v) => typeof v === "string")
      )
        throw new NewsError("EVIDENCE");
      const url = safeArticleUrl(row.link),
        publishedAt = rssDate(row.pubDate);
      if (
        !source.hosts.includes(new URL(url).hostname) ||
        Date.parse(publishedAt) > now ||
        now - Date.parse(publishedAt) > lookbackHours * 3600000
      )
        throw new NewsError("EVIDENCE");
      // Deliberately ignore description, content:encoded, images and bodies,
      // even when a feed happens to include a full copyrighted article.
      evidence.push(
        record(
          row.title,
          url,
          source,
          { publishedAt, indexedAt: null },
          "en",
          hash(text),
          now,
        ),
      );
    } catch {
      rejected++;
    }
  }
  return { evidence, rejected };
}
export function deduplicate(records: NewsEvidence[]): NewsEvidence[] {
  const result: NewsEvidence[] = [];
  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  for (const entry of records.sort(
    (a, b) =>
      Number(b.reliability === "official_primary") -
      Number(a.reliability === "official_primary"),
  )) {
    const tokens = words(entry.title);
    const same = result.find((other) => {
      if (entry.sourceUrl === other.sourceUrl) return true;
      if (
        entry.scope === "coin_specific" &&
        other.scope === "coin_specific" &&
        !entry.symbols.some((s) => other.symbols.includes(s))
      )
        return false;
      const otherTokens = words(other.title),
        intersection = [...tokens].filter((t) => otherTokens.has(t)).length;
      const t1 = entry.publishedAt ?? entry.indexedAt!,
        t2 = other.publishedAt ?? other.indexedAt!;
      return (
        Math.abs(Date.parse(t1) - Date.parse(t2)) < 86400000 &&
        intersection / Math.max(1, new Set([...tokens, ...otherTokens]).size) >=
          0.85
      );
    });
    if (same) {
      if (same.reliability !== "official_primary")
        same.symbols = [...new Set([...same.symbols, ...entry.symbols])];
    } else result.push(structuredClone(entry));
  }
  return result;
}
export function balancedSelection(
  records: NewsEvidence[],
  perCoin = 8,
): NewsEvidence[] {
  const sorted = [...records].sort(
    (a, b) =>
      Number(b.reliability === "official_primary") -
        Number(a.reliability === "official_primary") ||
      Date.parse(b.publishedAt ?? b.indexedAt!) -
        Date.parse(a.publishedAt ?? a.indexedAt!),
  );
  const selected = new Map<string, NewsEvidence>();
  const counts: Record<NewsSymbol, number> = { BTCUSDT: 0, ETHUSDT: 0 };
  // Alternate coins, counting a market-wide record against both limits. Taking
  // the union of independent per-coin slices could exceed a snapshot's bound.
  for (let round = 0; round < perCoin; round++)
    for (const symbol of ["BTCUSDT", "ETHUSDT"] as const) {
      const item = sorted.find(
        (e) =>
          e.symbols.includes(symbol) &&
          !selected.has(e.id) &&
          e.symbols.every((s) => counts[s] < perCoin),
      );
      if (item) {
        selected.set(item.id, item);
        for (const s of item.symbols) counts[s]++;
      }
    }
  return [...selected.values()];
}
export const evidenceFingerprint = (records: NewsEvidence[]) =>
  hash(
    JSON.stringify(
      records
        .map((e) => [
          e.id,
          e.title,
          e.provider,
          e.symbols,
          e.publishedAt,
          e.indexedAt,
        ])
        .sort(),
    ),
  );
