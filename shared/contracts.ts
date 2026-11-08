import { z } from "zod";

export const assets = [
  {
    symbol: "BTCUSDT",
    base: "BTC",
    name: "Bitcoin",
    color: "#f7931a",
    glyph: "₿",
  },
  {
    symbol: "ETHUSDT",
    base: "ETH",
    name: "Ethereum",
    color: "#8292ec",
    glyph: "Ξ",
  },
  {
    symbol: "SOLUSDT",
    base: "SOL",
    name: "Solana",
    color: "#9071f8",
    glyph: "◎",
  },
  { symbol: "BNBUSDT", base: "BNB", name: "BNB", color: "#d7ac35", glyph: "◇" },
  { symbol: "XRPUSDT", base: "XRP", name: "XRP", color: "#7a92a6", glyph: "×" },
  {
    symbol: "ADAUSDT",
    base: "ADA",
    name: "Cardano",
    color: "#4d8de9",
    glyph: "⠿",
  },
  {
    symbol: "DOGEUSDT",
    base: "DOGE",
    name: "Dogecoin",
    color: "#bfaa67",
    glyph: "Ð",
  },
  {
    symbol: "LINKUSDT",
    base: "LINK",
    name: "Chainlink",
    color: "#5076dc",
    glyph: "⬡",
  },
] as const;
export const symbolSchema = z.enum(assets.map((asset) => asset.symbol));
export type Symbol = z.infer<typeof symbolSchema>;
export const intervalSchema = z.enum(["15m", "1h", "4h", "1d", "1w", "1M"]);
export type Interval = z.infer<typeof intervalSchema>;
export const candleSchema = z
  .object({
    openTime: z.number().int().nonnegative(),
    closeTime: z.number().int().nonnegative(),
    open: z.number().positive(),
    high: z.number().positive(),
    low: z.number().positive(),
    close: z.number().positive(),
    volume: z.number().nonnegative(),
    completed: z.boolean(),
  })
  .refine(
    (c) =>
      c.low <= Math.min(c.open, c.close) &&
      c.high >= Math.max(c.open, c.close) &&
      c.closeTime > c.openTime,
  );
export type Candle = z.infer<typeof candleSchema>;
export const marketSchema = z.object({
  symbol: symbolSchema,
  price: z.number().positive(),
  change24h: z.number().finite(),
  quoteVolume: z.number().nonnegative(),
  high24h: z.number().positive(),
  low24h: z.number().positive(),
  sourceTime: z.string().datetime(),
});
export type Market = z.infer<typeof marketSchema>;
export const metaSchema = z.object({
  provider: z.literal("Binance public market data"),
  quoteCurrency: z.literal("USDT"),
  fetchedAt: z.string().datetime(),
  sourceTime: z.string().datetime(),
  stale: z.boolean(),
});
export type DataMeta = z.infer<typeof metaSchema>;
export const marketsResponseSchema = z.object({
  data: z.array(marketSchema),
  meta: metaSchema,
});
export const candlesResponseSchema = z.object({
  symbol: symbolSchema,
  interval: intervalSchema,
  data: z.array(candleSchema),
  meta: metaSchema,
});
export const predictionSchema = z
  .object({
    symbol: symbolSchema,
    target: z.literal("next_daily_close"),
    horizon: z.literal("1d"),
    predictionTimestamp: z.string().datetime(),
    sourceDataTimestamp: z.string().datetime().nullable(),
    targetTimestamp: z.string().datetime().nullable().default(null),
    modelVersion: z.string().min(1).nullable(),
    algorithm: z
      .enum(["ridge", "random_forest", "gradient_boosting", "lstm"])
      .nullable()
      .default(null),
    datasetFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
    referencePrice: z.number().finite().positive().nullable().default(null),
    predictedReturn: z.number().finite().gt(-1).nullable().default(null),
    predictedValue: z.number().finite().positive().nullable(),
    evaluationReference: z.string().min(1),
    status: z.enum(["experimental", "unavailable", "disabled_unvalidated"]),
    reason: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (value.status === "experimental") {
      if (
        value.predictedValue === null ||
        value.referencePrice === null ||
        value.predictedReturn === null ||
        !value.modelVersion ||
        !value.algorithm ||
        !value.datasetFingerprint ||
        !value.sourceDataTimestamp ||
        !value.targetTimestamp
      ) {
        issue(
          "Available prediction requires model, provenance, numbers and timestamps",
        );
        return;
      }
      const source = Date.parse(value.sourceDataTimestamp),
        generated = Date.parse(value.predictionTimestamp),
        target = Date.parse(value.targetTimestamp);
      if (!(
        source < generated &&
        generated < target &&
        target - source === 86400000 &&
        (source + 1) % 86400000 === 0
      ))
        issue("Invalid next-day prediction chronology");
      const expected = value.referencePrice * (1 + value.predictedReturn);
      if (
        Math.abs(expected - value.predictedValue) >
        Math.max(1e-9, Math.abs(expected) * 1e-10)
      )
        issue("Prediction price/return mismatch");
    } else if (
      value.predictedValue !== null ||
      value.modelVersion !== null ||
      value.referencePrice !== null ||
      value.predictedReturn !== null
    )
      issue("Unavailable predictions must not contain invented values");
  });
