import { z } from "zod";
import { fileURLToPath } from "node:url";

const optionalText = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  MARKET_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(5000),
  MARKET_CACHE_SECONDS: z.coerce.number().int().min(15).max(300).default(30),
  MARKET_STALE_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  MONGO_URI: optionalText,
  JWT_SECRET: optionalText,
  SMTP_URL: optionalText,
  EMAIL_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),
  FIREBASE_ENABLED: z.enum(["true", "false"]).default("false"),
  PRICE_ALERTS_ENABLED: z.enum(["true", "false"]).default("false"),
  ANALYTICS_LAB_ENABLED: z.enum(["true", "false"]).default("false"),
  ANALYTICS_EXPORT_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(
      fileURLToPath(
        new URL("../../ml/data/analytics/latest.json", import.meta.url),
      ),
    ),
  FUTURE_GEMINI_SEARCH_ENABLED: z.enum(["true", "false"]).default("false"),
  FUTURE_GEMINI_REVIEW_ENABLED: z.enum(["true", "false"]).optional(),
  FUTURE_REVIEW_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(1800)
    .default(900),
  FUTURE_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(86400)
    .default(21600),
  FUTURE_STALE_SECONDS: z.coerce
    .number()
    .int()
    .min(3600)
    .max(172800)
    .default(86400),
  FUTURE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(30000),
  FUTURE_MAX_DAILY_REQUESTS: z.coerce.number().int().min(1).max(100).default(8),
  FUTURE_MAX_MONTHLY_REQUESTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(64),
  FUTURE_MAX_DAILY_ESTIMATED_USD: z.coerce
    .number()
    .min(0.01)
    .max(100)
    .default(1),
  FUTURE_MAX_MONTHLY_ESTIMATED_USD: z.coerce
    .number()
    .min(0.01)
    .max(1000)
    .default(10),
  FUTURE_STORAGE_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(fileURLToPath(new URL("../.future-data", import.meta.url))),
  FUTURE_ML_EXPORT_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(
      fileURLToPath(
        new URL("../../ml/data/future-forecasts.json", import.meta.url),
      ),
    ),
  FUTURE_EXPERIMENTAL_EXPORT_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(
      fileURLToPath(
        new URL("../../ml/data/experimental-forecasts.json", import.meta.url),
      ),
    ),
  FUTURE_ML_DATABASE_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(
      fileURLToPath(
        new URL("../../ml/data/lifecycle.sqlite3", import.meta.url),
      ),
    ),
  GEMINI_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      // Header-safe opaque credentials: current AQ. auth keys and legacy keys.
      // Authentication/permissions are checked by Google, not by a fixed length.
      .min(20)
      .max(2048)
      .regex(/^(?:AQ\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]+)$/)
      .optional(),
  ),
  GEMINI_KEY_ROTATED: z.enum(["true", "false"]).default("false"),
  GEMINI_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .max(100)
    .default("gemini-3.5-flash-lite"),
});
export function parseConfig(env: NodeJS.ProcessEnv) {
  const c = schema.parse(env);
  if (
    c.MONGO_URI &&
    (!/^mongodb(?:\+srv)?:\/\//.test(c.MONGO_URI) ||
      !c.JWT_SECRET ||
      Buffer.byteLength(c.JWT_SECRET) < 32 ||
      /^(secret|change|example)/i.test(c.JWT_SECRET))
  )
    throw new Error(
      "Mobile accounts require a Mongo URI and a strong JWT_SECRET of at least 32 bytes.",
    );
  if ((c.SMTP_URL && !c.EMAIL_FROM) || (!c.SMTP_URL && c.EMAIL_FROM))
    throw new Error("SMTP_URL and EMAIL_FROM must be configured together.");
  if (c.SMTP_URL && !/^smtps?:\/\//.test(c.SMTP_URL))
    throw new Error("SMTP_URL must use smtp or smtps.");
  if (
    c.PRICE_ALERTS_ENABLED === "true" &&
    (!c.MONGO_URI || c.FIREBASE_ENABLED !== "true")
  )
    throw new Error("Price alerts require mobile accounts and Firebase.");
  const origins = c.CORS_ORIGINS.split(",").map((s) => s.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      throw new Error("CORS_ORIGINS must contain exact HTTP origins.");
    if (
      c.NODE_ENV === "production" &&
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      throw new Error("Public production origins must use HTTPS.");
  }
  if (c.MARKET_STALE_SECONDS <= c.MARKET_CACHE_SECONDS)
    throw new Error("Stale window must exceed cache duration.");
  return {
    ...c,
    FUTURE_GEMINI_REVIEW_ENABLED:
      c.FUTURE_GEMINI_REVIEW_ENABLED ?? c.FUTURE_GEMINI_SEARCH_ENABLED,
    origins,
  };
}
export type Config = ReturnType<typeof parseConfig>;
