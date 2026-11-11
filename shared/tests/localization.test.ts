import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { account, validatePortfolio } from "../portfolio";
import {
  commonEn,
  commonTr,
  decimalDisplay,
  decimalInput,
  defaultLocale,
  errorKey,
  formatDate,
  formatNumber,
  localeValue,
  validateLocale,
} from "../localization";

function entries(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof item === "string"
        ? [[path, item]]
        : Object.entries(entries(item, path));
    }),
  );
}
describe("client localization contracts", () => {
  it("defaults to Turkish independently of the system locale", () => {
    expect(defaultLocale).toBe("tr-TR");
    for (const value of [undefined, null, "en", "tr", "fr-FR", {}])
      expect(localeValue(value)).toBe("tr-TR");
    expect(localeValue("en-US")).toBe("en-US");
    expect(() => validateLocale("en")).toThrow();
  });
  it.each(["common", "webapp", "mobileapp"])(
    "%s dictionaries have matching keys and interpolation variables",
    (client) => {
      const read = (lang: string) =>
        JSON.parse(
          readFileSync(
            new URL(
              `../../${client}/${client === "webapp" ? "src/" : ""}locales/${lang}.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      const en = entries(client === "common" ? commonEn : read("en"));
      const tr = entries(client === "common" ? commonTr : read("tr"));
      expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en)) {
        expect(tr[key].trim(), key).not.toBe("");
        const variables = (s: string) =>
          [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
        expect(variables(tr[key]), key).toEqual(variables(en[key]));
        expect(tr[key], key).not.toContain("\ufffd");
      }
    },
  );
  it("formats display values and UTC dates without changing the inputs", () => {
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    expect(formatNumber(1234.56, "tr-TR", options)).toBe("1.234,56");
    expect(formatNumber(1234.56, "en-US", options)).toBe("1,234.56");
    expect(
      formatNumber(0.1234, "tr-TR", {
        style: "percent",
        maximumFractionDigits: 2,
      }),
    ).toBe("%12,34");
    const timestamp = "2026-11-09T00:00:00.000Z";
    expect(formatDate(timestamp, "tr-TR", true)).toBe("09.11.2026");
    expect(formatDate(timestamp, "en-US", true)).toBe("11/09/2026");
    expect(timestamp).toBe("2026-11-09T00:00:00.000Z");
  });
  it("keeps decimal precision and financial replay identical after localized input", () => {
    const quantity = "0.12345678";
    expect(decimalInput(decimalDisplay(quantity, "tr-TR"), "tr-TR")).toBe(
      quantity,
    );
    expect(decimalInput("1,25", "tr-TR")).toBe("1.25");
    const portfolio = validatePortfolio({
      version: 1,
      name: "Test",
      transactions: [
        {
          id: "one",
          symbol: "BTCUSDT",
          side: "buy",
          quantity: decimalInput("0,12345678", "tr-TR"),
          price: "100",
          fee: "0.01",
          timestamp: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    const result = account(portfolio.transactions, { BTCUSDT: 150 });
    expect(result.holdings[0].quantity.toString()).toBe(quantity);
    expect(result.costBasis.toString()).toBe("12.355678");
  });
  it("maps stable backend error codes, never provider response text", () => {
    expect(
      errorKey({ code: "INVALID_CREDENTIALS", message: "private text" }),
    ).toBe("errors.INVALID_CREDENTIALS");
    expect(errorKey({ code: "unknown", message: "private text" })).toBe(
      "errors.SERVICE_ERROR",
    );
    expect(errorKey(new Error("private text"))).toBe("errors.SERVICE_ERROR");
    expect(errorKey({ code: "__proto__" })).toBe("errors.SERVICE_ERROR");
    expect(errorKey({ issues: [] })).toBe("errors.INVALID_REQUEST");
  });
});
