import type { MarketService } from "../market/service.js";
import type { MobileRepository } from "./repository.js";

export type PushSender = (
  token: string,
  title: string,
  body: string,
) => Promise<void>;
export function createAlertWorker(
  repo: MobileRepository,
  market: MarketService,
  send: PushSender,
) {
  let cursor: string | null = null;
  let running = false;
  return async () => {
    if (running || !repo.available()) return;
    running = true;
    try {
      const quotes = await market.markets();
      if (quotes.meta.stale) return;
      const batch = await repo.alertRecipients(cursor, 100);
      cursor = batch.length === 100 ? batch.at(-1)!.id : null;
      for (const user of batch)
        for (const [symbol, alert] of Object.entries(
          user.settings.priceAlerts,
        )) {
          if (!user.settings.selectedCoins.includes(symbol)) continue;
          const quote = quotes.data.find((q) => q.symbol === `${symbol}USDT`);
          if (!quote || (quote.price > alert.min && quote.price < alert.max))
            continue;
          if (!(await repo.claimAlert(user.id, symbol, alert))) continue;
          try {
            await send(
              user.token,
              `${symbol} price alert`,
              `${symbol} is ${quote.price} USDT (range ${alert.min}–${alert.max}).`,
            );
          } catch {
            await repo.restoreAlert(user.id, symbol, alert);
            console.warn("Push delivery failed; alert restored for retry.");
          }
        }
    } catch {
      console.warn(
        "Price alert check unavailable; will retry on the next interval.",
      );
    } finally {
      running = false;
    }
  };
}
