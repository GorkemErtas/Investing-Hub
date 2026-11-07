import {
  newsInsightResponseSchema,
  type NewsInsightResponse,
  type NewsSymbol,
  type NewsCoverage,
  type NewsEvidence,
} from "@investing-hub/shared/news";
import type { Config } from "../config.js";
import { analyzeEvents, snapshots } from "./analysis.js";
import {
  balancedSelection,
  deduplicate,
  evidenceFingerprint,
  parseGdelt,
  parseOfficialRss,
  parseReleases,
} from "./evidence.js";
import {
  createGeminiProvider,
  providerFailure,
  type NewsProvider,
} from "./provider.js";
import { newsSources, sourceRequest, type SourceRequest } from "./sources.js";
import { NewsStore, type NewsState } from "./store.js";
import { requestRunner, type RequestRunner } from "./requests.js";
import { NewsError } from "./types.js";

export interface NewsReader {
  read(symbol: NewsSymbol): Promise<NewsInsightResponse>;
}
export const newsAvailability = (config: Config) =>
  config.NEWS_INTELLIGENCE_ENABLED === "true" ? null : ("disabled" as const);
export function analysisAvailability(
  config: Config,
): "not_configured" | "disabled" | "not_analyzed" {
  if (!config.GEMINI_API_KEY || config.GEMINI_KEY_ROTATED !== "true")
    return "not_configured";
  return config.NEWS_AI_ANALYSIS_ENABLED === "true"
    ? "not_analyzed"
    : "disabled";
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
  const store = dependencies.store ?? new NewsStore(config.NEWS_STORAGE_PATH),
    clock = dependencies.now ?? Date.now;
  const pause =
    dependencies.pause ??
    ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retained = (generatedAt: string) =>
    clock() - Date.parse(generatedAt) < config.NEWS_RETENTION_HOURS * 3600000;
  let running = false;
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
    if (newsAvailability(config)) return unavailable("disabled");
    try {
      const state = await store.read();
      if (!state.collection || !state.snapshots[symbol])
        return unavailable("no_snapshot");
      if (!retained(state.collection.generatedAt))
        return unavailable("retention_expired");
      if (Date.parse(state.collection.lastCheckedAt) > clock())
        return unavailable("storage_unavailable");
      const ai = analysisAvailability(config);
      const cached =
        ai !== "not_analyzed" ||
        state.snapshots[symbol]!.model !== config.GEMINI_MODEL
          ? snapshots(state.collection, ai)[symbol]
          : state.snapshots[symbol]!;
      const data = {
        ...cached,
        coverage: state.lastCoverage.length
          ? state.lastCoverage
          : cached.coverage,
      };
      const stale = Date.parse(data.expiresAt) <= clock();
      return newsInsightResponseSchema.parse({
        symbol,
        status: stale ? "stale" : data.status,
        freshness: stale ? "stale" : "fresh",
        reason: null,
        lastUpdatedAt: data.generatedAt,
        lastCheckedAt: data.lastCheckedAt,
        expiresAt: data.expiresAt,
        data,
      });
    } catch {
      return unavailable("storage_unavailable");
    }
  }
  function removeExpired(state: NewsState) {
    if (state.collection && !retained(state.collection.generatedAt)) {
      state.collection = null;
      state.snapshots = {};
    }
  }
  async function execute<T>(
    action: (state: NewsState, call: RequestRunner) => Promise<T>,
  ): Promise<T> {
    if (running) throw new NewsError("BUSY");
    running = true;
    let release: (() => Promise<void>) | undefined;
    let state: NewsState | undefined;
    let saved: Pick<NewsState, "collection" | "snapshots"> | undefined;
    try {
      release = await store.lock();
      state = await store.read();
      removeExpired(state);
      saved = structuredClone({
        collection: state.collection,
        snapshots: state.snapshots,
      });
      if (state.lastAttempt > clock()) throw new NewsError("STORAGE");
      const result = await action(
        state,
        requestRunner(config, state, () => store.write(state!), clock, pause),
      );
      state.lastFailure = null;
      await store.write(state);
      return result;
    } catch (error) {
      const failure = providerFailure(error);
      if (state && saved) {
        state.collection = saved.collection;
        state.snapshots = saved.snapshots;
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
  async function collect() {
    if (newsAvailability(config)) throw new NewsError("DISABLED");
    return execute(async (state, call) => {
      if (state.collection && Date.parse(state.collection.expiresAt) > clock())
        return { status: "cache_hit", usage: state.usage };
      const fetchSource = dependencies.sourceRequest ?? sourceRequest(config);
      const records: NewsEvidence[] = [],
        coverage: NewsCoverage[] = [];
      const sources = newsSources(config),
        failed = new Set<string>(),
        successfulProviders = new Set<string>();
      let successes = 0;
      for (const source of sources) {
        const item: NewsCoverage = {
          sourceId: source.id,
          provider: source.provider,
          checkedAt: new Date(clock()).toISOString(),
          status: "disabled",
          accepted: 0,
          rejected: 0,
          httpStatus: null,
          elapsedMs: null,
          reason: source.enabled
            ? null
            : source.provider === "ethereum_foundation_rss"
              ? "automated_access_terms_require_review"
              : "disabled_by_configuration",
        };
        coverage.push(item);
        if (!source.enabled) continue;
        try {
          const result = await call(
            "source",
            source.provider === "gdelt" ? "gdelt" : source.id,
            (signal) => fetchSource(new URL(source.url), signal),
          );
          item.httpStatus = result.httpStatus ?? null;
          item.elapsedMs = result.elapsedMs ?? null;
          const parsed =
            source.provider === "gdelt"
              ? parseGdelt(result.text, source, clock())
              : source.provider === "lighthouse_releases"
                ? parseReleases(
                    result.text,
                    source,
                    clock(),
                    config.NEWS_RELEASE_LOOKBACK_HOURS,
                  )
                : parseOfficialRss(
                    result.text,
                    source,
                    clock(),
                    config.NEWS_LOOKBACK_HOURS,
                  );
          successes++;
          successfulProviders.add(source.provider);
          records.push(...parsed.evidence);
          item.accepted = parsed.evidence.length;
          item.rejected = parsed.rejected;
          item.status = item.accepted
            ? item.rejected
              ? "partial"
              : "ok"
            : "empty";
          item.reason = !item.accepted
            ? !item.rejected
              ? "no_matching_articles"
              : parsed.invalid
                ? "invalid_records"
                : "no_relevant_articles"
            : item.rejected
              ? "some_records_rejected"
              : null;
        } catch (error) {
          const failure = providerFailure(error);
          failed.add(source.provider);
          item.status =
            failure.code === "QUOTA"
              ? "rate_limited"
              : failure.code === "COOLDOWN"
                ? "cooldown"
                : "unavailable";
          item.httpStatus = failure.details.httpStatus ?? item.httpStatus;
          item.elapsedMs = failure.details.elapsedMs ?? item.elapsedMs;
          item.reason =
            failure.details.reason ??
            (
              {
                TIMEOUT: "request_timeout",
                QUOTA: "http_rate_limit",
                COOLDOWN: "local_cooldown",
                EVIDENCE: "invalid_response",
                BUDGET: "daily_budget_exhausted",
              } as Record<string, string>
            )[failure.code] ??
            "connection_failed";
          if (source.provider === "gdelt" && failure.code === "EVIDENCE")
            state.sourceCooldowns.gdelt = clock() + 300000;
        } finally {
          item.checkedAt = new Date(clock()).toISOString();
        }
      }
      state.diagnostics = Object.fromEntries(
        coverage.map((c) => [`${c.sourceId}_${c.status}`, c.accepted]),
      );
      state.lastCoverage = coverage;
      if (!successes) throw new NewsError("PROVIDER");
      // A failing index must not suppress healthy RSS. Retain still-valid old
      // metadata from failed providers, explicitly marked by coverage status.
      for (const record of state.collection?.evidence ?? []) {
        const date = record.publishedAt ?? record.indexedAt!;
        if (
          failed.has(record.provider) &&
          clock() - Date.parse(date) <=
            (record.provider === "gdelt"
              ? 72
              : record.provider === "lighthouse_releases"
                ? config.NEWS_RELEASE_LOOKBACK_HOURS
                : config.NEWS_LOOKBACK_HOURS) *
              3600000
        )
          records.push(record);
      }
      const evidence = balancedSelection(deduplicate(records));
      const same =
        state.collection &&
        evidenceFingerprint(state.collection.evidence) ===
          evidenceFingerprint(evidence);
      const checkedAt = new Date(clock()).toISOString();
      const collection = {
        generatedAt: same ? state.collection!.generatedAt : checkedAt,
        lastCheckedAt: checkedAt,
        expiresAt: new Date(
          clock() + config.NEWS_CACHE_TTL_SECONDS * 1000,
        ).toISOString(),
        evidence: same ? state.collection!.evidence : evidence,
        coverage,
        attribution: sources
          .filter(
            (s) =>
              successfulProviders.has(s.provider) ||
              evidence.some((e) => e.provider === s.provider),
          )
          .map((s) => s.attribution)
          .filter(
            (a, i, all) =>
              all.findIndex((b) => b.provider === a.provider) === i,
          ),
      };
      state.collection = collection;
      const oldAnalyzed =
        same &&
        Object.values(state.snapshots).every(
          (s) =>
            s.analysisStatus === "analyzed" && s.model === config.GEMINI_MODEL,
        );
      if (oldAnalyzed && analysisAvailability(config) === "not_analyzed") {
        for (const symbol of ["BTCUSDT", "ETHUSDT"] as const)
          state.snapshots[symbol] = {
            ...state.snapshots[symbol]!,
            lastCheckedAt: collection.lastCheckedAt,
            expiresAt: collection.expiresAt,
            coverage,
            attribution: collection.attribution,
          };
      } else
        state.snapshots = snapshots(collection, analysisAvailability(config));
      return {
        status: same ? "unchanged_evidence" : "collected",
        events: {
          BTCUSDT: state.snapshots.BTCUSDT!.events.length,
          ETHUSDT: state.snapshots.ETHUSDT!.events.length,
        },
        coverage,
        geminiRequests: 0,
        usage: state.usage,
      };
    });
  }
  async function analyze() {
    if (newsAvailability(config))
      return { status: "disabled", geminiRequests: 0 };
    const availability = analysisAvailability(config);
    if (availability !== "not_analyzed")
      return { status: availability, geminiRequests: 0 };
    return execute(async (state, call) => {
      if (
        !state.collection ||
        Date.parse(state.collection.expiresAt) <= clock()
      )
        throw new NewsError("EVIDENCE");
      const fingerprint = evidenceFingerprint(state.collection.evidence);
      if (
        Object.values(state.snapshots).length === 2 &&
        Object.values(state.snapshots).every(
          (s) =>
            s.analysisStatus === "analyzed" &&
            s.model === config.GEMINI_MODEL &&
            s.evidenceFingerprint === fingerprint,
        )
      )
        return { status: "cache_hit", geminiRequests: 0 };
      if (!state.collection.evidence.length)
        return { status: "insufficient_evidence", geminiRequests: 0 };
      const provider = dependencies.provider ?? createGeminiProvider(config);
      const response = await call("gemini", "gemini", (signal) =>
        provider.analyze(state.collection!.evidence, signal),
      );
      const results = analyzeEvents(
        response.text ?? "",
        state.collection.evidence,
        clock(),
      );
      state.snapshots = snapshots(
        state.collection,
        "analyzed",
        config.GEMINI_MODEL,
        results,
        new Date(clock()).toISOString(),
      );
      return { status: "analyzed", usage: state.usage };
    });
  }
  const prune = () =>
    execute(async (state) => ({
      status: "pruned",
      remainingSnapshots: Object.keys(state.snapshots).length,
    }));
  async function status() {
    const state = await store.read();
    return {
      capabilities: {
        collection: newsAvailability(config) ?? "enabled",
        analysis: analysisAvailability(config),
      },
      usage: state.usage,
      usageHistory: state.usageHistory,
      blockedUntil: state.blockedUntil,
      sourceCooldowns: state.sourceCooldowns,
      lastFailure: state.lastFailure,
      collectedAt: state.collection?.generatedAt ?? null,
      coverage: state.lastCoverage.length
        ? state.lastCoverage
        : (state.collection?.coverage ?? []),
      snapshots: Object.fromEntries(
        Object.entries(state.snapshots).map(([symbol, s]) => [
          symbol,
          {
            status: s.status,
            analysisStatus: s.analysisStatus,
            events: s.events.length,
            generatedAt: s.generatedAt,
            expiresAt: s.expiresAt,
          },
        ]),
      ),
    };
  }
  return { read, collect, analyze, status, prune };
}
