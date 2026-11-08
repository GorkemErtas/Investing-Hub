import { expect, test } from "@playwright/test";
import { predictionFixture } from "../../shared/tests/predictions-fixtures";
import type { Symbol } from "../../shared/contracts";
test("mobile preview: markets, actual candles, accounts, owned portfolio and logout isolation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const now = new Date().toISOString();
  const symbols = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "LINKUSDT",
  ];
  const meta = {
    provider: "Binance public market data",
    quoteCurrency: "USDT",
    fetchedAt: now,
    sourceTime: now,
    stale: false,
  };
  const owner = {
    id: "111111111111111111111111",
    firstName: "Mobile",
    lastName: "Tester",
    email: "mobile@example.com",
  };
  const portfolio = {
    _id: "333333333333333333333333",
    name: "My private ledger",
    revision: 0,
    transactions: [
      {
        id: "444444444444444444444444",
        symbol: "BTCUSDT",
        side: "buy",
        quantity: "2",
        price: "100",
        fee: "2",
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "555555555555555555555555",
        symbol: "BTCUSDT",
        side: "sell",
        quantity: "1",
        price: "150",
        fee: "1",
        timestamp: "2024-01-02T00:00:00.000Z",
      },
    ],
  };
  let privateCalls = 0;
  await page.route("https://api.example.invalid/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/predictions/"))
      return route.fulfill({
        json: predictionFixture(path.split("/").at(-1) as Symbol, Date.now()),
      });
    if (path === "/api/markets")
      return route.fulfill({
        json: {
          data: symbols.map((symbol, i) => ({
            symbol,
            price: 100 + i,
            change24h: i - 3,
            quoteVolume: 1000,
            high24h: 125,
            low24h: 90,
            sourceTime: now,
          })),
          meta,
        },
      });
    if (path.startsWith("/api/candles/"))
      return route.fulfill({
        json: {
          symbol: path.split("/").at(-1),
          interval: new URL(route.request().url()).searchParams.get("interval"),
          meta,
          data: Array.from({ length: 50 }, (_, i) => ({
            openTime: 1704067200000 + i * 86400000,
            closeTime: 1704067200000 + (i + 1) * 86400000 - 1,
            open: 100,
            high: 125,
            low: 90,
            close: 110,
            volume: 4,
            completed: true,
          })),
        },
      });
    if (path === "/api/capabilities")
      return route.fulfill({
        json: { accounts: true, registration: false, notifications: false },
      });
    if (path === "/api/auth/login")
      return route.fulfill({
        json: { user: owner, token: "browser-fixture-session", expiresAt: now },
      });
    if (path === "/api/portfolios") {
      expect(route.request().headers().authorization).toBe(
        "Bearer browser-fixture-session",
      );
      privateCalls++;
      return route.fulfill({ json: [portfolio] });
    }
    if (path === `/api/portfolios/${portfolio._id}`)
      return route.fulfill({ json: portfolio });
    if (path === "/api/me") return route.fulfill({ json: owner });
    if (path === "/api/me/settings")
      return route.fulfill({
        json: {
          theme: "light",
          selectedCoins: [],
          priceAlerts: {},
          alertThreshold: 10,
        },
      });
    if (path === "/api/me/push-token")
      return route.fulfill({ json: { message: "Detached." } });
    return route.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "No forecast is published." },
      },
    });
  });
  await page.goto("/home");
  await expect(page.getByText("Crypto Dashboard", { exact: true })).toBeVisible(
    { timeout: 20000 },
  );
  const gainers = page
    .getByText("Top Daily Gainers", { exact: true })
    .locator("..");
  const losers = page
    .getByText("Top Daily Losers", { exact: true })
    .locator("..");
  await expect(gainers).toContainText("4.00%");
  await expect(losers).toContainText("-3.00%");
  await gainers.getByRole("combobox").selectOption("weekly");
  const weekly = page
    .getByText("Top Weekly Gainers", { exact: true })
    .locator("..");
  await expect(weekly).toContainText("No data available");
  await expect(losers).toContainText("-3.00%");
  await weekly.getByRole("combobox").selectOption("daily");
  await expect(gainers).toContainText("4.00%");
  await page.getByPlaceholder("Search by symbol").fill("ETH");
  await page.getByText("Details", { exact: true }).click();
  await expect(
    page.getByText("ETH Details (USDT)", { exact: true }),
  ).toBeVisible();
  await page.getByText("Candlestick", { exact: true }).click();
  await expect(page.getByText(/O 100 H 125 L 90 C 110 USDT/)).toBeVisible();
  await page.getByText("Trade", { exact: true }).click();
  await expect(
    page.getByText("Experimental price prediction", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/USDT \/ Target UTC date/)).toBeVisible();
  await page.getByRole("tab", { name: /portfolio/i }).click();
  await expect(
    page.getByText("Log in to manage your private portfolios."),
  ).toBeVisible();
  await page.getByText("Open account", { exact: true }).click();
  await page.getByPlaceholder("Email", { exact: true }).fill(owner.email);
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("long-browser-test-password");
  await page.getByText("Log In", { exact: true }).last().click();
  await page.getByRole("tab", { name: /portfolio/i }).click();
  await expect(page.getByText(portfolio.name, { exact: true })).toBeVisible();
  await page.getByText("View Details", { exact: true }).click();
  await expect(
    page.getByText("Realized P/L: 48 USDT", { exact: true }),
  ).toBeVisible();
  expect(privateCalls).toBeGreaterThan(0);
  await page.getByRole("tab", { name: /home/i }).click();
  await page.getByLabel("Open settings menu").click();
  await page.getByText("Logout", { exact: true }).click();
  await page.getByRole("tab", { name: /portfolio/i }).click();
  await expect(
    page.getByText("Log in to manage your private portfolios."),
  ).toBeVisible();
  await expect(page.getByText(portfolio.name, { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /learning-hub/i }).click();
  await expect(page.getByText("Watch on YouTube", { exact: true })).toHaveCount(
    5,
  );
  expect(errors).toEqual([]);
});
