import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, parseApiUrl } from "../client";
import { settingsPatchSchema } from "../mobile";
describe("cross-platform API contract", () => {
  it("validates configuration without a hardcoded deployment address", () => {
    expect(parseApiUrl("http://10.0.2.2:5000/")).toBe("http://10.0.2.2:5000");
    for (const value of [
      undefined,
      "ftp://example.com",
      "https://user:pass@example.com",
      "https://example.com/api",
      "https://example.com?token=secret",
    ])
      expect(() => parseApiUrl(value)).toThrow();
    expect(() => parseApiUrl("http://example.com", true)).toThrow();
  });
  it("never defaults unrelated settings in a partial update", () => {
    expect(settingsPatchSchema.parse({ theme: "dark" })).toEqual({
      theme: "dark",
    });
    expect(() => settingsPatchSchema.parse({ userId: "someone" })).toThrow();
  });
  it("authenticates private calls and invalidates only authenticated 401 responses", async () => {
    const unauthorized = vi.fn();
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "SESSION_EXPIRED", message: "Log in again." },
            }),
            { status: 401 },
          ),
      );
    const api = createApiClient({
      baseUrl: "https://api.example.com",
      token: async () => "session",
      unauthorized,
      request,
    });
    await expect(api.me()).rejects.toMatchObject({
      status: 401,
      code: "SESSION_EXPIRED",
    });
    const headers = request.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer session");
    expect(unauthorized).toHaveBeenCalledTimes(1);
    await expect(api.markets()).rejects.toThrow(ApiError);
    expect(unauthorized).toHaveBeenCalledTimes(1);
    expect(
      (request.mock.calls[1][1]?.headers as Record<string, string>)
        .Authorization,
    ).toBeUndefined();
  });
  it("does not cache a private response between sessions and sanitizes malformed successful data", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("{}"));
    const api = createApiClient({
      baseUrl: "https://api.example.com",
      token: async () => "session",
      request,
    });
    await expect(api.me()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.me()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
