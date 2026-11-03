import { Decimal } from "decimal.js";
import { z } from "zod";
import { symbolSchema, type Symbol } from "./contracts.js";

const LedgerDecimal = Decimal.clone({ precision: 60 });

// Strings preserve entered decimal precision. Calculations use decimal arithmetic;
// conversion to JS numbers happens only at the presentation boundary.
const positiveDecimal = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,8})?$/)
  .refine((s) => new LedgerDecimal(s).gt(0), "Must be greater than zero");
export const transactionSchema = z.object({
  id: z.string().min(1).max(100),
  symbol: symbolSchema,
  side: z.enum(["buy", "sell"]),
  quantity: positiveDecimal,
  price: positiveDecimal,
  fee: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,8})?$/)
    .default("0"),
  timestamp: z.string().datetime(),
});
export type Transaction = z.infer<typeof transactionSchema>;
export function grossNotional(quantity: string, price: string): string {
  return new LedgerDecimal(positiveDecimal.parse(quantity))
    .times(positiveDecimal.parse(price))
    .toFixed();
}
export const portfolioSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(60),
  transactions: z.array(transactionSchema).max(5000),
});
export type Portfolio = z.infer<typeof portfolioSchema>;
export interface Holding {
  symbol: Symbol;
  quantity: number;
  costBasis: number;
  averagePrice: number;
  realized: number;
  marketValue: number | null;
  unrealized: number | null;
}
export function account(
  transactions: Transaction[],
  prices: Partial<Record<Symbol, number>> = {},
) {
  const ledger = new Map<
    Symbol,
    { quantity: Decimal; cost: Decimal; realized: Decimal }
  >();
  const ids = new Set<string>();
  // Equal timestamps retain the original insertion order (stable sort).
  const ordered = transactions
    .map((t) => transactionSchema.parse(t))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const t of ordered) {
    if (ids.has(t.id)) throw new Error("Duplicate transaction ID.");
    ids.add(t.id);
    const h = ledger.get(t.symbol) ?? {
      quantity: new LedgerDecimal(0),
      cost: new LedgerDecimal(0),
      realized: new LedgerDecimal(0),
    };
    const q = new LedgerDecimal(t.quantity),
      p = new LedgerDecimal(t.price),
      fee = new LedgerDecimal(t.fee);
    if (t.side === "buy") {
      h.quantity = h.quantity.plus(q);
      h.cost = h.cost.plus(q.times(p)).plus(fee);
    } else {
      if (q.gt(h.quantity))
        throw new Error(
          `Insufficient ${t.symbol.replace("USDT", "")} holdings at ${t.timestamp}.`,
        );
      const removedCost = h.cost.div(h.quantity).times(q);
      h.realized = h.realized.plus(q.times(p).minus(fee).minus(removedCost));
      h.quantity = h.quantity.minus(q);
      h.cost = h.quantity.isZero()
        ? new LedgerDecimal(0)
        : h.cost.minus(removedCost);
    }
    ledger.set(t.symbol, h);
  }
  const holdings: Holding[] = [...ledger].map(([symbol, h]) => {
    const price = prices[symbol];
    const value = h.quantity.isZero()
      ? new LedgerDecimal(0)
      : price !== undefined && Number.isFinite(price) && price > 0
        ? h.quantity.times(price)
        : null;
    return {
      symbol,
      quantity: h.quantity.toNumber(),
      costBasis: h.cost.toNumber(),
      averagePrice: h.quantity.isZero() ? 0 : h.cost.div(h.quantity).toNumber(),
      realized: h.realized.toNumber(),
      marketValue: value?.toNumber() ?? null,
      unrealized: value?.minus(h.cost).toNumber() ?? null,
    };
  });
  const complete = holdings.every((h) => h.marketValue !== null);
  // Aggregate from Decimal states before converting any holding for presentation.
  const costBasis = [...ledger.values()].reduce(
    (sum, h) => sum.plus(h.cost),
    new LedgerDecimal(0),
  );
  const realized = [...ledger.values()].reduce(
    (sum, h) => sum.plus(h.realized),
    new LedgerDecimal(0),
  );
  const marketValue = complete
    ? [...ledger].reduce(
        (sum, [symbol, h]) =>
          sum.plus(h.quantity.isZero() ? 0 : h.quantity.times(prices[symbol]!)),
        new LedgerDecimal(0),
      )
    : null;
  return {
    holdings,
    ordered,
    costBasis: costBasis.toNumber(),
    realized: realized.toNumber(),
    marketValue: marketValue?.toNumber() ?? null,
    unrealized: marketValue?.minus(costBasis).toNumber() ?? null,
  };
}
export function validatePortfolio(value: unknown): Portfolio {
  const p = portfolioSchema.parse(value);
  account(p.transactions);
  return p;
}
export const examplePortfolio: Portfolio = {
  version: 1,
  name: "My demo portfolio",
  transactions: [
    {
      id: "example-btc",
      symbol: "BTCUSDT",
      side: "buy",
      quantity: "0.12",
      price: "58000",
      fee: "6.96",
      timestamp: "2024-09-01T12:00:00.000Z",
    },
    {
      id: "example-eth",
      symbol: "ETHUSDT",
      side: "buy",
      quantity: "1.5",
      price: "2400",
      fee: "3.60",
      timestamp: "2024-09-02T12:00:00.000Z",
    },
    {
      id: "example-sol",
      symbol: "SOLUSDT",
      side: "buy",
      quantity: "12",
      price: "135",
      fee: "1.62",
      timestamp: "2024-09-03T12:00:00.000Z",
    },
  ],
};
