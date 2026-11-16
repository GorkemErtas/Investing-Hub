import type { Symbol } from "@investing-hub/shared/contracts";
import {
  forecastPublicationSchema,
  type Forecast,
  type ForecastHorizon,
} from "@investing-hub/shared/forecasts";
import type { Config } from "../config.js";
import { createSnapshotLoader } from "./snapshot.js";

export interface ForecastReader {
  read(symbol: Symbol, horizon: ForecastHorizon): Promise<Forecast>;
}
export function unavailableForecast(
  symbol: Symbol,
  horizon: ForecastHorizon,
  now: number,
  reason: string,
  stale = false,
): Forecast {
  return {
    version: "forecast-v2",
    symbol,
    horizon,
    status: "unavailable",
    reason,
    stale,
    referencePrice: null,
    predictedPrice: null,
    predictedLogReturn: null,
    marketUpdatedAt: null,
    sourceCandleTime: null,
    generatedAt: new Date(now).toISOString(),
    targetTime: null,
    modelVersion: null,
    algorithm: null,
    featureSchema: null,
    datasetFingerprint: null,
    evaluationMetrics: null,
  };
}
export function createForecastReader(
  config: Config,
  now = Date.now,
): ForecastReader {
  const load = createSnapshotLoader(
    config.FORECASTS_EXPORT_PATH,
    forecastPublicationSchema,
  );
  return {
    async read(symbol, horizon) {
      if (horizon === "1M")
        return unavailableForecast(
          symbol,
          horizon,
          now(),
          "monthly_insufficient_independent_outcomes",
        );
      try {
        const publication = await load();
        const clock = now(),
          generated = Date.parse(publication.generatedAt);
        if (generated > clock || clock - generated > 90000)
          return unavailableForecast(
            symbol,
            horizon,
            clock,
            "forecast_publication_expired",
            true,
          );
        const f = publication.forecasts.find(
          (f) => f.symbol === symbol && f.horizon === horizon,
        )!;
        if (Date.parse(f.generatedAt) > clock) throw Error("Future generation");
        if (
          f.status === "experimental" &&
          (Date.parse(f.targetTime!) <= clock ||
            clock - Date.parse(f.sourceCandleTime!) > 90000)
        )
          return unavailableForecast(
            symbol,
            horizon,
            clock,
            "forecast_or_input_expired",
            true,
          );
        return structuredClone(f);
      } catch (error) {
        return unavailableForecast(
          symbol,
          horizon,
          now(),
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "no_forecast_publication"
            : "invalid_forecast_publication",
        );
      }
    },
  };
}
