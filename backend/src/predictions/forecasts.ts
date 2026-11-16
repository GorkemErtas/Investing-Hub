import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import type { BigIntStats } from "node:fs";
import type { Symbol } from "@investing-hub/shared/contracts";
import { forecastPublicationSchema, type Forecast, type ForecastHorizon } from "@investing-hub/shared/forecasts";
import type { Config } from "../config.js";

export interface ForecastReader { read(symbol: Symbol, horizon: ForecastHorizon): Promise<Forecast> }
export function unavailableForecast(symbol: Symbol, horizon: ForecastHorizon, now: number, reason: string, stale = false): Forecast {
  return { version: "forecast-v2", symbol, horizon, status: "unavailable", reason, stale,
    referencePrice: null, predictedPrice: null, predictedLogReturn: null, marketUpdatedAt: null,
    sourceCandleTime: null, generatedAt: new Date(now).toISOString(), targetTime: null,
    modelVersion: null, algorithm: null, featureSchema: null, datasetFingerprint: null, evaluationMetrics: null };
}
export function createForecastReader(config: Config, now = Date.now): ForecastReader {
  type Publication = ReturnType<typeof forecastPublicationSchema.parse>;
  const signature = (s: BigIntStats) => [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(":");
  let cached: { key: string; value: Publication } | undefined;
  let pending: { key: string; value: Promise<Publication> } | undefined;
  async function load(key: string) {
    if (cached?.key === key) return cached.value;
    if (pending?.key === key) return pending.value;
    const value = (async () => {
      const handle = await open(config.FORECASTS_EXPORT_PATH, "r");
      try {
        const info = await handle.stat({ bigint: true });
        if (info.size > 2n*1024n*1024n || signature(info) !== key) throw Error("Publication changed");
        const bytes = Buffer.alloc(Number(info.size)+1);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        if (bytesRead !== Number(info.size)) throw Error("Unstable publication");
        const envelope = JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
        if (typeof envelope.payload !== "string" || createHash("sha256").update(envelope.payload).digest("hex") !== envelope.sha256)
          throw Error("Invalid checksum");
        const result = forecastPublicationSchema.parse(JSON.parse(envelope.payload));
        if (signature(await stat(config.FORECASTS_EXPORT_PATH, { bigint: true })) !== key) throw Error("Publication replaced");
        return result;
      } finally { await handle.close(); }
    })();
    pending = { key, value };
    try { const result = await value; if (pending?.value === value) cached = { key, value: result }; return result; }
    finally { if (pending?.value === value) pending = undefined; }
  }
  return { async read(symbol, horizon) {
    if (horizon === "1M") return unavailableForecast(symbol, horizon, now(), "monthly_insufficient_independent_outcomes");
    try {
      const info = await stat(config.FORECASTS_EXPORT_PATH, { bigint: true });
      if (info.size > 2n*1024n*1024n) throw Error("Oversized publication");
      const publication = await load(signature(info));
      const clock = now(), generated = Date.parse(publication.generatedAt);
      if (generated > clock || clock-generated > 90000)
        return unavailableForecast(symbol, horizon, clock, "forecast_publication_expired", true);
      const f = publication.forecasts.find(f => f.symbol === symbol && f.horizon === horizon)!;
      if (Date.parse(f.generatedAt) > clock) throw Error("Future generation");
      if (f.status === "experimental" && (Date.parse(f.targetTime!) <= clock || clock-Date.parse(f.sourceCandleTime!) > 90000))
        return unavailableForecast(symbol, horizon, clock, "forecast_or_input_expired", true);
      return structuredClone(f);
    } catch (error) {
      return unavailableForecast(symbol, horizon, now(), (error as NodeJS.ErrnoException).code === "ENOENT" ? "no_forecast_publication" : "invalid_forecast_publication");
    }
  } };
}
