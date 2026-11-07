import { isIP } from "node:net";
import type { Config } from "../config.js";
import type {
  NewsProviderId,
  NewsSnapshot,
  NewsSymbol,
} from "@investing-hub/shared/news";
import { NewsError } from "./types.js";

export const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
export interface Source {
  id: string;
  provider: NewsProviderId;
  url: string;
  enabled: boolean;
  symbols: NewsSymbol[];
  hosts: string[];
  attribution: NewsSnapshot["attribution"][number];
}
const attribution = (
  provider: NewsProviderId,
  name: string,
  url: string,
  termsUrl: string,
) => ({
  provider,
  name,
  url,
  termsUrl,
  usage: "headline_metadata_and_links_only" as const,
});
export function newsSources(config: Config): Source[] {
  const rss: Source[] = [
    {
      id: "bitcoin_core",
      provider: "bitcoin_core_rss",
      url: "https://bitcoincore.org/en/rss.xml",
      enabled: true,
      symbols: ["BTCUSDT"],
      hosts: ["bitcoincore.org"],
      attribution: attribution(
        "bitcoin_core_rss",
        "Bitcoin Core",
        "https://bitcoincore.org",
        "https://github.com/bitcoin-core/bitcoincore.org/blob/master/COPYING",
      ),
    },
    {
      id: "ethereum_foundation",
      provider: "ethereum_foundation_rss",
      url: "https://blog.ethereum.org/en/feed.xml",
      enabled: config.NEWS_ETHEREUM_RSS_ENABLED === "true",
      symbols: ["ETHUSDT"],
      hosts: ["blog.ethereum.org"],
      attribution: attribution(
        "ethereum_foundation_rss",
        "Ethereum Foundation Blog",
        "https://blog.ethereum.org",
        "https://ethereum.org/terms-of-use/",
      ),
    },
    ...["press_all.xml", "press_monetary.xml"].map((path, i): Source => ({
      id: `fed_${i}`,
      provider: "federal_reserve_rss",
      url: `https://www.federalreserve.gov/feeds/${path}`,
      enabled: true,
      symbols: ["BTCUSDT", "ETHUSDT"],
      hosts: ["www.federalreserve.gov"],
      attribution: attribution(
        "federal_reserve_rss",
        "Federal Reserve Board",
        "https://www.federalreserve.gov/feeds/feeds.htm",
        "https://www.federalreserve.gov/disclaimer.htm",
      ),
    })),
    {
      id: "sec",
      provider: "sec_rss",
      url: "https://www.sec.gov/news/pressreleases.rss",
      enabled: true,
      symbols: ["BTCUSDT", "ETHUSDT"],
      hosts: ["www.sec.gov"],
      attribution: attribution(
        "sec_rss",
        "SEC",
        "https://www.sec.gov/about/rss-feeds",
        "https://www.sec.gov/about/privacy-information",
      ),
    },
  ];
  const queries = [
    ["gdelt_btc", '(bitcoin OR "BTC crypto") sourcelang:english', ["BTCUSDT"]],
    ["gdelt_eth", '(ethereum OR "ETH crypto") sourcelang:english', ["ETHUSDT"]],
    [
      "gdelt_market",
      "(crypto OR cryptocurrency) (regulation OR ETF OR exchange OR hack OR security OR institutional) sourcelang:english",
      ["BTCUSDT", "ETHUSDT"],
    ],
  ] as const;
  return [
    ...rss,
    ...queries.map(([id, query, symbols]): Source => {
      const url = new URL(GDELT_ENDPOINT);
      url.search = new URLSearchParams({
        query,
        mode: "artlist",
        format: "json",
        maxrecords: "25",
        timespan: "72h",
        sort: "datedesc",
      }).toString();
      return {
        id,
        provider: "gdelt",
        url: url.toString(),
        enabled: config.NEWS_GDELT_ENABLED === "true",
        symbols: [...symbols],
        hosts: [],
        attribution: attribution(
          "gdelt",
          "GDELT Project",
          "https://www.gdeltproject.org/",
          "https://www.gdeltproject.org/about.html#termsofuse",
        ),
      };
    }),
  ];
}
// Display-only original links; never followed or upgraded to an unverified URL.
export function safeArticleUrl(value: string): string {
  if (value.length > 4096) throw new NewsError("EVIDENCE");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NewsError("EVIDENCE");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.port ||
    url.username ||
    url.password ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) ||
    url.hostname.endsWith(".")
  )
    throw new NewsError("EVIDENCE");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (
      /^(utm_|gclid$|fbclid$|ocid$|auth_token$|api_key$|key$|token$)/i.test(key)
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString().replace(/\/$/, "");
}
export interface SourceResponse {
  text: string;
}
export type SourceRequest = (
  url: URL,
  signal: AbortSignal,
) => Promise<SourceResponse>;
export function sourceRequest(
  config: Config,
  fetcher: typeof fetch = fetch,
): SourceRequest {
  const allowed = new Set(
    newsSources(config)
      .filter((s) => s.enabled)
      .map((s) => s.url),
  );
  return async (url, signal) => {
    if (!allowed.has(url.toString())) throw new NewsError("EVIDENCE");
    const gdelt = url.origin === "https://api.gdeltproject.org";
    const response = await fetcher(url, {
      signal,
      redirect: "error",
      headers: {
        Accept: gdelt
          ? "application/json"
          : "application/rss+xml, application/xml, text/xml",
        "User-Agent":
          "Investing-Hub-News/2.0 (+https://github.com/GorkemErtas/Investing-Hub)",
      },
    });
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const seconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry)
          : retry
            ? (Date.parse(retry) - Date.now()) / 1000
            : 3600;
      throw new NewsError(
        "QUOTA",
        false,
        Number.isFinite(seconds) ? Math.max(gdelt ? 900 : 60, seconds) : 3600,
      );
    }
    if (!response.ok)
      throw new NewsError(
        "PROVIDER",
        response.status >= 500 && response.status <= 599,
      );
    if (!response.body) throw new NewsError("EVIDENCE");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new NewsError("EVIDENCE");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (
      gdelt &&
      /^\s*(?:please limit|too many requests|rate limit)/i.test(text)
    )
      throw new NewsError("QUOTA", false, 3600);
    if (
      !(gdelt ? /application\/json/i : /(?:xml|rss)/i).test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new NewsError("EVIDENCE");
    return { text };
  };
}
