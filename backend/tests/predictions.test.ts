import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat, rm, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import request from "supertest";
import { assets } from "@investing-hub/shared/contracts";
import {
  predictionFixture,
  predictionTestNow,
} from "../../shared/tests/predictions-fixtures";
import { createApp } from "../src/app";
import { parseConfig } from "../src/config";
import { createPredictionReader } from "../src/predictions/service";
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  // Count real file reads; preserve actual disk I/O and metadata for these tests.
  return { ...fs, readFile: vi.fn(fs.readFile) };
});
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const dir of directories.splice(0)) {
    if (!dir.startsWith(resolve(".predictions-test-")))
      throw Error("Unsafe cleanup path");
    await rm(dir, { recursive: true, force: true });
  }
});
async function fixture() {
  const dir = resolve(".predictions-test-" + randomUUID());
  directories.push(dir);
  await mkdir(dir);
  const database = join(dir, "registry.sqlite3"),
    output = join(dir, "predictions.json");
  await writeFile(database, "SYNTHETIC REGISTRY");
  const stamp = await stat(database, { bigint: true });
  const report = {
    version: "price-predictions-v1",
    generatedAt: new Date(predictionTestNow).toISOString(),
    registry: { size: Number(stamp.size), mtimeNs: stamp.mtimeNs.toString() },
    forecasts: assets.map(({ symbol }) => predictionFixture(symbol)),
  };
  async function save() {
    const payload = JSON.stringify(report);
    await writeFile(
      output,
      JSON.stringify({
        payload,
        sha256: createHash("sha256").update(payload).digest("hex"),
      }),
    );
  }
  await save();
  const config = parseConfig({
    NODE_ENV: "test",
    PREDICTIONS_EXPORT_PATH: output,
    ML_DATABASE_PATH: database,
  });
  let now = predictionTestNow;
  const reader = createPredictionReader(config, () => now);
  return {
    dir,
    database,
    output,
    report,
    save,
    config,
    reader,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("read-only local numeric predictions", () => {
  it("coalesces all eight symbols and reuses one validated publication", async () => {
    const f = await fixture();
    const reads = vi.mocked(readFile).mockClear();
    const results = await Promise.all(
      assets.map(({ symbol }) => f.reader.read(symbol)),
    );
    expect(results.every((result) => result.status === "experimental")).toBe(
      true,
    );
    expect(reads).toHaveBeenCalledTimes(1);
    // Returned records must not allow one caller to corrupt the shared publication.
    results[0].predictedValue = 999;
    expect(await f.reader.read("BTCUSDT")).toEqual(predictionFixture());
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it("invalidates cached publications on replacement, corruption and disappearance", async () => {
    const f = await fixture();
    expect((await f.reader.read("BTCUSDT")).status).toBe("experimental");
    f.report.forecasts[0].reason = "Updated publication";
    await f.save();
    expect((await f.reader.read("BTCUSDT")).reason).toBe("Updated publication");
    const replacement = join(f.dir, "replacement.json");
    await writeFile(replacement, await readFile(f.output));
    await rename(replacement, f.output);
    expect((await f.reader.read("BTCUSDT")).reason).toBe("Updated publication");
    await writeFile(f.output, "corrupt");
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "invalid_prediction_publication",
    );
    await f.save();
    expect((await f.reader.read("BTCUSDT")).status).toBe("experimental");
    await rm(f.output);
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "no_prediction_publication",
    );
  });

  it("rechecks registry stamps and UTC expiry on warm cache hits", async () => {
    const f = await fixture();
    expect((await f.reader.read("BTCUSDT")).status).toBe("experimental");
    f.advance(12 * 60 * 60000);
    expect((await f.reader.read("BTCUSDT")).reason).toBe("prediction_expired");
    f.advance(-12 * 60 * 60000);
    await writeFile(f.database, "CHANGED REGISTRY");
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "registry_changed_regenerate_predictions",
    );
  });

  it("has no generative AI dependency or environment settings", async () => {
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(pkg.dependencies).not.toHaveProperty("@google/genai");
    expect(
      Object.keys(parseConfig({})).some((key) =>
        /GEMINI|FUTURE_|ANALYTICS/.test(key),
      ),
    ).toBe(false);
  });
  it("serves every symbol's unchanged numeric forecast without inference, writes or external requests", async () => {
    const f = await fixture(),
      fetch = vi.fn(() => {
        throw Error("No network permitted");
      });
    vi.stubGlobal("fetch", fetch);
    const before = await readFile(f.output, "utf8"),
      app = createApp(f.config, undefined, undefined, f.reader);
    for (const { symbol } of assets) {
      const response = await request(app).get("/api/predictions/" + symbol);
      expect(response.status).toBe(200);
      expect(response.body).toEqual(predictionFixture(symbol));
    }
    expect(await readFile(f.output, "utf8")).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects changed registries, invalid hashes, numeric corruption and missing exports", async () => {
    const f = await fixture();
    f.report.forecasts[0].predictedValue = 999;
    await f.save();
    expect((await f.reader.read("BTCUSDT")).status).toBe("unavailable");
    f.report.forecasts[0] = predictionFixture();
    await f.save();
    await writeFile(f.database, "CHANGED REGISTRY");
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "registry_changed_regenerate_predictions",
    );
    await writeFile(
      f.output,
      JSON.stringify({ payload: "{}", sha256: "0".repeat(64) }),
    );
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "invalid_prediction_publication",
    );
    await rm(f.output);
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "no_prediction_publication",
    );
  });
  it("withholds future publications and expired targets without fabricating prices", async () => {
    const f = await fixture();
    f.report.generatedAt = new Date(predictionTestNow + 1).toISOString();
    await f.save();
    expect((await f.reader.read("BTCUSDT")).predictedValue).toBeNull();
    f.report.generatedAt = new Date(predictionTestNow).toISOString();
    await f.save();
    f.advance(86400000);
    expect((await f.reader.read("BTCUSDT")).status).toBe("unavailable");
  });
  it("removes review/research APIs and request-triggered inference", async () => {
    const f = await fixture(),
      app = createApp(f.config, undefined, undefined, f.reader);
    for (const path of [
      "/api/future-analysis/BTCUSDT",
      "/api/future-analysis/BTCUSDT/review",
      "/api/research/BTCUSDT",
      "/api/analytics/BTCUSDT",
      "/predict/lstm/BTC/1d",
    ]) {
      expect((await request(app).get(path)).status).toBe(404);
      expect(
        (await request(app).post(path).send({ allowPaid: true })).status,
      ).toBe(404);
    }
  });
});
