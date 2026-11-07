import type { GenerateContentResponse } from "@google/genai";
import type { Config } from "../config.js";
import { emptyState, type NewsState } from "./store.js";
import { providerFailure } from "./provider.js";
import { NewsError } from "./types.js";

export function requestRunner(
  config: Config,
  state: NewsState,
  checkpoint: () => Promise<void>,
  clock: () => number,
  pause: (ms: number) => Promise<void>,
) {
  return async function call<T>(
    kind: "source" | "gemini",
    key: string,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const attempts = key === "gdelt" ? 1 : 3;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (
        kind === "gemini"
          ? state.blockedUntil > clock()
          : (state.sourceCooldowns[key] ?? 0) > clock()
      )
        throw new NewsError(kind === "source" ? "COOLDOWN" : "QUOTA");
      if (kind === "source" && (state.nextSourceAt[key] ?? 0) > clock())
        await pause(state.nextSourceAt[key] - clock());
      const date = new Date(clock()).toISOString().slice(0, 10);
      if (state.usage.day !== date) {
        if (state.usage.day)
          state.usageHistory = [...state.usageHistory, state.usage].slice(-31);
        state.usage = { ...emptyState().usage, day: date };
      }
      const counter = kind === "source" ? "sourceRequests" : "requests";
      if (
        state.usage[counter] >=
        (kind === "source"
          ? config.NEWS_MAX_DAILY_SOURCE_REQUESTS
          : config.NEWS_MAX_DAILY_REQUESTS)
      )
        throw new NewsError("BUDGET");
      state.usage[counter]++;
      if (kind === "gemini") state.usage.unknownCostRequests++;
      state.lastAttempt = clock();
      await checkpoint();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          action(controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new NewsError("TIMEOUT"));
            }, config.NEWS_PROVIDER_TIMEOUT_MS);
          }),
        ]);
        if (kind === "gemini") {
          const usage = (result as GenerateContentResponse).usageMetadata;
          if (
            usage?.promptTokenCount !== undefined &&
            usage.candidatesTokenCount !== undefined
          ) {
            state.usage.inputTokens += usage.promptTokenCount;
            state.usage.outputTokens +=
              usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0);
            if (config.GEMINI_MODEL === "gemini-3.5-flash-lite") {
              state.usage.unknownCostRequests--;
              state.usage.estimatedUsd +=
                (usage.promptTokenCount * 0.3) / 1e6 +
                ((usage.candidatesTokenCount +
                  (usage.thoughtsTokenCount ?? 0)) *
                  2.5) /
                  1e6;
            }
          }
        }
        return result;
      } catch (error) {
        const failure = providerFailure(error);
        if (failure.code === "QUOTA") {
          if (kind === "gemini")
            state.blockedUntil =
              clock() + Math.max(60, failure.retryAfterSeconds) * 1000;
          else
            state.sourceCooldowns[key] =
              clock() +
              Math.max(key === "gdelt" ? 900 : 60, failure.retryAfterSeconds) *
                1000;
        } else if (key === "gdelt")
          state.sourceCooldowns[key] = clock() + 300000;
        if (!failure.transient || attempt === attempts - 1) throw failure;
        await pause(500 * 2 ** attempt);
      } finally {
        if (timer) clearTimeout(timer);
        if (key === "gdelt")
          state.nextSourceAt[key] = clock() + config.NEWS_GDELT_MIN_INTERVAL_MS;
        await checkpoint();
      }
    }
    throw new NewsError("PROVIDER");
  };
}
export type RequestRunner = ReturnType<typeof requestRunner>;
