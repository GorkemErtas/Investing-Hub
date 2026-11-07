import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile, stat, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { assets } from "@investing-hub/shared/contracts";
import {
  analyticsFixture,
  analyticsResponseFixture,
} from "../../shared/tests/analytics-fixtures";
import { createApp } from "../src/app";
import { parseConfig } from "../src/config";
import {
  createAnalyticsReader,
  localAddress,
  localHost,
} from "../src/analytics/reader";
import { hash } from "../src/future/errors";
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    if (!dir.startsWith(resolve(".analytics-test-")))
      throw Error("Unsafe fixture path");
    await rm(dir, { recursive: true, force: true });
  }
});
async function fixture() {
  const directory = resolve(".analytics-test-" + randomUUID());
  dirs.push(directory);
  await mkdir(directory);
  const db = join(directory, "registry.sqlite3"),
    output = join(directory, "report.json");
  await writeFile(db, "TEST REGISTRY");
  const stamp = await stat(db, { bigint: true }),
    report = analyticsFixture();
  report.provenance.registry = {
    size: Number(stamp.size),
    mtimeNs: stamp.mtimeNs.toString(),
  };
  const save = async () => {
    const payload = JSON.stringify(report);
    await writeFile(output, JSON.stringify({ payload, sha256: hash(payload) }));
  };
  await save();
  const config = parseConfig({
    NODE_ENV: "test",
    ANALYTICS_LAB_ENABLED: "true",
    ANALYTICS_EXPORT_PATH: output,
    FUTURE_ML_DATABASE_PATH: db,
  });
  return {
    config,
    db,
    output,
    report,
    save,
    reader: createAnalyticsReader(config),
  };
}
describe("local read-only analytics", () => {
  it.each(assets)(
    "reads $symbol without mutation or process execution",
    async (asset) => {
      const f = await fixture(),
        before = await readFile(f.output, "utf8");
      const result = await f.reader.read(asset.symbol);
      expect(result.status).toBe("available");
      expect(result.report?.asset.symbol).toBe(asset.symbol);
      expect(await readFile(f.output, "utf8")).toBe(before);
    },
  );
  it("fails closed for disabled/production even with an explicit enable flag", async () => {
    const f = await fixture();
    expect(
      (
        await createAnalyticsReader({
          ...f.config,
          NODE_ENV: "production",
        }).read("BTCUSDT")
      ).status,
    ).toBe("disabled");
    expect(
      (
        await createAnalyticsReader({
          ...f.config,
          ANALYTICS_LAB_ENABLED: "false",
        }).read("BTCUSDT")
      ).status,
    ).toBe("disabled");
  });
  it("validates checksums, semantic metrics, registry changes, freshness and expiry", async () => {
    const f = await fixture();
    const now = Date.parse(f.report.generatedAt);
    expect(
      (
        await createAnalyticsReader(f.config, () => now + 2 * 86400000).read(
          "BTCUSDT",
        )
      ).status,
    ).toBe("stale");
    expect(
      (
        await createAnalyticsReader(f.config, () => now + 8 * 86400000).read(
          "BTCUSDT",
        )
      ).reason,
    ).toBe("analytics_export_expired");
    f.report.assets[0].classifiers[0].metrics!.accuracy = 0.99;
    await f.save();
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "invalid_analytics_export",
    );
    f.report.assets[0].classifiers[0].metrics!.accuracy = 0.5;
    await f.save();
    await writeFile(f.db, "CHANGED REGISTRY");
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "analytics_registry_changed",
    );
    await writeFile(f.output, "{}");
    expect((await f.reader.read("BTCUSDT")).reason).toBe(
      "invalid_analytics_export",
    );
    await rm(f.output);
    expect((await f.reader.read("BTCUSDT")).reason).toBe("no_analytics_export");
  });
  it("rejects public host aliases and never accepts forwarding headers as local identity", async () => {
    const f = await fixture(),
      read = vi.fn(async () => analyticsResponseFixture());
    const app = createApp(f.config, undefined, undefined, undefined, { read });
    expect(
      (
        await request(app)
          .get("/api/analytics/BTCUSDT")
          .set("Host", "public.example.com")
          .set("X-Forwarded-For", "127.0.0.1")
      ).body.status,
    ).toBe("disabled");
    expect(read).not.toHaveBeenCalled();
    expect(localAddress("203.0.113.1")).toBe(false);
    expect(localHost("localhost.evil.example")).toBe(false);
    expect((await request(app).get("/api/analytics/BTCUSDT")).status).toBe(200);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("rejects unknown symbols/queries/POST and preserves normal Future Analysis independently", async () => {
    const f = await fixture(),
      app = createApp(f.config, undefined, undefined, undefined, f.reader);
    expect((await request(app).get("/api/analytics/BTC")).status).toBe(400);
    expect(
      (await request(app).get("/api/analytics/BTCUSDT?train=true")).status,
    ).toBe(400);
    expect((await request(app).post("/api/analytics/BTCUSDT")).status).toBe(
      404,
    );
    const good = await request(app).get("/api/analytics/BTCUSDT");
    expect(good.headers["cache-control"]).toBe("private, no-store");
    expect(
      (await request(app).get("/api/future-analysis/BTCUSDT")).body.research
        .status,
    ).toBe("disabled");
  });
});
