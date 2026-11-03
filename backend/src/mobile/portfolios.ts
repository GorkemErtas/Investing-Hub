import { randomBytes } from "node:crypto";
import { account, type Transaction } from "@investing-hub/shared/portfolio";
import type { MobileRepository } from "./repository.js";
import { AppError } from "../errors.js";

export function createPortfolioService(repo: MobileRepository) {
  async function owned(owner: string, id: string) {
    const portfolio = await repo.portfolio(owner, id);
    if (!portfolio)
      throw new AppError(404, "PORTFOLIO_NOT_FOUND", "Portfolio not found.");
    return portfolio;
  }
  return {
    owned,
    async trade(
      owner: string,
      id: string,
      operation: "add" | "edit" | "delete",
      input?: Omit<Transaction, "id">,
      transactionId?: string,
    ) {
      const portfolio = await owned(owner, id);
      if (
        operation !== "add" &&
        !portfolio.transactions.some((t) => t.id === transactionId)
      )
        throw new AppError(
          404,
          "TRANSACTION_NOT_FOUND",
          "Transaction not found.",
        );
      if (input && Date.parse(input.timestamp) > Date.now())
        throw new AppError(
          400,
          "FUTURE_TRADE",
          "Transactions cannot be in the future.",
        );
      const transaction = input
        ? {
            ...input,
            id:
              operation === "add"
                ? randomBytes(12).toString("hex")
                : transactionId!,
          }
        : undefined;
      const transactions =
        operation === "add"
          ? [...portfolio.transactions, transaction!]
          : operation === "edit"
            ? portfolio.transactions.map((t) =>
                t.id === transactionId ? transaction! : t,
              )
            : portfolio.transactions.filter((t) => t.id !== transactionId);
      if (transactions.length > 5000)
        throw new AppError(
          400,
          "PORTFOLIO_FULL",
          "A portfolio supports at most 5000 transactions.",
        );
      try {
        account(transactions);
      } catch {
        throw new AppError(
          400,
          "INVALID_LEDGER",
          "Transaction history is invalid or a sale exceeds available holdings.",
        );
      }
      return repo.savePortfolio(owner, { ...portfolio, transactions });
    },
  };
}
