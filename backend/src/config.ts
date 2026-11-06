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
  NEWS_INTELLIGENCE_ENABLED: z.enum(["true", "false"]).default("false"),
  GEMINI_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{20,200}$/)
      .optional(),
  ),
  GEMINI_KEY_ROTATED: z.enum(["true", "false"]).default("false"),
  CRYPTOPANIC_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{10,200}$/)
      .optional(),
  ),
  CRYPTOPANIC_PLAN: z
    .enum(["developer", "growth", "enterprise"])
    .default("developer"),
  NEWS_MAX_DAILY_SOURCE_REQUESTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(24),
  NEWS_RETENTION_HOURS: z.coerce.number().int().min(24).max(168).default(72),
  GEMINI_MODEL: z
    .string()
    .regex(/^gemini-[a-z0-9.-]+$/)
    .max(100)
    .default("gemini-3.5-flash-lite"),
  NEWS_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(14400)
    .max(21600)
    .default(21600),
  NEWS_MAX_DAILY_REQUESTS: z.coerce.number().int().min(1).max(100).default(16),
  NEWS_PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(20000),
  NEWS_STORAGE_PATH: z
    .string()
    .min(1)
    .max(1024)
    .refine((p) => !/[\x00-\x1f]/.test(p) && !p.includes("://"))
    .default(fileURLToPath(new URL("../.news-data", import.meta.url))),
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
  return { ...c, origins };
}
export type Config = ReturnType<typeof parseConfig>;
