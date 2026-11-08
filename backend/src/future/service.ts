import {
  futureAnalysisSchema,
  analysisMlResultSchema,
  type ForecastMode,
  type FutureAnalysis,
  type GroundedReport,
} from "@investing-hub/shared/future-analysis";
import type { Symbol } from "@investing-hub/shared/contracts";
import type { Config } from "../config.js";
import { createMlReader, type MlReader } from "./ml-reader.js";
import {
  createExperimentalReader,
  type ExperimentalReader,
} from "./experimental-reader.js";
import { createResearchProvider, type ResearchProvider } from "./provider.js";
import { FutureStore, emptyState } from "./store.js";
import { failure, FutureError, hash } from "./errors.js";
import {
  fingerprint,
  validateReview,
  type ReviewContext,
} from "./review-gate.js";

export interface FutureReader {
  read(symbol: Symbol, mode?: ForecastMode): Promise<FutureAnalysis>;
  review(
    symbol: Symbol,
    requestId: string,
    mode?: ForecastMode,
  ): Promise<FutureAnalysis>;
}
export function createFutureService(
  config: Config,
  dependencies: {
    ml?: MlReader;
    experimental?: ExperimentalReader;
    provider?: ResearchProvider;
    store?: FutureStore;
    now?: () => number;
  } = {},
) {
  const now = dependencies.now ?? Date.now,
    ml = dependencies.ml ?? createMlReader(config, now);
  const experimental =
    dependencies.experimental ?? createExperimentalReader(config, now);
  const store =
    dependencies.store ?? new FutureStore(config.FUTURE_STORAGE_PATH);
  const gate = () =>
    config.FUTURE_GEMINI_SEARCH_ENABLED !== "true"
      ? "paid_search_disabled"
      : !config.GEMINI_API_KEY || config.GEMINI_KEY_ROTATED !== "true"
        ? "credentials_not_configured"
        : config.GEMINI_MODEL !== "gemini-3.5-flash-lite"
          ? "model_capability_unverified"
          : null;
  const limitations = [
    "Only the immutable ML ledger supplies numeric forecasts, return, interval and direction. Experimental results are not validated or approved.",
    "Historical interval coverage is empirical development/selection evidence, not a guaranteed future probability.",
    "Gemini critically reviews the supplied ML evidence; context labels do not validate forecast accuracy. Sources are attributed reporting, not independent fact checking.",
    "Grounded results and Search Suggestions are returned only to the submitting request. They are not stored, shared by symbol or included in ordinary GET responses.",
  ];
  async function read(
    symbol: Symbol,
    mode: ForecastMode = "approved",
  ): Promise<FutureAnalysis> {
    let numeric: Awaited<ReturnType<ExperimentalReader["read"]>>;
    try {
      const value = await (mode === "experimental" ? experimental : ml).read(
        symbol,
      );
      numeric = {
        result: analysisMlResultSchema.parse(value.result),
        freshness: value.freshness,
      };
    } catch {
      numeric = {
        result: {
          symbol,
          status: "unavailable",
          reason: "ml_reader_unavailable",
          data: null,
        },
        freshness: "unavailable",
      };
    }
    return futureAnalysisSchema.parse({
      schemaVersion: "future-analysis-v1",
      mode,
      symbol,
      checkedAt: new Date(now()).toISOString(),
      forecastFingerprint: fingerprint(numeric.result, numeric.freshness, mode),
      mlFreshness: numeric.freshness,
      ml: numeric.result,
      research: {
        status: gate() ? "disabled" : "not_requested",
        reason: gate(),
        data: null,
      },
      conflict: null,
      limitations,
    });
  }
  function combine(
    base: FutureAnalysis,
    report: GroundedReport | null,
    reason: string | null,
  ): FutureAnalysis {
    return futureAnalysisSchema.parse({
      ...base,
      checkedAt: new Date(now()).toISOString(),
      research: {
        status: report
          ? "available"
          : reason === "insufficient_evidence"
            ? "insufficient_evidence"
            : "unavailable",
        reason,
        data: report,
      },
      conflict:
        base.ml.data && report?.content.reviewStatus === "CONFLICTING_EVIDENCE"
          ? "CONFLICTING_EVIDENCE"
          : null,
    });
  }
  async function review(
    symbol: Symbol,
    requestId: string,
    mode: ForecastMode = "approved",
  ): Promise<FutureAnalysis> {
    const base = await read(symbol, mode);
    if (gate()) return base;
    let release: (() => Promise<void>) | undefined,
      state: Awaited<ReturnType<FutureStore["read"]>> | undefined;
    const started = performance.now();
    try {
      release = await store.lock();
      state = await store.read();
      const today = new Date(now()).toISOString().slice(0, 10),
        month = today.slice(0, 7),
        identity = hash(requestId);
      for (const [id, attemptedAt] of Object.entries(state.attemptedIds))
        if (now() - attemptedAt > 35 * 86400000) delete state.attemptedIds[id];
      if (
        state.attemptedIds[identity] !== undefined ||
        (state.cooldowns[symbol] ?? 0) > now()
      )
        throw new FutureError("COOLDOWN");
      if (state.day.key !== today)
        state.day = { ...emptyState().day, key: today };
      if (state.month.key !== month)
        state.month = { ...emptyState().month, key: month };
      if (
        state.day.requests >= config.FUTURE_MAX_DAILY_REQUESTS ||
        state.month.requests >= config.FUTURE_MAX_MONTHLY_REQUESTS ||
        state.day.estimatedUsd >= config.FUTURE_MAX_DAILY_ESTIMATED_USD ||
        state.month.estimatedUsd >= config.FUTURE_MAX_MONTHLY_ESTIMATED_USD
      )
        throw new FutureError("BUDGET");
      state.attemptedIds[identity] = now();
      for (const counter of [state.day, state.month]) {
        counter.requests++;
        counter.unknownQueryRequests++;
        counter.unknownCostRequests++;
      }
      await store.write(state); // Durable reservation; no user report is cached.
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: Awaited<ReturnType<ResearchProvider["research"]>>;
      try {
        const provider =
          dependencies.provider ?? createResearchProvider(config, now);
        const context: ReviewContext = {
          symbol,
          mode: base.mode,
          ml: structuredClone(base.ml),
          freshness: base.mlFreshness,
          fingerprint: base.forecastFingerprint,
        };
        result = await Promise.race([
          provider.research(context, controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new FutureError("TIMEOUT"));
            }, config.FUTURE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const context: ReviewContext = {
        symbol,
        mode: base.mode,
        ml: base.ml,
        freshness: base.mlFreshness,
        fingerprint: base.forecastFingerprint,
      };
      const report = validateReview(result.report, context);
      if (
        Date.parse(report.generatedAt) > now() ||
        Date.parse(report.expiresAt) <= now() ||
        report.model !== config.GEMINI_MODEL
      )
        throw new FutureError("INSUFFICIENT_EVIDENCE");
      if (
        ![result.inputTokens, result.outputTokens].every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        )
      )
        throw new FutureError("INSUFFICIENT_EVIDENCE");
      for (const counter of [state.day, state.month]) {
        counter.inputTokens += result.inputTokens;
        counter.outputTokens += result.outputTokens;
        if (report.searchQueryCount !== null) {
          counter.unknownQueryRequests--;
          counter.searchQueries += report.searchQueryCount;
        }
        if (result.usageKnown && report.searchQueryCount !== null)
          counter.unknownCostRequests--;
        counter.estimatedUsd +=
          (result.inputTokens * 0.3) / 1e6 +
          (result.outputTokens * 2.5) / 1e6 +
          (report.searchQueryCount ?? 0) * 0.014;
      }
      state.cooldowns[symbol] = now() + 60000;
      state.lastFailure = null;
      await store.write(state);
      // Re-read current registry/export before delivery, never apply a review
      // to changed/expired data or a newly promoted model.
      const current = await read(symbol, mode);
      if (current.forecastFingerprint !== base.forecastFingerprint)
        return combine(current, null, "forecast_changed_during_review");
      return combine(base, report, null);
    } catch (error) {
      const safe = failure(error, Math.round(performance.now() - started));
      safe.elapsedMs ??= Math.round(performance.now() - started);
      if (state) {
        state.lastFailure = {
          code: safe.code,
          httpStatus: safe.httpStatus,
          category: safe.category,
          elapsedMs: safe.elapsedMs,
        };
        if (!["BUDGET", "COOLDOWN"].includes(safe.code))
          state.cooldowns[symbol] =
            now() + Math.max(300, safe.retryAfterSeconds) * 1000;
        try {
          await store.write(state);
        } catch {
          /* Remain fail-closed for spending; retain the ML fallback. */
        }
      }
      return combine(await read(symbol, mode), null, safe.code.toLowerCase());
    } finally {
      if (release) {
        try {
          await release();
        } catch {
          /* An unreleased lock blocks subsequent spending. */
        }
      }
    }
  }
  async function status() {
    const state = await store.read();
    return {
      researchGate: gate(),
      day: state.day,
      month: state.month,
      lastFailure: state.lastFailure,
    };
  }
  return { read, review, status };
}
