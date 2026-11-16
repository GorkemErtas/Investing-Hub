import { describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { assets } from "@investing-hub/shared/contracts";
import { forecastHorizonSchema } from "@investing-hub/shared/forecasts";
import {
  objectiveFixture,
  objectiveTestNow,
} from "../../shared/tests/objective-fixtures";
import {
  createObjectiveReader,
  unavailableObjectives,
} from "../src/predictions/objectives";
import { parseConfig } from "../src/config";
import { createApp } from "../src/app";

describe("objective publication API", () => {
  it("isolates objectives, rejects premature confirmation, caches safely and expires results", async () => {
    const dir = await mkdtemp(join(tmpdir(), "objective-api-test-"));
    const path = join(dir, "objectives.json");
    let now = objectiveTestNow;
    const config = parseConfig({
      NODE_ENV: "test",
      OBJECTIVE_FORECASTS_EXPORT_PATH: path,
    });
    const reader = createObjectiveReader(config, () => now);
    const publication = {
      version: "objective-publication-v3",
      generatedAt: new Date(now).toISOString(),
      forecasts: assets.flatMap((a) =>
        forecastHorizonSchema.options.map((h) =>
          h === "1M"
            ? unavailableObjectives(
                a.symbol,
                h,
                now,
                "monthly_insufficient_independent_outcomes",
              )
            : objectiveFixture(a.symbol, h, now),
        ),
      ),
    };
    const save = async () => {
      const payload = JSON.stringify(publication);
      await writeFile(
        path,
        JSON.stringify({
          payload,
          sha256: createHash("sha256").update(payload).digest("hex"),
        }),
      );
    };
    try {
      expect((await reader.read("BTCUSDT", "1m")).direction.reason).toBe(
        "no_objective_publication",
      );
      publication.forecasts[0].volatility = unavailableObjectives(
        "BTCUSDT",
        "1m",
        now,
        "no_volatility_model",
      ).volatility;
      await save();
      const batch = await Promise.all(
        assets.map((a) => reader.read(a.symbol, "1m")),
      );
      expect(batch[0].direction.status).toBe("validated");
      expect(batch[0].volatility.status).toBe("unavailable");
      batch[0].direction.probabilities!.up = 0;
      expect(
        (await reader.read("BTCUSDT", "1m")).direction.probabilities!.up,
      ).toBe(0.65);
      now += 60000;
      expect(
        (await reader.read("BTCUSDT", "1m")).direction.probabilities,
      ).toBeNull();
      expect((await reader.read("BTCUSDT", "15m")).direction.status).toBe(
        "validated",
      );
      now += 31000;
      expect((await reader.read("BTCUSDT", "15m")).stale).toBe(true);
      await writeFile(path, "corrupt");
      expect((await reader.read("BTCUSDT", "1m")).direction.reason).toBe(
        "invalid_objective_publication",
      );
      now = Date.parse("2026-11-16T10:30:01.000Z");
      publication.generatedAt = new Date(now).toISOString();
      publication.forecasts = assets.flatMap((a) =>
        forecastHorizonSchema.options.map((h) =>
          h === "1M"
            ? unavailableObjectives(
                a.symbol,
                h,
                now,
                "monthly_insufficient_independent_outcomes",
              )
            : objectiveFixture(a.symbol, h, now),
        ),
      );
      await save();
      expect((await reader.read("BTCUSDT", "1m")).direction.reason).toBe(
        "future_confirmation_required",
      );
      for (const forecast of publication.forecasts.filter(
        (f) => f.horizon !== "1M",
      )) {
        for (const objective of [forecast.direction, forecast.volatility]) {
          objective.status = "experimental";
          objective.evaluation!.period = "development";
          objective.evaluation!.futureConfirmed = false;
          objective.evaluation!.confirmationEnd = null;
          objective.evaluation!.developmentEligible = false;
          objective.evaluation!.baselineRelativeImprovement = -0.05;
        }
      }
      await save();
      const experimental = await reader.read("BTCUSDT", "1m");
      expect(experimental.direction.status).toBe("experimental");
      expect(
        experimental.direction.evaluation!.baselineRelativeImprovement,
      ).toBe(-0.05);
      now += 60000;
      expect(
        (await reader.read("BTCUSDT", "1m")).direction.probabilities,
      ).toBeNull();
      expect((await reader.read("BTCUSDT", "1M")).direction.reason).toBe(
        "monthly_insufficient_independent_outcomes",
      );
    } finally {
      if (
        dirname(resolve(dir)) !== resolve(tmpdir()) ||
        !basename(dir).startsWith("objective-api-test-")
      )
        throw Error("Unsafe test path");
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("keeps v1/v2 public APIs and private-service boundaries compatible", async () => {
    const objective = { read: vi.fn(async () => objectiveFixture()) };
    const config = parseConfig({ NODE_ENV: "test" });
    const app = createApp(
      config,
      undefined,
      undefined,
      undefined,
      undefined,
      objective,
    );
    expect(
      (await request(app).get("/api/v3/forecasts/BTCUSDT?horizon=1m")).status,
    ).toBe(200);
    for (const path of [
      "BAD?horizon=1m",
      "BTCUSDT?horizon=1H",
      "BTCUSDT?extra=1",
    ])
      expect((await request(app).get(`/api/v3/forecasts/${path}`)).status).toBe(
        400,
      );
    expect((await request(app).get("/api/predictions/BTCUSDT")).status).toBe(
      200,
    );
    expect(
      (await request(app).get("/api/v2/forecasts/BTCUSDT?horizon=15m")).status,
    ).toBe(200);
    expect((await request(app).get("/api/me")).status).toBe(503);
    expect(objective.read).toHaveBeenCalledTimes(1);
  });
});
