import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { parseConfig } from "../src/config";
import { createAuthService } from "../src/mobile/auth";
import { createMongoRepository } from "../src/mobile/mongo";

// Explicit opt-in, loopback only, and a fresh database owned solely by this suite.
// No arbitrary URI, credentials, production database name or .env files are read.
const port = process.env.MONGO_TEST_PORT;
if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
  throw new Error("MONGO_TEST_PORT must be a loopback test server port.");
const database = "investing_hub_test_" + randomUUID().replaceAll("-", "");
const uri = `mongodb://127.0.0.1:${port || "27017"}/${database}`;

describe.skipIf(!port)("isolated real Mongo account persistence", () => {
  let repo: ReturnType<typeof createMongoRepository> | undefined;
  let cleanup: mongoose.mongo.MongoClient | undefined;
  beforeAll(async () => {
    cleanup = await new mongoose.mongo.MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
      maxPoolSize: 1,
    }).connect();
    repo = createMongoRepository(uri);
    await vi.waitFor(() => expect(repo!.available()).toBe(true), {
      timeout: 10000,
    });
  }, 15000);
  afterAll(async () => {
    await repo?.close();
    try {
      if (cleanup) {
        if (!/^investing_hub_test_[a-f0-9]{32}$/.test(database))
          throw new Error("Unsafe test database cleanup");
        await cleanup.db(database).dropDatabase();
      }
    } finally {
      await cleanup?.close();
    }
  }, 10000);

  it("persists verified accounts, exact trades, settings and revision checks across reconnection with owner isolation", async () => {
    const config = parseConfig({ NODE_ENV: "test" });
    const secret = "test-only-strong-secret-at-least-32-characters";
    const mailer = vi.fn(async (_email: string, _code: string) => {});
    const auth = createAuthService(repo!, secret, mailer);
    const app = createApp(config, undefined, {
      repo: repo!,
      auth,
      notifications: false,
    });
    const input = {
      firstName: "Fixture",
      lastName: "One",
      email: "one@example.test",
      password: "test-only-long-password",
    };
    expect(
      (await request(app).post("/api/auth/register").send(input)).status,
    ).toBe(202);
    expect(await repo!.findUser(input.email)).toBeNull();
    expect(
      (
        await request(app).post("/api/auth/verify").send({
          email: input.email,
          verificationCode: mailer.mock.calls[0][1],
        })
      ).status,
    ).toBe(201);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: input.email, password: input.password });
    expect(login.status).toBe(200);
    const token = `Bearer ${login.body.token}`;
    const owner = login.body.user.id as string;
    const other = await repo!.createUser({
      ...input,
      email: "two@example.test",
      password: (await repo!.findUser(input.email))!.password,
      isVerified: true,
    });
    const created = await request(app)
      .post("/api/portfolios")
      .set("Authorization", token)
      .send({ name: "Fixture portfolio" });
    expect(created.status).toBe(201);
    const id = created.body._id as string;
    const trade = {
      symbol: "BTCUSDT",
      side: "buy",
      quantity: "0.00000001",
      price: "100.12345678",
      fee: "0",
      timestamp: "2024-01-01T00:00:00.000Z",
    };
    expect(
      (
        await request(app)
          .post(`/api/portfolios/${id}/transactions`)
          .set("Authorization", token)
          .send(trade)
      ).status,
    ).toBe(201);
    const settings = await request(app)
      .patch("/api/me/settings")
      .set("Authorization", token)
      .send({ theme: "dark", selectedCoins: ["BTC"] });
    expect(settings.status).toBe(200);
    expect(await repo!.portfolio(other.id, id)).toBeNull();
    expect(await repo!.deletePortfolio(other.id, id)).toBe(false);
    expect(await repo!.portfolios(other.id)).toEqual([]);
    const portfolio = (await repo!.portfolio(owner, id))!;
    const updates = await Promise.allSettled([
      repo!.savePortfolio(owner, { ...portfolio, name: "First revision" }),
      repo!.savePortfolio(owner, { ...portfolio, name: "Second revision" }),
    ]);
    expect(
      updates.filter((update) => update.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      updates.filter((update) => update.status === "rejected"),
    ).toMatchObject([{ reason: { code: "PORTFOLIO_CONFLICT" } }]);
    await repo!.close();
    repo = createMongoRepository(uri);
    await vi.waitFor(() => expect(repo!.available()).toBe(true), {
      timeout: 10000,
    });
    const persisted = (await repo.portfolio(owner, id))!;
    expect(persisted.transactions[0]).toMatchObject(trade);
    expect(persisted.revision).toBe(2);
    expect(await repo.settings(owner)).toMatchObject({
      theme: "dark",
      selectedCoins: ["BTC"],
    });
    expect((await repo.user(owner))!.isVerified).toBe(true);
  }, 20000);
});
