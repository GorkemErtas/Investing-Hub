import { readFile, stat } from "node:fs/promises";
import {
  analyticsReportSchema,
  analyticsResponseSchema,
  type AnalyticsResponse,
} from "@investing-hub/shared/analytics";
import type { Symbol } from "@investing-hub/shared/contracts";
import type { Config } from "../config.js";
import { hash } from "../future/errors.js";

export interface AnalyticsReader {
  read(symbol: Symbol): Promise<AnalyticsResponse>;
}
export const localHost = (host: string) =>
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
export const localAddress = (address: string | undefined) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "");
export function createAnalyticsReader(
  config: Config,
  now = Date.now,
): AnalyticsReader {
  return {
    async read(symbol) {
      const unavailable = (
        reason: string,
        status: "disabled" | "unavailable" = "unavailable",
      ): AnalyticsResponse => ({ symbol, status, reason, report: null });
      if (
        config.NODE_ENV === "production" ||
        config.ANALYTICS_LAB_ENABLED !== "true"
      )
        return unavailable("local_analytics_disabled", "disabled");
      try {
        const info = await stat(config.ANALYTICS_EXPORT_PATH);
        if (info.size > 6 * 1024 * 1024)
          return unavailable("invalid_analytics_export");
        const before = await stat(config.FUTURE_ML_DATABASE_PATH, {
          bigint: true,
        });
        const envelope = JSON.parse(
          await readFile(config.ANALYTICS_EXPORT_PATH, "utf8"),
        );
        if (
          typeof envelope.payload !== "string" ||
          hash(envelope.payload) !== envelope.sha256
        )
          return unavailable("invalid_analytics_export");
        const report = analyticsReportSchema.parse(
          JSON.parse(envelope.payload),
        );
        const after = await stat(config.FUTURE_ML_DATABASE_PATH, {
          bigint: true,
        });
        if (
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          report.provenance.registry.size !== Number(after.size) ||
          report.provenance.registry.mtimeNs !== after.mtimeNs.toString()
        )
          return unavailable("analytics_registry_changed");
        const age = now() - Date.parse(report.generatedAt);
        if (age < 0 || age > 7 * 86400000)
          return unavailable("analytics_export_expired");
        const { assets, ...metadata } = report;
        const asset = assets.find((a) => a.symbol === symbol)!;
        return analyticsResponseSchema.parse({
          symbol,
          status:
            age > 86400000 || asset.dataset?.freshness === "stale"
              ? "stale"
              : "available",
          reason: null,
          report: { ...metadata, asset },
        });
      } catch (error) {
        return unavailable(
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "no_analytics_export"
            : "invalid_analytics_export",
        );
      }
    },
  };
}
