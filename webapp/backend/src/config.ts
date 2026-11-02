import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  MARKET_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(5000),
  MARKET_CACHE_SECONDS: z.coerce.number().int().min(15).max(300).default(30),
  MARKET_STALE_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
});
export function parseConfig(env: NodeJS.ProcessEnv) {
  const c = schema.parse(env);
  const origins = c.CORS_ORIGINS.split(',').map((s) => s.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      throw new Error('CORS_ORIGINS must contain exact HTTP origins.');
    if (
      c.NODE_ENV === 'production' &&
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname)
    )
      throw new Error('Public production origins must use HTTPS.');
  }
  if (c.MARKET_STALE_SECONDS <= c.MARKET_CACHE_SECONDS)
    throw new Error('Stale window must exceed cache duration.');
  return { ...c, origins };
}
export type Config = ReturnType<typeof parseConfig>;
