import { GoogleGenAI } from "@google/genai";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsEvidence } from "@investing-hub/shared/news";
import { parseConfig } from "../src/config.js";
import { createGeminiProvider, providerFailure } from "../src/news/provider.js";
import { main } from "../src/news/cli.js";
import { snapshots } from "../src/news/analysis.js";
import { createNewsService } from "../src/news/service.js";
import { NewsStore, emptyState } from "../src/news/store.js";
import { hash } from "../src/news/types.js";

// Synthetic credentials/evidence and stubbed HTTP only. No live model/source
// requests are allowed, even when the invoking shell has a real private key.
const key = `AQ.${"synthetic-test-key-".repeat(3)}`;
const privateMarker = "SYNTHETIC_PRIVATE_RESPONSE_PROMPT_HEADER";
const title = "TEST FIXTURE Bitcoin ETF source headline";
const evidence = (now = Date.now()): NewsEvidence => ({
  id: "a".repeat(32),
  title,
  sourceUrl: "https://publisher.example.com/test-fixture",
  providerUrl: "https://www.gdeltproject.org/",
  provider: "gdelt",
  sourceName: "TEST FIXTURE",
  publisherDomain: "publisher.example.com",
  language: "English",
  publishedAt: null,
  indexedAt: new Date(now - 3600000).toISOString(),
  observedAt: new Date(now).toISOString(),
  contentLevel: "headline_only",
  reliability: "news_index",
  category: "etf",
  scope: "coin_specific",
  symbols: ["BTCUSDT"],
  sourceResponseSha256: "b".repeat(64),
});
const validBody = () => ({
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          {
            text: JSON.stringify({
              analyses: [
                {
                  evidenceId: "a".repeat(32),
                  relevant: true,
                  symbols: ["BTCUSDT"],
                  scope: "coin_specific",
                  category: "etf",
                  sentiment: "neutral",
                  potentialImpact: "low",
                  uncertainty: "high",
                  reportType: "reported",
                  supportingQuote: title,
                },
              ],
            }),
          },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
});
const httpResponse = (status: number) =>
  new Response(
    JSON.stringify(
      status === 200
        ? validBody()
        : {
            error: {
              code: status,
              message: `${privateMarker} ${key}`,
              status: "SYNTHETIC_ERROR",
            },
          },
    ),
    {
      status,
      headers: {
        "content-type": "application/json",
        "x-private-test": privateMarker,
      },
    },
  );
const config = (path = "unused-gemini-test", extra: NodeJS.ProcessEnv = {}) =>
  parseConfig({
    NODE_ENV: "test",
    NEWS_STORAGE_PATH: path,
    NEWS_INTELLIGENCE_ENABLED: "true",
    NEWS_AI_ANALYSIS_ENABLED: "true",
    GEMINI_API_KEY: key,
    GEMINI_KEY_ROTATED: "true",
    ...extra,
  });

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => {
      throw new Error("UNEXPECTED_NETWORK_TEST_FAILURE");
    }),
  );
  for (const name of [
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_GENAI_API_VERSION",
    "GOOGLE_GEMINI_BASE_URL",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("GOOGLE_GENAI_USE_VERTEXAI", "false");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Gemini credential syntax", () => {
  it.each([
    key,
    `AQ.${"x".repeat(50)}`,
    `AQ.${"x".repeat(500)}`,
    `AIza${"x".repeat(35)}`,
    "legacy-synthetic-private-key",
  ])("accepts a supported synthetic key format (#%#)", (value) => {
    expect(config("unused", { GEMINI_API_KEY: value }).GEMINI_API_KEY).toBe(
      value,
    );
  });
  it.each([
    "short",
    `AQ.${"x".repeat(2048)}`,
    `AQ.${"x".repeat(30)}\n`,
    `AQ.${"x".repeat(30)} key`,
    `"${key}"`,
    `AQ.${"x".repeat(30)}?key=x`,
  ])("rejects unsafe or malformed key syntax (#%#)", (value) => {
    expect(() => config("unused", { GEMINI_API_KEY: value })).toThrow();
  });
  it("still allows keyless collection with an empty optional key", () => {
    expect(
      config("unused", { GEMINI_API_KEY: "" }).GEMINI_API_KEY,
    ).toBeUndefined();
  });
});

