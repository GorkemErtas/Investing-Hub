import { readFile, stat } from "node:fs/promises";
import {
  experimentalPublicationSchema,
  type AnalysisMlResult,
} from "@investing-hub/shared/future-analysis";
import type { Symbol } from "@investing-hub/shared/contracts";
import type { Config } from "../config.js";
import { hash } from "./errors.js";

export interface ExperimentalReader {
  read(symbol: Symbol): Promise<{
    result: AnalysisMlResult;
    freshness: "fresh" | "stale" | "unavailable";
  }>;
}
export function createExperimentalReader(
  config: Config,
  now = Date.now,
): ExperimentalReader {
  return {
    async read(symbol) {
      const unavailable = (reason: string) => ({
        result: { symbol, status: "unavailable" as const, reason, data: null },
        freshness: "unavailable" as const,
      });
      try {
        if (
          (await stat(config.FUTURE_EXPERIMENTAL_EXPORT_PATH)).size >
          2 * 1024 * 1024
        )
          return unavailable("invalid_ml_export");
        const registryBefore = await stat(config.FUTURE_ML_DATABASE_PATH, {
          bigint: true,
        });
        const envelope = JSON.parse(
          await readFile(config.FUTURE_EXPERIMENTAL_EXPORT_PATH, "utf8"),
        );
        if (
          typeof envelope.payload !== "string" ||
          hash(envelope.payload) !== envelope.sha256
        )
          return unavailable("invalid_ml_export");
        const publication = experimentalPublicationSchema.parse(
          JSON.parse(envelope.payload),
        );
        const registryAfter = await stat(config.FUTURE_ML_DATABASE_PATH, {
          bigint: true,
        });
        if (
          registryBefore.mtimeNs !== registryAfter.mtimeNs ||
          registryBefore.size !== registryAfter.size ||
          publication.registry.mtimeNs !== registryAfter.mtimeNs.toString() ||
          publication.registry.size !== Number(registryAfter.size)
        )
          return unavailable("registry_changed_reexport_required");
        const generated = Date.parse(publication.generatedAt);
        if (
          generated > now() ||
          now() - generated > config.FUTURE_STALE_SECONDS * 1000
        )
          return unavailable("ml_export_expired");
        const result = publication.forecasts.find(
          (item) => item.symbol === symbol,
        )!;
        if (!result.data) return { result, freshness: "unavailable" };
        const data = result.data;
        if (
          Date.parse(data.targetCloseTime) <= now() ||
          Date.parse(data.modelExpiresAt) <= now() ||
          Date.parse(data.generatedAt) > generated ||
          Date.parse(data.sourceCandleCloseTime) + 1 !==
            Math.floor(now() / 86400000) * 86400000
        )
          return unavailable("forecast_expired_or_noncausal");
        return {
          result,
          freshness:
            now() - generated > config.FUTURE_CACHE_TTL_SECONDS * 1000
              ? "stale"
              : "fresh",
        };
      } catch (error) {
        return unavailable(
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "no_experimental_publication"
            : "invalid_ml_export",
        );
      }
    },
  };
}
