import type { Symbol } from "@investing-hub/shared/contracts";
import type { ForecastHorizon } from "@investing-hub/shared/forecasts";
import {
  objectivePublicationSchema,
  objectiveConfirmationEndMs,
  type ObjectiveForecast,
} from "@investing-hub/shared/objectives";
import type { Config } from "../config.js";
import { createSnapshotLoader } from "./snapshot.js";

export interface ObjectiveReader {
  read(symbol: Symbol, horizon: ForecastHorizon): Promise<ObjectiveForecast>;
}
export function unavailableObjectives(
  symbol: Symbol,
  horizon: ForecastHorizon,
  now: number,
  reason: string,
  stale = false,
): ObjectiveForecast {
  const common = {
    status: "unavailable" as const,
    reason,
    generatedAt: null,
    modelVersion: null,
    algorithm: null,
    evaluation: null,
  };
  return {
    version: "forecast-objectives-v3",
    symbol,
    horizon,
    stale,
    generatedAt: new Date(now).toISOString(),
    sourceCandleTime: null,
    marketUpdatedAt: null,
    targetTime: null,
    expiresAt: null,
    direction: {
      ...common,
      direction: null,
      probabilities: null,
      calibrated: false,
    },
    volatility: {
      ...common,
      expectedVolatility: null,
      riskCategory: null,
      interval: null,
      units: "horizon_log_return_std",
    },
  };
}
export function createObjectiveReader(
  config: Config,
  now = Date.now,
): ObjectiveReader {
  const load = createSnapshotLoader(
    config.OBJECTIVE_FORECASTS_EXPORT_PATH,
    objectivePublicationSchema,
  );
  return {
    async read(symbol, horizon) {
      if (horizon === "1M")
        return unavailableObjectives(
          symbol,
          horizon,
          now(),
          "monthly_insufficient_independent_outcomes",
        );
      try {
        const publication = await load(),
          clock = now();
        if (
          Date.parse(publication.generatedAt) > clock ||
          clock - Date.parse(publication.generatedAt) > 90000
        )
          return unavailableObjectives(
            symbol,
            horizon,
            clock,
            "objective_publication_expired",
            true,
          );
        const f = structuredClone(
          publication.forecasts.find(
            (f) => f.symbol === symbol && f.horizon === horizon,
          )!,
        );
        if (Date.parse(f.generatedAt) > clock)
          throw Error("Future publication");
        const active = [f.direction, f.volatility].filter(
          (o) => o.status === "validated",
        );
        if (
          active.length &&
          (clock < objectiveConfirmationEndMs ||
            active.some(
              (o) => Date.parse(o.evaluation!.confirmationEnd!) > clock,
            ))
        )
          return unavailableObjectives(
            symbol,
            horizon,
            clock,
            "future_confirmation_required",
          );
        if (
          active.length &&
          (f.stale ||
            Date.parse(f.expiresAt!) <= clock ||
            clock - Date.parse(f.sourceCandleTime!) > 90000)
        )
          return unavailableObjectives(
            symbol,
            horizon,
            clock,
            "objective_input_or_target_expired",
            true,
          );
        return f;
      } catch (error) {
        return unavailableObjectives(
          symbol,
          horizon,
          now(),
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "no_objective_publication"
            : "invalid_objective_publication",
        );
      }
    },
  };
}