describe("actual pinned SDK request serialization, without network", () => {
  it("sanitizes an SDK failure before an HTTP request exists", async () => {
    const call = vi.fn(async () => {
      throw new TypeError(privateMarker);
    });
    await expect(
      createGeminiProvider(config(), call).analyze(
        [evidence()],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER",
      details: { category: "sdk_error", elapsedMs: expect.any(Number) },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reproduces the installed SDK v1 default when no API version is specified", async () => {
    const transport = vi.fn<typeof fetch>(async () => httpResponse(200));
    await new GoogleGenAI({
      apiKey: key,
      vertexai: false,
      httpOptions: { fetch: transport, retryOptions: { attempts: 1 } },
    }).models.generateContent({
      model: config().GEMINI_MODEL,
      contents: "TEST FIXTURE",
    });
    expect(new URL(String(transport.mock.calls[0][0])).pathname).toBe(
      `/v1/models/${config().GEMINI_MODEL}:generateContent`,
    );
  });
  it("pins the official Developer API/version, passes AQ. unchanged and sends a supported JSON schema", async () => {
    vi.stubEnv("GOOGLE_GENAI_API_VERSION", "v1");
    vi.stubEnv("GOOGLE_GEMINI_BASE_URL", "https://untrusted.example.com");
    vi.stubEnv("GOOGLE_GENAI_USE_VERTEXAI", "true");
    const transport = vi
      .mocked(fetch)
      .mockImplementation(async () => httpResponse(200));
    const provider = createGeminiProvider(config());
    expect(transport).not.toHaveBeenCalled();
    const result = await provider.analyze(
      [evidence()],
      new AbortController().signal,
    );
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${config().GEMINI_MODEL}:generateContent`,
    );
    expect(new Headers(init!.headers).get("x-goog-api-key")).toBe(key);
    expect(new URL(String(url)).search).toBe("");
    const body = JSON.parse(init!.body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    const wireSchema = body.generationConfig.responseJsonSchema;
    expect(wireSchema.properties.analyses.maxItems).toBe(16);
    expect(wireSchema.properties.analyses.items.additionalProperties).toBe(
      false,
    );
    expect(
      wireSchema.properties.analyses.items.properties.sentiment.enum,
    ).toContain("unknown");
    expect(JSON.stringify(wireSchema)).not.toMatch(
      /\$schema|minLength|maxLength|pattern/,
    );
    expect(body).not.toHaveProperty("tools");
    expect(body.generationConfig).not.toHaveProperty("responseSchema");
    expect(result.newsDiagnostic).toMatchObject({
      httpStatus: 200,
      category: "success",
      elapsedMs: expect.any(Number),
    });
  });
  it.each([400, 503])(
    "reports HTTP %i even when an error response is not parseable JSON",
    async (status) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("invalid JSON", {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
      await expect(
        createGeminiProvider(config()).analyze(
          [evidence()],
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        code: "PROVIDER",
        details: {
          httpStatus: status,
          category: status === 400 ? "bad_request" : "server_error",
          elapsedMs: expect.any(Number),
        },
      });
    },
  );
  it.each([
    [new Error(privateMarker), "sdk_error"],
    [
      new TypeError(privateMarker, { cause: { code: "ECONNRESET" } }),
      "network_error",
    ],
    [new DOMException(privateMarker, "TimeoutError"), "timeout"],
  ] as const)(
    "sanitizes SDK, transport and timeout failures (#%#)",
    async (error, category) => {
      vi.mocked(fetch).mockRejectedValue(error);
      const failure = await createGeminiProvider(config())
        .analyze([evidence()], new AbortController().signal)
        .catch((value) => value);
      expect(failure.details).toMatchObject({
        category,
        elapsedMs: expect.any(Number),
      });
      expect(JSON.stringify(failure)).not.toContain(privateMarker);
      expect(failure.message).not.toContain(privateMarker);
    },
  );
  it("does not interpret arbitrary error text or string statuses as safe diagnostics", () => {
    const failure = providerFailure({
      status: `401 ${privateMarker}`,
      message: privateMarker,
      headers: { authorization: key },
    });
    expect(failure.details).toEqual({
      httpStatus: undefined,
      category: "sdk_error",
    });
  });
});

describe("durable analysis diagnostics, fallback and CLI redaction", () => {
  let directory: string, store: NewsStore;
  beforeEach(async () => {
    const root = resolve(".news-data/tests");
    await mkdir(root, { recursive: true });
    directory = await mkdtemp(join(root, "gemini-"));
    store = new NewsStore(directory);
    const now = Date.now(),
      state = emptyState();
    state.collection = {
      generatedAt: new Date(now).toISOString(),
      lastCheckedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 21600000).toISOString(),
      evidence: [evidence(now)],
      coverage: [],
      attribution: [],
    };
    state.snapshots = snapshots(state.collection, "not_analyzed");
    await store.write(state);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it.each([
    [400, "bad_request", 1],
    [401, "unauthenticated", 1],
    [403, "permission_denied", 1],
    [404, "not_found", 1],
    [429, "rate_limited", 1],
    [500, "server_error", 3],
    [502, "server_error", 3],
    [503, "server_error", 3],
  ] as const)(
    "preserves cache/budgets and emits only safe diagnostics for HTTP %i",
    async (status, category, attempts) => {
      const transport = vi
        .mocked(fetch)
        .mockImplementation(async () => httpResponse(status));
      const before = await store.read();
      const news = createNewsService(config(directory), {
        store,
        pause: async () => {},
      });
      const failure = await news.analyze().catch((value) => value);
      expect(failure.details).toMatchObject({
        httpStatus: status,
        category,
        elapsedMs: expect.any(Number),
      });
      expect(transport).toHaveBeenCalledTimes(attempts);
      const state = await store.read();
      expect(state.collection).toEqual(before.collection);
      expect(state.snapshots).toEqual(before.snapshots);
      expect(state.usage).toMatchObject({
        requests: attempts,
        sourceRequests: 0,
        unknownCostRequests: attempts,
      });
      expect(state.lastGeminiAttempt).toMatchObject({
        httpStatus: status,
        category,
        elapsedMs: expect.any(Number),
      });
      expect((await news.status()).lastGeminiAttempt).toEqual(
        state.lastGeminiAttempt,
      );
      expect((await news.read("BTCUSDT")).data!.events[0].sentiment).toBe(
        "unknown",
      );
      const bytes = await readFile(join(directory, "state.json"), "utf8");
      expect(bytes).not.toContain(key);
      expect(bytes).not.toContain(privateMarker);
      if (status === 429) {
        expect(state.blockedUntil).toBeGreaterThan(Date.now());
        await expect(news.analyze()).rejects.toMatchObject({
          code: "QUOTA",
          details: { category: "local_cooldown" },
        });
        expect(transport).toHaveBeenCalledTimes(1);
      }
    },
  );
  it("respects the actual SDK HTTP Retry-After header without a hidden retry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("{}", {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "7200" },
      }),
    );
    await expect(
      createNewsService(config(directory), { store }).analyze(),
    ).rejects.toMatchObject({ code: "QUOTA", retryAfterSeconds: 7200 });
    expect((await store.read()).blockedUntil).toBeGreaterThan(
      Date.now() + 7190000,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the last real failure when the daily budget suppresses a retry", async () => {
    vi.mocked(fetch).mockImplementation(async () => httpResponse(503));
    const news = createNewsService(
      config(directory, { NEWS_MAX_DAILY_REQUESTS: "1" }),
      { store, pause: async () => {} },
    );
    await expect(news.analyze()).rejects.toMatchObject({
      code: "BUDGET",
      details: { category: "budget_exhausted" },
    });
    const state = await store.read();
    expect(state.usage.requests).toBe(1);
    expect(state.lastGeminiAttempt).toMatchObject({
      httpStatus: 503,
      category: "server_error",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("records HTTP 200 and rejects invalid output locally without damaging source metadata", async () => {
    const payload = validBody();
    payload.candidates[0].content.parts[0].text = JSON.stringify({
      analyses: [{ evidenceId: "fake", priceTarget: 100 }],
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      }),
    );
    const before = await store.read();
    await expect(
      createNewsService(config(directory), { store }).analyze(),
    ).rejects.toMatchObject({
      code: "INVALID_ANALYSIS",
      details: { httpStatus: 200, category: "invalid_response" },
    });
    const state = await store.read();
    expect(state.collection).toEqual(before.collection);
    expect(state.snapshots).toEqual(before.snapshots);
    expect(state.lastGeminiAttempt).toMatchObject({
      httpStatus: 200,
      category: "invalid_response",
    });
    expect(state.usage.requests).toBe(1);
  });
  it("keeps successful constrained analysis functional with no source calls", async () => {
    vi.mocked(fetch).mockImplementation(async () => httpResponse(200));
    const news = createNewsService(config(directory), { store });
    expect((await news.analyze()).status).toBe("analyzed");
    expect((await news.read("BTCUSDT")).data!.events[0]).toMatchObject({
      sentiment: "neutral",
      uncertainty: "high",
    });
    expect((await store.read()).lastGeminiAttempt).toMatchObject({
      httpStatus: 200,
      category: "success",
    });
    expect((await news.analyze()).status).toBe("cache_hit");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reads pre-diagnostics v2 state without resetting budgets or rewriting the cache", async () => {
    const legacy = await store.read();
    legacy.usage.requests = 4;
    const payload = JSON.stringify(legacy, (name, value) =>
      name === "lastGeminiAttempt" ? undefined : value,
    );
    await writeFile(
      join(directory, "state.json"),
      JSON.stringify({ payload, sha256: hash(payload) }),
    );
    const before = await readFile(join(directory, "state.json"), "utf8");
    const state = await store.read();
    expect(state.lastGeminiAttempt).toBeNull();
    expect(state.usage.requests).toBe(4);
    expect(
      (await createNewsService(config(directory), { store }).read("BTCUSDT"))
        .status,
    ).toBe("available");
    expect(await readFile(join(directory, "state.json"), "utf8")).toBe(before);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never logs provider-supplied field names via the SDK text getter", async () => {
    const payload = validBody();
    Object.assign(payload.candidates[0].content.parts[0], {
      [privateMarker]: key,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      (await createNewsService(config(directory), { store }).analyze()).status,
    ).toBe("analyzed");
    expect(warn).not.toHaveBeenCalled();
    expect(await readFile(join(directory, "state.json"), "utf8")).not.toContain(
      privateMarker,
    );
  });
  it("prints only allowlisted CLI fields, never SDK messages/headers/prompts or keys", async () => {
    vi.mocked(fetch).mockImplementation(async () => httpResponse(400));
    const out = vi.spyOn(console, "error").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(
      await main(["analyze"], {
        NODE_ENV: "test",
        NEWS_STORAGE_PATH: directory,
        NEWS_INTELLIGENCE_ENABLED: "true",
        GEMINI_API_KEY: key,
        GEMINI_KEY_ROTATED: "true",
        NEWS_AI_ANALYSIS_ENABLED: "true",
      }),
    ).toBe(1);
    const printed = JSON.parse(out.mock.calls[0][0]);
    expect(printed).toEqual({
      status: "failed",
      code: "PROVIDER",
      diagnostics: {
        httpStatus: 400,
        category: "bad_request",
        elapsedMs: expect.any(Number),
      },
    });
    expect(JSON.stringify(out.mock.calls)).not.toMatch(
      /SYNTHETIC_PRIVATE|AQ\.|TEST FIXTURE|authorization|x-private-test/,
    );
    expect(info).not.toHaveBeenCalled();
  });
});
