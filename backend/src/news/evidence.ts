import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import { hash, NewsError, type Evidence } from "./types.js";
import { safeArticleUrl } from "./sources.js";

export const normalizeText = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
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
    .replace(/\s+/g, " ")
    .trim();
const injection =
  /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|system)\s+(?:instructions|prompts)|(?:system|developer)\s*(?:message|prompt)\s*:|reveal.{0,30}(?:api.?key|secret)|<\|(?:im_start|system)|(?:execute|run).{0,20}(?:shell|command)|override.{0,20}instructions/i;
export const unsafeContent = (s: string) => injection.test(s);

interface RecordInput {
  sourceUrl: string;
  providerUrl: string;
  provider: Evidence["provider"];
  sourceName: string;
  title: string;
  summary: string;
  publishedAt: string;
  symbols: Evidence["symbols"];
  primary: boolean;
  sourceResponseSha256: string;
}
function record(input: RecordInput, now: number): Evidence {
  const sourceUrl = safeArticleUrl(input.sourceUrl);
  const providerUrl = safeArticleUrl(input.providerUrl);
  const title = normalizeText(input.title),
    summary = normalizeText(input.summary).slice(0, 600);
  const text = normalizeText(`${title} ${summary}`);
  const published = Date.parse(input.publishedAt);
  if (
    !title ||
    title.length > 300 ||
    title.length < 20 ||
    !Number.isFinite(published) ||
    published > now ||
    now - published > 72 * 3600000 ||
    unsafeContent(text) ||
    !input.sourceName.trim()
  )
    throw new NewsError("EVIDENCE");
  return {
    ...input,
    id: hash(sourceUrl).slice(0, 32),
    sourceUrl,
    providerUrl,
    title,
    summary: summary || title,
    text,
    contentHash: hash(text.toLowerCase()),
    sourceName: normalizeText(input.sourceName).slice(0, 100),
    publishedAt: new Date(published).toISOString(),
    observedAt: new Date(now).toISOString(),
    opinion:
      /\b(opinion|commentary|speculat|rumou?r|predicts?|price target)\b/i.test(
        text,
      ),
  };
}

const apiItem = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullish(),
  published_at: z.iso.datetime({ offset: true }),
  url: z.string(),
  original_url: z.string().nullish(),
  kind: z.string(),
  source: z.object({ title: z.string(), domain: z.string(), type: z.string() }),
  instruments: z.array(z.object({ code: z.string() })).default([]),
});
export function parseCryptoPanic(text: string, now: number) {
  let payload;
  try {
    payload = z
      .object({ results: z.array(z.unknown()).max(50) })
      .parse(JSON.parse(text));
  } catch {
    throw new NewsError("EVIDENCE");
  }
  const result: Evidence[] = [];
  let rejected = 0;
  for (const raw of payload.results) {
    try {
      const item = apiItem.parse(raw);
      if (
        !["news", "blog"].includes(item.kind) ||
        ["twitter", "reddit", "media"].includes(item.source.type)
      )
        throw new NewsError("EVIDENCE");
      const providerUrl = safeArticleUrl(item.url);
      if (
        new URL(providerUrl).hostname !== "cryptopanic.com" ||
        !new URL(providerUrl).pathname.startsWith("/news/")
      )
        throw new NewsError("EVIDENCE");
      const sourceUrl = item.original_url
        ? safeArticleUrl(item.original_url)
        : providerUrl;
      if (
        item.original_url &&
        new URL(sourceUrl).hostname.replace(/^www\./, "") !==
          item.source.domain.replace(/^www\./, "").toLowerCase()
      )
        throw new NewsError("EVIDENCE");
      const symbols = item.instruments.flatMap((i) =>
        i.code === "BTC"
          ? ["BTCUSDT" as const]
          : i.code === "ETH"
            ? ["ETHUSDT" as const]
            : [],
      );
      if (!symbols.length) throw new NewsError("EVIDENCE");
      result.push(
        record(
          {
            sourceUrl,
            providerUrl,
            provider: "cryptopanic",
            sourceName: item.source.title,
            title: item.title,
            summary: item.description ?? item.title,
            publishedAt: item.published_at,
            symbols: [...new Set(symbols)],
            primary: false,
            sourceResponseSha256: hash(text),
          },
          now,
        ),
      );
    } catch {
      rejected++;
    }
  }
  return { evidence: result, rejected };
}

export function parseOfficialRss(text: string, feedUrl: string, now: number) {
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
  const items = parsed.rss.channel.item ?? [];
  if (!Array.isArray(items) || items.length > 100)
    throw new NewsError("EVIDENCE");
  const result: Evidence[] = [];
  let rejected = 0;
  for (const item of items) {
    try {
      if (
        ![item.title, item.link, item.pubDate].every(
          (v) => typeof v === "string",
        ) ||
        !/(?:GMT|[+-]\d{4})$/.test(item.pubDate)
      )
        throw new NewsError("EVIDENCE");
      const calendar =
        /(?:^|,\s*)(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+([0-2]\d):([0-5]\d):([0-5]\d)/.exec(
          item.pubDate,
        );
      if (!calendar) throw new NewsError("EVIDENCE");
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
      ].indexOf(calendar[2]);
      if (
        Number(calendar[1]) < 1 ||
        Number(calendar[1]) >
          new Date(Date.UTC(Number(calendar[3]), month + 1, 0)).getUTCDate() ||
        Number(calendar[4]) > 23
      )
        throw new NewsError("EVIDENCE");
      const sourceUrl = safeArticleUrl(item.link);
      if (new URL(sourceUrl).hostname !== "www.federalreserve.gov")
        throw new NewsError("EVIDENCE");
      result.push(
        record(
          {
            sourceUrl,
            providerUrl: feedUrl,
            provider: "federal_reserve_rss",
            sourceName: "Federal Reserve Board",
            title: item.title,
            summary:
              typeof item.description === "string"
                ? item.description
                : item.title,
            publishedAt: item.pubDate,
            symbols: ["BTCUSDT", "ETHUSDT"],
            primary: true,
            sourceResponseSha256: hash(text),
          },
          now,
        ),
      );
    } catch {
      rejected++;
    }
  }
  return { evidence: result, rejected };
}

export function deduplicate(evidence: Evidence[]): Evidence[] {
  const result: Evidence[] = [];
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  for (const entry of evidence) {
    const words = tokens(entry.title);
    if (
      result.some((other) => {
        if (
          entry.sourceUrl === other.sourceUrl ||
          entry.contentHash === other.contentHash ||
          (entry.summary.length >= 80 &&
            entry.summary.toLowerCase() === other.summary.toLowerCase())
        )
          return true;
        const otherWords = tokens(other.title);
        return (
          Math.abs(
            Date.parse(entry.publishedAt) - Date.parse(other.publishedAt),
          ) < 86400000 &&
          [...words].filter((w) => otherWords.has(w)).length /
            Math.max(1, new Set([...words, ...otherWords]).size) >=
            0.8
        );
      })
    )
      continue;
    result.push(entry);
  }
  return result;
}
