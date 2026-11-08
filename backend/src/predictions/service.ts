import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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
        if ((await stat(config.PREDICTIONS_EXPORT_PATH)).size > 2 * 1024 * 1024)
          return unavailable("invalid_prediction_publication");
        const before = await stat(config.ML_DATABASE_PATH, { bigint: true });
        const envelope = JSON.parse(
          await readFile(config.PREDICTIONS_EXPORT_PATH, "utf8"),
        );
        if (
          typeof envelope.payload !== "string" ||
          createHash("sha256").update(envelope.payload).digest("hex") !==
            envelope.sha256
        )
          return unavailable("invalid_prediction_publication");
        const publication = predictionPublicationSchema.parse(
          JSON.parse(envelope.payload),
        );
        const after = await stat(config.ML_DATABASE_PATH, { bigint: true });
        if (
          before.mtimeNs !== after.mtimeNs ||
          before.size !== after.size ||
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
        if (result.status !== "experimental") return result;
        if (
          Date.parse(result.targetTimestamp!) <= now() ||
          Date.parse(result.sourceDataTimestamp!) + 1 !==
            Math.floor(now() / 86400000) * 86400000
        )
          return unavailable("prediction_expired");
        return result;
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
