import { z } from "zod";
import {
  candlesResponseSchema,
  marketsResponseSchema,
  predictionSchema,
  type Interval,
  type Symbol,
} from "./contracts.js";
import {
  capabilitiesSchema,
  loginResponseSchema,
  messageSchema,
  savedPortfolioSchema,
  settingsSchema,
  userSchema,
  type Settings,
  type SavedPortfolio,
} from "./mobile.js";
import type { Transaction } from "./portfolio.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function parseApiUrl(value: string | undefined, production = false) {
  if (!value)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to the shared backend HTTP(S) origin.",
    );
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "API URL must be an HTTP(S) origin without credentials or a path.",
    );
  if (production && url.protocol !== "https:")
    throw new Error("Production API URL must use HTTPS.");
  return url.origin;
}
export function createApiClient(options: {
  baseUrl: string;
  token?: () => Promise<string | null>;
  unauthorized?: () => void;
  request?: typeof fetch;
}) {
  const request = options.request ?? fetch;
  const pending = new Map<string, Promise<unknown>>();
  const cache = new Map<string, { value: unknown; expires: number }>();
  async function send<T>(
    path: string,
    schema: z.ZodType<T>,
    method = "GET",
    body?: unknown,
    authenticated = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const token = authenticated ? await options.token?.() : null;
      if (authenticated && !token)
        throw new ApiError(401, "UNAUTHENTICATED", "Please log in.");
      const response = await request(`${options.baseUrl}/api${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const error = z
          .object({
            error: z.object({ code: z.string(), message: z.string() }),
          })
          .safeParse(await response.json().catch(() => null));
        if (response.status === 401 && authenticated) options.unauthorized?.();
        throw new ApiError(
          response.status,
          error.success ? error.data.error.code : "SERVICE_ERROR",
          error.success
            ? error.data.error.message
            : "Service unavailable. Please retry.",
        );
      }
      return schema.parse(await response.json());
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof z.ZodError)
        throw new ApiError(
          502,
          "INVALID_RESPONSE",
          "The service returned an invalid response.",
        );
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Could not connect to the service. Check your connection and API URL.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  // Public data only: never cache a user's private response across sessions.
  function publicGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const hit = cache.get(path);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
    const existing = pending.get(path);
    if (existing) return existing as Promise<T>;
    const promise = send(path, schema)
      .then((value) => {
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(path, { value, expires: Date.now() + 30000 });
        return value;
      })
      .finally(() => pending.delete(path));
    pending.set(path, promise);
    return promise;
  }
  return {
    markets: () => publicGet("/markets", marketsResponseSchema),
    candles: (symbol: Symbol, interval: Interval) =>
      publicGet(
        `/candles/${symbol}?interval=${interval}`,
        candlesResponseSchema,
      ),
    prediction: (symbol: Symbol) =>
      publicGet(`/predictions/${symbol}`, predictionSchema),
    capabilities: () => send("/capabilities", capabilitiesSchema),
    register: (body: unknown) =>
      send("/auth/register", messageSchema, "POST", body),
    verify: (body: unknown) =>
      send("/auth/verify", messageSchema, "POST", body),
    login: (body: unknown) =>
      send("/auth/login", loginResponseSchema, "POST", body),
    me: () => send("/me", userSchema, "GET", undefined, true),
    portfolios: () =>
      send(
        "/portfolios",
        z.array(savedPortfolioSchema),
        "GET",
        undefined,
        true,
      ),
    portfolio: (id: string) =>
      send(`/portfolios/${id}`, savedPortfolioSchema, "GET", undefined, true),
    createPortfolio: (body: Pick<SavedPortfolio, "name" | "avatar">) =>
      send("/portfolios", savedPortfolioSchema, "POST", body, true),
    updatePortfolio: (
      id: string,
      body: Pick<SavedPortfolio, "name" | "avatar">,
    ) => send(`/portfolios/${id}`, savedPortfolioSchema, "PATCH", body, true),
    deletePortfolio: (id: string) =>
      send(`/portfolios/${id}`, messageSchema, "DELETE", undefined, true),
    addTrade: (id: string, body: Omit<Transaction, "id">) =>
      send(
        `/portfolios/${id}/transactions`,
        savedPortfolioSchema,
        "POST",
        body,
        true,
      ),
    editTrade: (
      id: string,
      transactionId: string,
      body: Omit<Transaction, "id">,
    ) =>
      send(
        `/portfolios/${id}/transactions/${transactionId}`,
        savedPortfolioSchema,
        "PUT",
        body,
        true,
      ),
    deleteTrade: (id: string, transactionId: string) =>
      send(
        `/portfolios/${id}/transactions/${transactionId}`,
        savedPortfolioSchema,
        "DELETE",
        undefined,
        true,
      ),
    settings: () =>
      send("/me/settings", settingsSchema, "GET", undefined, true),
    saveSettings: (body: Partial<Settings>) =>
      send("/me/settings", settingsSchema, "PATCH", body, true),
    pushToken: (token: string) =>
      send("/me/push-token", messageSchema, "PUT", { token }, true),
    removePushToken: () =>
      send("/me/push-token", messageSchema, "DELETE", undefined, true),
  };
}
