import type { GenerateContentResponse } from "@google/genai";
import {
  newsInsightResponseSchema,
  newsSnapshotSchema,
  type NewsInsightResponse,
  type NewsSymbol,
  type NewsSnapshot,
} from "@investing-hub/shared/news";
import type { Config } from "../config.js";
import { analyzeEvents, snapshot } from "./analysis.js";
import { deduplicate, parseCryptoPanic, parseOfficialRss } from "./evidence.js";
import {
  createGeminiProvider,
  providerFailure,
  type NewsProvider,
} from "./provider.js";
import { officialFeeds, sourceRequest, type SourceRequest } from "./sources.js";
import { emptyState, NewsStore, type NewsState } from "./store.js";
import { hash, NewsError, type Evidence } from "./types.js";

export interface NewsReader {
  read(symbol: NewsSymbol): Promise<NewsInsightResponse>;
}
export function newsAvailability(
  config: Config,
): NewsInsightResponse["reason"] {
  if (config.NEWS_INTELLIGENCE_ENABLED !== "true") return "disabled";
  if (!config.GEMINI_API_KEY || config.GEMINI_KEY_ROTATED !== "true")
    return "unconfigured";
  return null;
}
interface Dependencies {
  store?: NewsStore;
  provider?: NewsProvider;
  sourceRequest?: SourceRequest;
  now?: () => number;
  pause?: (ms: number) => Promise<void>;
}
export function createNewsService(
  config: Config,
  dependencies: Dependencies = {},
) {
  const store = dependencies.store ?? new NewsStore(config.NEWS_STORAGE_PATH);
  const clock = dependencies.now ?? Date.now;
  const pause =
    dependencies.pause ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let running = false;
  const retained = (snapshot: NewsSnapshot) =>
    clock() - Date.parse(snapshot.generatedAt) <
    config.NEWS_RETENTION_HOURS * 3600000;
  async function read(symbol: NewsSymbol): Promise<NewsInsightResponse> {
    const unavailable = (
      reason: NewsInsightResponse["reason"],
    ): NewsInsightResponse => ({
      symbol,
      status: "unavailable",
      freshness: "unavailable",
      reason,
      lastUpdatedAt: null,
      lastCheckedAt: null,
      expiresAt: null,
      data: null,
    });
    const disabled = newsAvailability(config);
    if (disabled) return unavailable(disabled);
    try {
      const data = (await store.read()).snapshots[symbol];
      if (!data) return unavailable("no_snapshot");
      if (!retained(data)) return unavailable("retention_expired");
      if (Date.parse(data.lastCheckedAt) > clock())
        return unavailable("storage_unavailable");
      const stale = Date.parse(data.expiresAt) <= clock();
      return newsInsightResponseSchema.parse({
        symbol,
        status: stale ? "stale" : data.status,
        freshness: stale ? "stale" : "fresh",
        lastUpdatedAt: data.generatedAt,
        lastCheckedAt: data.lastCheckedAt,
        expiresAt: data.expiresAt,
        reason: null,
        data,
      });
    } catch {
      return unavailable("storage_unavailable");
    }
  }

  async function prune() {
    const release = await store.lock();
    try {
      const state = await store.read();
      for (const symbol of ["BTCUSDT", "ETHUSDT"] as const)
        if (state.snapshots[symbol] && !retained(state.snapshots[symbol]))
          delete state.snapshots[symbol];
      await store.write(state);
      return {
        status: "pruned",
        remainingSnapshots: Object.keys(state.snapshots).length,
      };
    } finally {
      await release();
    }
  }

  async function refresh() {
    const unavailable = newsAvailability(config);
    if (unavailable)
      throw new NewsError(
        unavailable === "disabled" ? "DISABLED" : "UNCONFIGURED",
      );
    if (running) throw new NewsError("BUSY");
    running = true;
    let release: (() => Promise<void>) | undefined;
    let state: NewsState | undefined;
    let previousSnapshots: NewsState["snapshots"] | undefined;
    try {
      release = await store.lock();
      state = await store.read();
      for (const symbol of ["BTCUSDT", "ETHUSDT"] as const)
        if (state.snapshots[symbol] && !retained(state.snapshots[symbol]))
          delete state.snapshots[symbol];
      previousSnapshots = structuredClone(state.snapshots);
      const now = clock();
      if (state.lastAttempt > now) throw new NewsError("STORAGE");
      const snapshots = [state.snapshots.BTCUSDT, state.snapshots.ETHUSDT];
      if (
        snapshots.every(
          (s) =>
            s &&
            s.model === config.GEMINI_MODEL &&
            Date.parse(s.expiresAt) > now,
        )
      )
        return { status: "cache_hit", usage: state.usage };
      if (state.blockedUntil > now)
        throw new NewsError(
          "QUOTA",
          false,
          Math.ceil((state.blockedUntil - now) / 1000),
        );
      const checkpoint = () => store.write(state!);
      async function bounded<T>(
        action: (signal: AbortSignal) => Promise<T>,
      ): Promise<T> {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            action(controller.signal),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new NewsError("TIMEOUT"));
              }, config.NEWS_PROVIDER_TIMEOUT_MS);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      async function call<T>(
        kind: "gemini" | "source",
        key: string,
        action: (signal: AbortSignal) => Promise<T>,
      ): Promise<T> {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (kind === "source" && (state!.sourceCooldowns[key] ?? 0) > clock())
            throw new NewsError("QUOTA");
          const date = new Date(clock()).toISOString().slice(0, 10);
          if (state!.usage.day !== date) {
            if (state!.usage.day)
              state!.usageHistory = [
                ...state!.usageHistory,
                state!.usage,
              ].slice(-31);
            state!.usage = { ...emptyState().usage, day: date };
          }
          const counter = kind === "gemini" ? "requests" : "sourceRequests";
          const limit =
            kind === "gemini"
              ? config.NEWS_MAX_DAILY_REQUESTS
              : config.NEWS_MAX_DAILY_SOURCE_REQUESTS;
          if (state!.usage[counter] >= limit) throw new NewsError("BUDGET");
          // Durable reservation before every attempt, including retries. A
          // timeout/crash can still be billed and must not refund its budget.
          state!.usage[counter]++;
          if (kind === "gemini") state!.usage.unknownCostRequests++;
          state!.lastAttempt = clock();
          await checkpoint();
          try {
            const result = await bounded(action);
            if (kind === "gemini") {
              const usage = (result as GenerateContentResponse).usageMetadata;
              const input = usage?.promptTokenCount,
                output = usage?.candidatesTokenCount;
              const thinking = usage?.thoughtsTokenCount ?? 0;
              if (input !== undefined && output !== undefined) {
                state!.usage.inputTokens += input;
                state!.usage.outputTokens += output + thinking;
                if (config.GEMINI_MODEL === "gemini-3.5-flash-lite") {
                  state!.usage.unknownCostRequests--;
                  state!.usage.estimatedUsd +=
                    (input * 0.3) / 1e6 + ((output + thinking) * 2.5) / 1e6;
                }
              }
            }
            await checkpoint();
            return result;
          } catch (error) {
            const failure = providerFailure(error);
            if (failure.code === "QUOTA") {
              const until =
                clock() + Math.max(60, failure.retryAfterSeconds) * 1000;
              if (kind === "gemini") state!.blockedUntil = until;
              else state!.sourceCooldowns[key] = until;
              await checkpoint();
            }
            if (!failure.transient || attempt === 2) throw failure;
            await pause(500 * 2 ** attempt);
          }
        }
        throw new NewsError("PROVIDER");
      }

      const fetchSource = dependencies.sourceRequest ?? sourceRequest(config);
      const gathered: Evidence[] = [];
      const diagnostics: Record<string, number> = {};
      const attribution: NewsSnapshot["attribution"] = [];
      let successfulSources = 0;
      async function collect(
        key: string,
        url: URL,
        parse: (text: string) => { evidence: Evidence[]; rejected: number },
      ) {
        try {
          const result = await call("source", key, (signal) =>
            fetchSource(url, signal),
          );
          const records = parse(result.text);
          successfulSources++;
          gathered.push(...records.evidence);
          diagnostics[`${key}_rejected`] = records.rejected;
          return true;
        } catch (error) {
          diagnostics[`${key}_${providerFailure(error).code.toLowerCase()}`] =
            1;
          return false;
        }
      }
      for (const [index, feed] of officialFeeds.entries()) {
        if (
          (await collect(`fed_${index}`, new URL(feed), (text) =>
            parseOfficialRss(text, feed, clock()),
          )) &&
          !attribution.some((a) => a.provider === "federal_reserve_rss")
        )
          attribution.push({
            provider: "federal_reserve_rss",
            name: "Federal Reserve Board",
            url: "https://www.federalreserve.gov/feeds/feeds.htm",
            termsUrl: "https://www.federalreserve.gov/disclaimer.htm",
          });
      }
      if (config.CRYPTOPANIC_API_KEY) {
        const url = new URL(
          `/api/${config.CRYPTOPANIC_PLAN}/v2/posts/`,
          "https://cryptopanic.com",
        );
        url.search = new URLSearchParams({
          auth_token: config.CRYPTOPANIC_API_KEY,
          public: "true",
          currencies: "BTC,ETH",
          regions: "en",
          kind: "news",
          page: "1",
        }).toString();
        if (
          await collect("cryptopanic", url, (text) =>
            parseCryptoPanic(text, clock()),
          )
        )
          attribution.push({
            provider: "cryptopanic",
            name: "CryptoPanic",
            url: "https://cryptopanic.com",
            termsUrl: "https://cryptopanic.com/terms/",
          });
      } else diagnostics.cryptopanic_unconfigured = 1;
      state.diagnostics = diagnostics;
      if (!successfulSources) throw new NewsError("PROVIDER");
      const partialFailure = Object.keys(diagnostics).some((key) =>
        /_(provider|quota|timeout|evidence|budget)$/.test(key),
      );
      if (
        partialFailure &&
        Object.values(state.snapshots).some((s) => s.status === "available")
      )
        throw new NewsError("PROVIDER");
      const evidence = deduplicate(gathered)
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .slice(0, 8);
      if (
        !evidence.length &&
        Object.values(state.snapshots).some((s) => s.status === "available") &&
        Object.keys(diagnostics).some((key) =>
          /_(provider|quota|timeout|evidence|budget)$/.test(key),
        )
      )
        throw new NewsError("EVIDENCE");
      const fingerprint = hash(
        JSON.stringify({
          policy: "api-rss-news-v1",
          model: config.GEMINI_MODEL,
          evidence: evidence
            .map((e) => [e.id, e.contentHash, e.publishedAt])
            .sort(),
        }),
      );
      const unchanged = snapshots.every(
        (s) => s?.evidenceFingerprint === fingerprint,
      );
      const nextSnapshots: NewsState["snapshots"] = {};
      if (unchanged) {
        for (const symbol of ["BTCUSDT", "ETHUSDT"] as const)
          nextSnapshots[symbol] = newsSnapshotSchema.parse({
            ...state.snapshots[symbol],
            lastCheckedAt: new Date(clock()).toISOString(),
            expiresAt: new Date(
              clock() + config.NEWS_CACHE_TTL_SECONDS * 1000,
            ).toISOString(),
            attribution,
          });
      } else {
        const provider =
          dependencies.provider ??
          (evidence.length ? createGeminiProvider(config) : undefined);
        const analysis = evidence.length
          ? await call("gemini", "gemini", (signal) =>
              provider!.analyze(evidence, signal),
            )
          : undefined;
        const events = analysis
          ? analyzeEvents(analysis.text ?? "", evidence, clock())
          : [];
        for (const symbol of ["BTCUSDT", "ETHUSDT"] as const)
          nextSnapshots[symbol] = snapshot(
            symbol,
            events,
            fingerprint,
            config.GEMINI_MODEL,
            clock(),
            config.NEWS_CACHE_TTL_SECONDS,
            attribution,
          );
      }
      state.snapshots = nextSnapshots;
      if (partialFailure)
        for (const symbol of ["BTCUSDT", "ETHUSDT"] as const)
          state.snapshots[symbol]!.limitations.push(
            "One or more configured news sources were unavailable; coverage is incomplete.",
          );
      state.lastFailure = null;
      await checkpoint();
      return {
        status: unchanged ? "unchanged_evidence" : "refreshed",
        usage: state.usage,
        diagnostics,
        events: {
          BTCUSDT: state.snapshots.BTCUSDT!.events.length,
          ETHUSDT: state.snapshots.ETHUSDT!.events.length,
        },
      };
    } catch (error) {
      const failure = providerFailure(error);
      if (state && release) {
        if (previousSnapshots) state.snapshots = previousSnapshots;
        state.lastFailure = failure.code;
        await store.write(state);
      }
      throw failure;
    } finally {
      try {
        if (release) await release();
      } finally {
        running = false;
      }
    }
  }
  async function status() {
    const state = await store.read();
    return {
      availability: newsAvailability(config) ?? "configured",
      usage: state.usage,
      usageHistory: state.usageHistory,
      blockedUntil: state.blockedUntil,
      sourceCooldowns: state.sourceCooldowns,
      lastFailure: state.lastFailure,
      diagnostics: state.diagnostics,
      snapshots: Object.fromEntries(
        Object.entries(state.snapshots).map(([symbol, s]) => [
          symbol,
          {
            status: s.status,
            generatedAt: s.generatedAt,
            lastCheckedAt: s.lastCheckedAt,
            expiresAt: s.expiresAt,
            events: s.events.length,
          },
        ]),
      ),
    };
  }
  return { read, refresh, status, prune };
}
