import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { assets } from "@investing-hub/shared/contracts";
import {
  experimentalFixture,
  mlFixture,
  reviewFixture,
  testNow,
} from "../../shared/tests/future-fixtures";
import { parseConfig } from "../src/config";
import { createApp } from "../src/app";
import { createExperimentalReader } from "../src/future/experimental-reader";
import { createFutureService } from "../src/future/service";
import { FutureStore } from "../src/future/store";
import { hash } from "../src/future/errors";
import { fingerprint } from "../src/future/review-gate";
import type { ResearchProvider } from "../src/future/provider";

const directories: string[] = [];
async function setup() {
  const directory = resolve(".future-test-experimental-" + randomUUID());
  directories.push(directory);
  await mkdir(directory);
  const config = parseConfig({
    NODE_ENV: "test",
    FUTURE_STORAGE_PATH: join(directory, "accounting"),
    FUTURE_ML_DATABASE_PATH: join(directory, "registry.sqlite3"),
    FUTURE_EXPERIMENTAL_EXPORT_PATH: join(directory, "experimental.json"),
    FUTURE_ML_EXPORT_PATH: join(directory, "approved.json"),
    FUTURE_GEMINI_SEARCH_ENABLED: "true",
    GEMINI_KEY_ROTATED: "true",
    GEMINI_API_KEY: "AQ.TEST_ONLY_EXPERIMENTAL_KEY",
  });
  await writeFile(config.FUTURE_ML_DATABASE_PATH, "SYNTHETIC TEST REGISTRY");
  const registry = await stat(config.FUTURE_ML_DATABASE_PATH, { bigint: true });
  const publication = {
    version: "ml-experimental-v1",
    generatedAt: new Date(testNow).toISOString(),
    registry: {
      size: Number(registry.size),
      mtimeNs: registry.mtimeNs.toString(),
    },
    forecasts: assets.map((asset) => experimentalFixture(asset.symbol)),
  };
  async function publish(value: unknown = publication, checksum?: string) {
    const payload = JSON.stringify(value);
    await writeFile(
      config.FUTURE_EXPERIMENTAL_EXPORT_PATH,
      JSON.stringify({ payload, sha256: checksum ?? hash(payload) }),
    );
  }
  await publish();
  const reader = createExperimentalReader(config, () => testNow);
  return { config, publication, publish, reader };
}
afterEach(async () => {
  for (const path of directories.splice(0)) {
    if (!path.startsWith(resolve(".future-test-experimental-")))
      throw new Error("Invalid cleanup path");
    await rm(path, { recursive: true, force: true });
  }
});

