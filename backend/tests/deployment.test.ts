import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { parseConfig } from "../src/config";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("single-service deployment", () => {
  it("serves SPA routes and hashed assets without hiding API or asset errors", async () => {
    const directory = await mkdtemp(join(tmpdir(), "investing-hub-web-"));
    directories.push(directory);
    await mkdir(join(directory, "assets"));
    await writeFile(
      join(directory, "index.html"),
      "<!doctype html><title>Investing Hub</title>",
    );
    await writeFile(
      join(directory, "assets", "app-123.js"),
      "console.log('app')",
    );
    const app = createApp(
      parseConfig({ NODE_ENV: "test", WEB_DIST_PATH: directory }),
    );
    for (const route of ["/", "/predictions", "/portfolio"]) {
      const response = await request(app).get(route);
      expect(response.status).toBe(200);
      expect(response.text).toContain("<title>Investing Hub</title>");
      expect(response.headers["cache-control"]).toBe("no-cache");
      expect(response.headers["content-security-policy"]).toContain(
        "https://fonts.googleapis.com",
      );
    }
    const asset = await request(app).get("/assets/app-123.js");
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await request(app).head("/predictions")).status).toBe(200);
    for (const path of [
      "/api/missing",
      "/api",
      "/assets/missing.js",
      "/missing.js",
      "/.env",
    ]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
    expect((await request(app).get("/api/health")).body.mode).toBe(
      "guest-demo",
    );
    expect((await request(app).get("/api/capabilities")).body.accounts).toBe(
      false,
    );
    expect((await request(app).post("/portfolio")).status).toBe(404);
  });

  it("uses the edge's X-Real-IP and ignores spoofed forwarding chains", async () => {
    const app = createApp(
      parseConfig({ NODE_ENV: "test", TRUST_RAILWAY_PROXY: "true" }),
    );
    for (let index = 0; index < 120; index++) {
      expect(
        (
          await request(app)
            .get("/api/capabilities")
            .set("X-Real-IP", "192.0.2.1")
            .set("X-Forwarded-For", `198.51.100.${index}`)
        ).status,
      ).toBe(200);
    }
    expect(
      (
        await request(app)
          .get("/api/capabilities")
          .set("X-Real-IP", "192.0.2.1")
      ).status,
    ).toBe(429);
    expect(
      (
        await request(app)
          .get("/api/capabilities")
          .set("X-Real-IP", "192.0.2.2")
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/health").set("X-Real-IP", "192.0.2.1"))
        .status,
    ).toBe(200);
  });
});
