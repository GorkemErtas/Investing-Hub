import { isIP } from "node:net";
import type { Config } from "../config.js";
import { NewsError } from "./types.js";

export const officialFeeds = [
  "https://www.federalreserve.gov/feeds/press_all.xml",
  "https://www.federalreserve.gov/feeds/press_monetary.xml",
] as const;

// Article links are validated for display only. They are NEVER fetched.
export function safeArticleUrl(value: string): string {
  if (value.length > 4096) throw new NewsError("EVIDENCE");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NewsError("EVIDENCE");
  }
  if (
    url.protocol !== "https:" ||
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
  sha256?: string;
}
export type SourceRequest = (
  url: URL,
  signal: AbortSignal,
) => Promise<SourceResponse>;
export function sourceRequest(
  config: Config,
  fetcher: typeof fetch = fetch,
): SourceRequest {
  return async (url, signal) => {
    const allowedFeed = officialFeeds.some((feed) => url.toString() === feed);
    const allowedApi =
      url.origin === "https://cryptopanic.com" &&
      url.pathname === `/api/${config.CRYPTOPANIC_PLAN}/v2/posts/`;
    if (!allowedFeed && !allowedApi) throw new NewsError("EVIDENCE");
    // Fixed destinations only; do not follow even same-site redirects or API
    // pagination URLs (which can contain the private auth_token).
    const response = await fetcher(url, {
      signal,
      redirect: "error",
      headers: {
        Accept: allowedFeed
          ? "application/rss+xml, application/xml, text/xml"
          : "application/json",
        "User-Agent": "Investing-Hub-News/1.0",
      },
    });
    if (response.status === 429 || (allowedApi && response.status === 403)) {
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
        Number.isFinite(seconds)
          ? Math.max(60, Math.min(seconds, 86400))
          : 3600,
      );
    }
    if (!response.ok)
      throw new NewsError(
        "PROVIDER",
        response.status >= 500 && response.status <= 599,
      );
    const type = response.headers.get("content-type") ?? "";
    if (
      !(allowedFeed ? /(?:xml|rss)/i : /application\/json/i).test(type) ||
      !response.body
    )
      throw new NewsError("EVIDENCE");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
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
    return { text: Buffer.concat(chunks).toString("utf8") };
  };
}