describe("read-only experimental forecasts", () => {
  it("reads all eight losing candidates, preserves numbers and keeps approved mode separate", async () => {
    const f = await setup();
    const service = createFutureService(f.config, { now: () => testNow });
    for (const asset of assets) {
      const result = await service.read(asset.symbol, "experimental");
      expect(result.mode).toBe("experimental");
      expect(result.ml).toEqual(experimentalFixture(asset.symbol));
      expect(result.mlFreshness).toBe("fresh");
      expect(result.research.data).toBeNull();
      expect((await service.read(asset.symbol)).ml.status).toBe("unavailable");
    }
    await expect(stat(f.config.FUTURE_STORAGE_PATH)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
  it("rejects checksums, registry changes, missing files and tampered values", async () => {
    const f = await setup();
    await f.publish(f.publication, "0".repeat(64));
    expect((await f.reader.read("BTCUSDT")).result.reason).toBe(
      "invalid_ml_export",
    );
    const changed = structuredClone(f.publication);
    changed.forecasts[0].data.predictedPrice += 1;
    await f.publish(changed);
    expect((await f.reader.read("BTCUSDT")).result.reason).toBe(
      "invalid_ml_export",
    );
    await f.publish();
    await writeFile(f.config.FUTURE_ML_DATABASE_PATH, "CHANGED TEST REGISTRY");
    expect((await f.reader.read("BTCUSDT")).result.reason).toBe(
      "registry_changed_reexport_required",
    );
    await rm(f.config.FUTURE_EXPERIMENTAL_EXPORT_PATH);
    expect((await f.reader.read("BTCUSDT")).result.reason).toBe(
      "no_experimental_publication",
    );
  });
  it("handles stale snapshots, future export times and expired daily targets", async () => {
    const f = await setup();
    await f.publish({
      ...f.publication,
      generatedAt: new Date(testNow - 7 * 3600000).toISOString(),
    });
    expect((await f.reader.read("BTCUSDT")).freshness).toBe("stale");
    await f.publish({
      ...f.publication,
      generatedAt: new Date(testNow - 25 * 3600000).toISOString(),
    });
    expect((await f.reader.read("BTCUSDT")).result.reason).toBe(
      "ml_export_expired",
    );
    await f.publish({
      ...f.publication,
      generatedAt: new Date(testNow + 1).toISOString(),
    });
    expect((await f.reader.read("BTCUSDT")).result.reason).toBe(
      "ml_export_expired",
    );
    await f.publish();
    const later = createExperimentalReader(f.config, () =>
      Date.parse(f.publication.forecasts[0].data.targetCloseTime),
    );
    expect((await later.read("BTCUSDT")).result.reason).toBe(
      "forecast_expired_or_noncausal",
    );
  });
  it("passes the exact experimental forecast to consented review and never persists grounding", async () => {
    const f = await setup();
    const research = vi.fn<ResearchProvider["research"]>(async (context) => ({
      report: reviewFixture(context.ml, context.fingerprint),
      inputTokens: 100,
      outputTokens: 100,
      usageKnown: true,
    }));
    const service = createFutureService(f.config, {
      provider: { research },
      now: () => testNow,
    });
    const before = await service.read("DOGEUSDT", "experimental");
    expect(research).not.toHaveBeenCalled();
    const result = await service.review(
      "DOGEUSDT",
      randomUUID(),
      "experimental",
    );
    expect(research).toHaveBeenCalledOnce();
    expect(research.mock.calls[0][0].ml).toEqual(before.ml);
    expect(result.ml).toEqual(before.ml);
    expect(result.research.status).toBe("available");
    expect(result.conflict).toBe("CONFLICTING_EVIDENCE");
    expect(
      (await service.read("DOGEUSDT", "experimental")).research.data,
    ).toBeNull();
    const state = new FutureStore(f.config.FUTURE_STORAGE_PATH);
    const saved = JSON.stringify(await state.read());
    expect(saved).not.toContain("TEST FIXTURE");
    expect(saved).not.toContain("publisher.example.com");
    expect(saved).not.toContain(before.ml.data!.modelId);
  });
  it("keeps experimental numbers when Gemini fails and withholds reviews of changed forecasts", async () => {
    const f = await setup();
    let fail = true;
    const research: ResearchProvider["research"] = async (context) => {
      if (fail) throw new Error("PRIVATE PROVIDER TEST RESPONSE");
      await writeFile(
        f.config.FUTURE_ML_DATABASE_PATH,
        "changed during TEST review",
      );
      return {
        report: reviewFixture(context.ml, context.fingerprint),
        inputTokens: 1,
        outputTokens: 1,
        usageKnown: true,
      };
    };
    const service = createFutureService(f.config, {
      provider: { research },
      now: () => testNow,
    });
    const failed = await service.review(
      "BTCUSDT",
      randomUUID(),
      "experimental",
    );
    expect(failed.ml.status).toBe("experimental");
    expect(failed.research.data).toBeNull();
    expect(JSON.stringify(failed)).not.toContain("PRIVATE PROVIDER");
    fail = false;
    const changed = await service.review(
      "ETHUSDT",
      randomUUID(),
      "experimental",
    );
    expect(changed.research.reason).toBe("forecast_changed_during_review");
    expect(changed.research.data).toBeNull();
  });
  it("binds fingerprints to mode even when both sources are unavailable", () => {
    const missing = mlFixture("BTCUSDT", testNow, false);
    expect(fingerprint(missing, "unavailable", "approved")).not.toBe(
      fingerprint(missing, "unavailable", "experimental"),
    );
  });
  it("offers explicit read-only API mode and strict consent, without implicit review calls", async () => {
    const f = await setup();
    const research = vi.fn<ResearchProvider["research"]>(async (context) => ({
      report: reviewFixture(context.ml, context.fingerprint),
      inputTokens: 1,
      outputTokens: 1,
      usageKnown: true,
    }));
    const service = createFutureService(f.config, {
      provider: { research },
      now: () => testNow,
    });
    const app = createApp(f.config, undefined, undefined, service);
    for (const asset of assets) {
      const response = await request(app).get(
        `/api/future-analysis/${asset.symbol}?mode=experimental`,
      );
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body.ml.status).toBe("experimental");
    }
    expect(research).not.toHaveBeenCalled();
    expect(
      (await request(app).get("/api/future-analysis/BTCUSDT?mode=unsafe"))
        .status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/future-analysis/BTCUSDT/review")
          .send({ mode: "experimental", requestId: randomUUID() })
      ).status,
    ).toBe(400);
    const response = await request(app)
      .post("/api/future-analysis/LINKUSDT/review")
      .send({ mode: "experimental", allowPaid: true, requestId: randomUUID() });
    expect(response.body.mode).toBe("experimental");
    expect(response.body.ml.status).toBe("experimental");
    expect(research).toHaveBeenCalledOnce();
    expect(await readFile(f.config.FUTURE_ML_DATABASE_PATH, "utf8")).toBe(
      "SYNTHETIC TEST REGISTRY",
    );
  });
});
