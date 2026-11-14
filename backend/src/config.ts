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
  // Enable only with Railway's edge as the sole public ingress.
  TRUST_RAILWAY_PROXY: z.enum(["true", "false"]).default("false"),
  WEB_DIST_PATH: optionalText,
  MARKET_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(5000),
  MARKET_CACHE_SECONDS: z.coerce.number().int().min(15).max(300).default(30),
  MARKET_STALE_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  MONGO_URI: optionalText,
  JWT_SECRET: optionalText,
  SMTP_URL: optionalText,
  BREVO_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^\S+$/, "BREVO_API_KEY must not contain whitespace.")
      .optional(),
  ),
  EMAIL_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),
  FIREBASE_ENABLED: z.enum(["true", "false"]).default("false"),
  PRICE_ALERTS_ENABLED: z.enum(["true", "false"]).default("false"),
  PREDICTIONS_EXPORT_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(
      fileURLToPath(new URL("../../ml/data/predictions.json", import.meta.url)),
    ),
  ML_DATABASE_PATH: z
    .string()
    .min(1)
    .max(1024)
    .default(
      fileURLToPath(
        new URL("../../ml/data/lifecycle.sqlite3", import.meta.url),
      ),
    ),
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
  if (Boolean(c.BREVO_API_KEY || c.SMTP_URL) !== Boolean(c.EMAIL_FROM))
    throw new Error(
      "Email requires EMAIL_FROM and a provider: BREVO_API_KEY or SMTP_URL.",
    );
  // Brevo takes precedence, but every supplied provider must be valid.
  if (c.SMTP_URL) {
    try {
      const smtp = new URL(c.SMTP_URL);
      if (!["smtp:", "smtps:"].includes(smtp.protocol) || !smtp.hostname)
        throw new Error();
      decodeURIComponent(smtp.username);
      decodeURIComponent(smtp.password);
    } catch {
      throw new Error("SMTP_URL must be a valid smtp or smtps URL.");
    }
  }
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
