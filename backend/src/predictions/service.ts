import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { Symbol } from "@investing-hub/shared/contracts";
import {
  predictionPublicationSchema,
  type Prediction,
} from "@investing-hub/shared/predictions";
import type { Config } from "../config.js";
export interface PredictionReader {
  read(symbol: Symbol): Promise<Prediction>;
}
export function createPredictionReader(
  config: Config,
  now = Date.now,
): PredictionReader {
  type Publication = ReturnType<typeof predictionPublicationSchema.parse>;
  let cached: { key: string; value: Publication } | undefined;
  let pending: { key: string; value: Promise<Publication> } | undefined;
  const signature = (info: BigIntStats) =>
    [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");
  async function loadPublication(key: string, stamp: BigIntStats) {
    if (cached?.key === key) return cached.value;
    if (pending?.key === key) return pending.value;
    const value = (async () => {
      const envelope = JSON.parse(
        await readFile(config.PREDICTIONS_EXPORT_PATH, "utf8"),
      );
      if (
        typeof envelope.payload !== "string" ||
        createHash("sha256").update(envelope.payload).digest("hex") !==
          envelope.sha256
      )
        throw new Error("Invalid publication");
      const publication = predictionPublicationSchema.parse(
        JSON.parse(envelope.payload),
      );
      // An atomic replacement or concurrent write must be validated on the next read.
      if (
        signature(stamp) !==
        signature(await stat(config.PREDICTIONS_EXPORT_PATH, { bigint: true }))
      )
        throw new Error("Publication changed during read");
      return publication;
    })();
    pending = { key, value };
    try {
      const publication = await value;
      if (pending?.value === value) cached = { key, value: publication };
      return publication;
    } finally {
      if (pending?.value === value) pending = undefined;
    }
  }
  return {
    async read(symbol) {
      const unavailable = (reason: string): Prediction => ({
        symbol,
        target: "next_daily_close",
        horizon: "1d",
        predictionTimestamp: new Date(now()).toISOString(),
        sourceDataTimestamp: null,
        targetTimestamp: null,
        modelVersion: null,
        algorithm: null,
        datasetFingerprint: null,
        referencePrice: null,
        predictedReturn: null,
        predictedValue: null,
        evaluationReference: "local-model-evaluation",
        status: "unavailable",
        reason,
      });
      try {
        const [before, stamp] = await Promise.all([
          stat(config.ML_DATABASE_PATH, { bigint: true }),
          stat(config.PREDICTIONS_EXPORT_PATH, { bigint: true }),
        ]);
        if (stamp.size > 2n * 1024n * 1024n)
          return unavailable("invalid_prediction_publication");
        const publication = await loadPublication(
          signature(before) + "/" + signature(stamp),
          stamp,
        );
        const after = await stat(config.ML_DATABASE_PATH, { bigint: true });
        if (
          signature(before) !== signature(after) ||
          publication.registry.mtimeNs !== after.mtimeNs.toString() ||
          publication.registry.size !== Number(after.size)
        )
          return unavailable("registry_changed_regenerate_predictions");
        if (
          Date.parse(publication.generatedAt) > now() ||
          now() - Date.parse(publication.generatedAt) > 86400000
        )
          return unavailable("prediction_publication_expired");
        const result = publication.forecasts.find(
          (item) => item.symbol === symbol,
        )!;
        if (result.status !== "experimental") return { ...result };
        if (
          Date.parse(result.targetTimestamp!) <= now() ||
          Date.parse(result.sourceDataTimestamp!) + 1 !==
            Math.floor(now() / 86400000) * 86400000
        )
          return unavailable("prediction_expired");
        return { ...result };
      } catch (error) {
        return unavailable(
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "no_prediction_publication"
            : "invalid_prediction_publication",
        );
      }
    },
  };
}
