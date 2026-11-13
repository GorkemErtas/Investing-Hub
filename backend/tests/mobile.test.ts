import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app";
import { parseConfig } from "../src/config";
import { createAuthService } from "../src/mobile/auth";
import type { Account, MobileRepository } from "../src/mobile/repository";
import type { MarketService } from "../src/market/service";
import { AppError } from "../src/errors";
import { createPortfolioService } from "../src/mobile/portfolios";
import {
  settingsSchema,
  type SavedPortfolio,
} from "@investing-hub/shared/mobile";

const owner = "111111111111111111111111",
  other = "222222222222222222222222",
  id = "333333333333333333333333";
const secret = "test-only-strong-secret-at-least-32-characters";
const config = parseConfig({ NODE_ENV: "test" });
const market = {
  markets: vi.fn(async () => ({ data: [], meta: {} })),
  candles: vi.fn(),
} as unknown as MarketService;
const bearer = (subject = owner) =>
  `Bearer ${jwt.sign({}, secret, { subject, issuer: "investing-hub", audience: "investing-hub-mobile", expiresIn: "1h" })}`;
const user: Account = {
  id: owner,
  firstName: "Test",
  lastName: "Owner",
  email: "owner@example.com",
  password: await bcrypt.hash("long-test-password", 4),
  isVerified: true,
};
function fixture() {
  let portfolio: SavedPortfolio = {
    _id: id,
    name: "Private",
    transactions: [],
    revision: 0,
  };
  const repo: MobileRepository = {
    available: () => true,
    findUser: vi.fn(async (email) => (email === user.email ? user : null)),
    user: vi.fn(async (subject) => ({ ...user, id: subject })),
    createUser: vi.fn(async (input) => ({ ...input, id: owner })),
    portfolios: vi.fn(async (subject) =>
      subject === owner ? [structuredClone(portfolio)] : [],
    ),
    portfolio: vi.fn(async (subject, key) =>
      subject === owner && key === id ? structuredClone(portfolio) : null,
    ),
    createPortfolio: vi.fn(async (_subject, metadata) => ({
      ...portfolio,
      ...metadata,
    })),
    savePortfolio: vi.fn(async (subject, value) => {
      if (subject !== owner || value.revision !== portfolio.revision)
        throw new AppError(409, "PORTFOLIO_CONFLICT", "Reload.");
      portfolio = { ...value, revision: value.revision + 1 };
      return portfolio;
    }),
    deletePortfolio: vi.fn(
      async (subject, key) => subject === owner && key === id,
    ),
    settings: vi.fn(async () => settingsSchema.parse({})),
    saveSettings: vi.fn(async (_subject, patch) => settingsSchema.parse(patch)),
    pushToken: vi.fn(async () => {}),
    alertRecipients: vi.fn(async () => []),
    claimAlert: vi.fn(async () => true),
    restoreAlert: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const mailer = vi.fn(async (_email: string, _code: string) => {});
  const auth = createAuthService(repo, secret, mailer);
  return {
    repo,
    auth,
    mailer,
    app: createApp(config, market, { repo, auth, notifications: false }),
  };
}
const buy = {
  symbol: "BTCUSDT",
  side: "buy",
  quantity: "2",
  price: "100",
  fee: "2",
  timestamp: "2024-01-01T00:00:00.000Z",
};
describe("optional authenticated mobile API", () => {
  it("keeps auth limits per client behind Railway and ignores spoofed forwarding chains", async () => {
    const { repo, auth } = fixture();
    const app = createApp(
      parseConfig({ NODE_ENV: "test", TRUST_RAILWAY_PROXY: "true" }),
      market,
      { repo, auth, notifications: false },
    );
    for (let index = 0; index < 15; index++) {
      expect(
        (
          await request(app)
            .post("/api/auth/login")
            .set("X-Real-IP", "192.0.2.1")
            .set("X-Forwarded-For", `198.51.100.${index}`)
            .send({})
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("X-Real-IP", "192.0.2.1")
          .send({})
      ).status,
    ).toBe(429);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("X-Real-IP", "192.0.2.2")
          .send({})
      ).status,
    ).toBe(400);
  });
  it("rejects one of two concurrent sales against the same ledger revision", async () => {
    const { repo } = fixture();
    const service = createPortfolioService(repo);
    await service.trade(owner, id, "add", buy);
    const sale = {
      ...buy,
      side: "sell" as const,
      quantity: "1.5",
      timestamp: "2024-01-02T00:00:00.000Z",
    };
    const results = await Promise.allSettled([
      service.trade(owner, id, "add", sale),
      service.trade(owner, id, "add", sale),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toMatchObject([{ reason: { code: "PORTFOLIO_CONFLICT" } }]);
    expect((await repo.portfolio(owner, id))?.transactions).toHaveLength(2);
  });
  it("keeps public data available when account services are disabled or offline", async () => {
    const guest = createApp(config, market);
    expect((await request(guest).get("/api/markets")).status).toBe(200);
    expect((await request(guest).get("/api/portfolios")).status).toBe(503);
    const { app, repo } = fixture();
    repo.available = () => false;
    expect((await request(app).get("/api/markets")).status).toBe(200);
    expect(
      (await request(app).get("/api/portfolios").set("Authorization", bearer()))
        .status,
    ).toBe(503);
    expect((await request(app).get("/api/capabilities")).body.accounts).toBe(
      false,
    );
  });
  it.each([
    "/api/me",
    "/api/me/settings",
    "/api/portfolios",
    `/api/portfolios/${id}`,
  ])("requires bearer authentication for %s", async (path) => {
    expect((await request(fixture().app).get(path)).status).toBe(401);
  });
  it("rejects expired, wrong audience, wrong algorithm and fallback-secret tokens", async () => {
    const { app } = fixture();
    for (const token of [
      jwt.sign({ sub: owner }, "secretkey"),
      jwt.sign({}, secret, {
        subject: owner,
        audience: "other",
        issuer: "investing-hub",
      }),
      jwt.sign({}, secret, {
        subject: owner,
        audience: "investing-hub-mobile",
        issuer: "investing-hub",
        expiresIn: -1,
      }),
      jwt.sign({}, secret, { algorithm: "HS384", subject: owner }),
    ])
      expect(
        (
          await request(app)
            .get("/api/me")
            .set("Authorization", `Bearer ${token}`)
        ).status,
      ).toBe(401);
  });
  it("logs in an existing bcrypt user and exposes only public profile fields", async () => {
    const { app } = fixture();
    const result = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "long-test-password" });
    expect(result.status).toBe(200);
    expect(result.body.user).not.toHaveProperty("password");
    const profile = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${result.body.token}`);
    expect(profile.body).toEqual({
      id: owner,
      firstName: "Test",
      lastName: "Owner",
      email: user.email,
    });
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: user.email, password: "wrong" })
      ).status,
    ).toBe(401);
  });
  it("rejects client user IDs and scopes create/settings/push operations to identity", async () => {
    const { app, repo } = fixture();
    expect(
      (
        await request(app)
          .get(`/api/portfolios?userId=${other}`)
          .set("Authorization", bearer())
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/portfolios")
          .set("Authorization", bearer())
          .send({ name: "Mine", userId: other })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/portfolios")
          .set("Authorization", bearer())
          .send({ name: "Mine" })
      ).status,
    ).toBe(201);
    expect(repo.createPortfolio).toHaveBeenCalledWith(owner, { name: "Mine" });
    await request(app)
      .patch("/api/me/settings")
      .set("Authorization", bearer())
      .send({ theme: "dark", alertThreshold: 15 });
    expect(repo.saveSettings).toHaveBeenCalledWith(owner, {
      theme: "dark",
      alertThreshold: 15,
    });
    expect(
      (
        await request(app)
          .patch("/api/me/settings")
          .set("Authorization", bearer())
          .send({ priceAlerts: { BTC: { min: 1, max: 10 } } })
      ).status,
    ).toBe(503);
    await request(app)
      .delete("/api/me/push-token")
      .set("Authorization", bearer());
    expect(repo.pushToken).toHaveBeenCalledWith(owner, "");
  });
  it("isolates ownership for every portfolio operation", async () => {
    const { app, repo } = fixture();
    const auth = bearer(other);
    expect(
      (await request(app).get("/api/portfolios").set("Authorization", auth))
        .body,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .get(`/api/portfolios/${id}`)
          .set("Authorization", auth)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(`/api/portfolios/${id}`)
          .set("Authorization", auth)
          .send({ name: "Stolen" })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/portfolios/${id}`)
          .set("Authorization", auth)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/portfolios/${id}/transactions`)
          .set("Authorization", auth)
          .send(buy)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(`/api/portfolios/${id}/transactions/${id}`)
          .set("Authorization", auth)
          .send(buy)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/portfolios/${id}/transactions/${id}`)
          .set("Authorization", auth)
      ).status,
    ).toBe(404);
    expect(repo.savePortfolio).not.toHaveBeenCalled();
  });
  it("replays fees, backdated sales, edits and deletions, and keeps decimal strings", async () => {
    const { app } = fixture();
    const authorization = bearer();
    const path = `/api/portfolios/${id}/transactions`;
    const added = await request(app)
      .post(path)
      .set("Authorization", authorization)
      .send(buy);
    expect(added.status).toBe(201);
    expect(added.body.transactions[0].quantity).toBe("2");
    expect(
      (
        await request(app)
          .post(path)
          .set("Authorization", authorization)
          .send({ ...buy, side: "sell", quantity: "3" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(path)
          .set("Authorization", authorization)
          .send({
            ...buy,
            side: "sell",
            quantity: "1",
            timestamp: "2023-01-01T00:00:00.000Z",
          })
      ).status,
    ).toBe(400);
    const sold = await request(app)
      .post(path)
      .set("Authorization", authorization)
      .send({
        ...buy,
        side: "sell",
        quantity: "1",
        timestamp: "2024-01-02T00:00:00.000Z",
      });
    expect(sold.status).toBe(201);
    const buyId = added.body.transactions[0].id;
    expect(
      (
        await request(app)
          .delete(`${path}/${buyId}`)
          .set("Authorization", authorization)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .put(`${path}/${buyId}`)
          .set("Authorization", authorization)
          .send({ ...buy, quantity: "0.5" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(path)
          .set("Authorization", authorization)
          .send({ ...buy, timestamp: "2999-01-01T00:00:00.000Z" })
      ).status,
    ).toBe(400);
  });
  it("limits verification attempts, expires codes and consumes a successful code once", async () => {
    const { repo, mailer } = fixture();
    let now = 1000;
    const auth = createAuthService(repo, secret, mailer, () => now);
    const input = {
      firstName: "New",
      lastName: "User",
      email: "new@example.com",
      password: "long-new-password",
    };
    await auth.register(input);
    const code = mailer.mock.calls[0][1];
    expect(code).toMatch(/^\d{6}$/);
    for (let i = 0; i < 5; i++)
      await expect(auth.verify(input.email, "000000")).rejects.toMatchObject({
        code: "INVALID_VERIFICATION",
      });
    await expect(auth.verify(input.email, code)).rejects.toThrow();
    now += 600001;
    await auth.register(input);
    await auth.verify(input.email, mailer.mock.calls[1][1]);
    expect(repo.createUser).toHaveBeenCalledTimes(1);
    await expect(
      auth.verify(input.email, mailer.mock.calls[1][1]),
    ).rejects.toThrow();
    now += 600001;
    await auth.register(input);
    now += 600001;
    await expect(
      auth.verify(input.email, mailer.mock.calls[2][1]),
    ).rejects.toThrow();
  });
  it("sanitizes malformed and oversized request bodies and private database errors", async () => {
    const { app, repo } = fixture();
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .set("Content-Type", "application/json")
          .send("{bad")
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ junk: "a".repeat(40000) })
      ).status,
    ).toBe(413);
    repo.portfolios = async () => {
      throw new Error("mongodb://sensitive");
    };
    const result = await request(app)
      .get("/api/portfolios")
      .set("Authorization", bearer());
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("sensitive");
  });
});
