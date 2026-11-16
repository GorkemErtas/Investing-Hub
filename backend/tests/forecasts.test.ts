import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import request from "supertest";
import { assets } from "@investing-hub/shared/contracts";
import { forecastHorizonSchema, forecastSchema } from "@investing-hub/shared/forecasts";
import { forecastFixture } from "../../shared/tests/forecasts-fixtures";
import { createForecastReader, unavailableForecast } from "../src/predictions/forecasts";
import { parseConfig } from "../src/config";
import { createApp } from "../src/app";

describe("v2 read-only forecasts", () => {
  it("validates publication, coalesces reads, expires cached forecasts and handles corruption", async () => {
    const dir = await mkdtemp(join(tmpdir(), "forecast-v2-test-"));
    let clock = Math.floor(Date.now()/60000)*60000+1000;
    const path = join(dir, "publication.json");
    const config = parseConfig({ NODE_ENV: "test", FORECASTS_EXPORT_PATH: path });
    const reader = createForecastReader(config, () => clock);
    const generated = clock;
    const publication = { version: "forecast-publication-v2", generatedAt: new Date(clock).toISOString(),
      forecasts: assets.flatMap(a => forecastHorizonSchema.options.map(h => h === "1M" ?
        unavailableForecast(a.symbol, h, clock, "monthly_insufficient_independent_outcomes") : forecastFixture(a.symbol, h, clock))) };
    const save = async () => {
      const payload = JSON.stringify(publication);
      await writeFile(path, JSON.stringify({ payload, sha256: createHash("sha256").update(payload).digest("hex") }));
    };
    try {
      expect((await reader.read("BTCUSDT", "1m")).reason).toBe("no_forecast_publication");
      await save();
      const batch = await Promise.all(assets.map(a => reader.read(a.symbol, "1m")));
      expect(batch.every(f => f.status === "experimental")).toBe(true);
      batch[0].predictedPrice = 999;
      expect((await reader.read("BTCUSDT", "1m")).predictedPrice).toBe(101);
      clock += 60000;
      expect(await reader.read("BTCUSDT", "1m")).toMatchObject({ status: "unavailable", stale: true, predictedPrice: null });
      expect((await reader.read("BTCUSDT", "15m")).status).toBe("experimental");
      clock += 30001;
      expect((await reader.read("BTCUSDT", "15m")).reason).toBe("forecast_publication_expired");
      clock = generated;
      await writeFile(path, "corrupt");
      expect((await reader.read("BTCUSDT", "1m")).reason).toBe("invalid_forecast_publication");
      await save();
      publication.forecasts[0].predictedPrice = 999;
      await save();
      expect((await reader.read("BTCUSDT", "1m")).reason).toBe("invalid_forecast_publication");
      expect(forecastSchema.parse(await reader.read("BTCUSDT", "1M")).reason).toBe("monthly_insufficient_independent_outcomes");
    } finally {
      const absolute = resolve(dir);
      if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith("forecast-v2-test-")) throw Error("Unsafe test cleanup");
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("validates symbols/horizons and preserves public/private API boundaries", async () => {
    const reader = { read: vi.fn(async () => forecastFixture()) };
    const app = createApp(parseConfig({ NODE_ENV: "test" }), undefined, undefined, undefined, reader);
    expect((await request(app).get("/api/v2/forecasts/BTCUSDT?horizon=1m")).status).toBe(200);
    for (const path of ["BAD?horizon=1m", "BTCUSDT?horizon=1H", "BTCUSDT?horizon=1m&extra=1"])
      expect((await request(app).get(`/api/v2/forecasts/${path}`)).status).toBe(400);
    expect((await request(app).get("/api/me")).status).toBe(503);
    expect(reader.read).toHaveBeenCalledTimes(1);
  });
});
