import { createApiClient, parseApiUrl } from "@investing-hub/shared/client";
import {
  symbolSchema,
  intervalSchema,
  type Interval,
} from "@investing-hub/shared/contracts";
import { tokenStore } from "./tokenStore";

export const apiUrl = parseApiUrl(process.env.EXPO_PUBLIC_API_URL, !__DEV__);
const listeners = new Set<() => void>();
export const onUnauthorized = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const api = createApiClient({
  baseUrl: apiUrl,
  token: tokenStore.get,
  unauthorized: () => {
    listeners.forEach((listener) => listener());
  },
});
export const symbolFor = (base: string) =>
  symbolSchema.parse(base.endsWith("USDT") ? base : `${base}USDT`);
export const intervalFor = (value: string): Interval =>
  intervalSchema.parse(value);
export const marketRows = async () => {
  const response = await api.markets();
  return {
    ...response,
    data: response.data.map((row) => ({
      ...row,
      symbol: row.symbol.replace(/USDT$/, ""),
      dailyChange: row.change24h,
      change: row.change24h,
    })),
  };
};
export const chartRows = async (base: string, interval: string) => {
  const response = await api.candles(symbolFor(base), intervalFor(interval));
  return {
    ...response,
    line: response.data.map((c) => ({ time: c.openTime, price: c.close })),
    candles: response.data.map((c) => ({
      timestamp: c.openTime,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
  };
};
export async function movers(timeframe: string, descending: boolean) {
  const response = await marketRows();
  let stale = response.meta.stale;
  const data: typeof response.data = [];
  for (const row of response.data) {
    if (timeframe === "daily") {
      data.push(row);
      continue;
    }
    const candles = await api.candles(symbolFor(row.symbol), "1d");
    stale ||= candles.meta.stale;
    const closed = candles.data.filter((c) => c.completed);
    const periods = timeframe === "weekly" ? 7 : 30;
    const last = closed.at(-1);
    const previous = closed.at(-1 - periods);
    if (
      !last ||
      !previous ||
      last.openTime - previous.openTime !== periods * 86400000
    )
      throw new Error(
        "Not enough continuous completed candles for this period.",
      );
    data.push({ ...row, change: (last.close / previous.close - 1) * 100 });
  }
  return {
    data: data
      .sort((a, b) => (descending ? b.change - a.change : a.change - b.change))
      .slice(0, 5),
    meta: { ...response.meta, stale },
  };
}
