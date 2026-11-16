/** Opt-in real-provider check. No request mocks, fake clocks or synthetic forecasts. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { assets } from "../shared/contracts.js";
import { objectiveForecastSchema } from "../shared/objectives.js";
import { forecastSchema } from "../shared/forecasts.js";

const origin = "http://127.0.0.1:3000";
const directory = ".npm-cache/local-real-ui";
await mkdir(directory, { recursive: true });
const pct = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
await expect
  .poll(
    async () => {
      try {
        const response = await fetch(
          `${origin}/api/v3/forecasts/BTCUSDT?horizon=15m`,
        );
        const f = objectiveForecastSchema.parse(await response.json());
        return (
          f.direction.status === "experimental" &&
          f.volatility.status === "experimental"
        );
      } catch {
        return false;
      }
    },
    { timeout: 110000, intervals: [1000, 2000] },
  )
  .toBe(true);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  await page.addInitScript(() =>
    localStorage.setItem("ih:language:v1", JSON.stringify("en-US")),
  );
  await page.goto(`${origin}/?symbol=BTCUSDT#forecast`);
  const panel = page.locator("#forecast");
  const received = page.waitForResponse((r) =>
    r.url().includes("/v3/forecasts/BTCUSDT?horizon=15m"),
  );
  await panel.getByRole("button", { name: "15m", exact: true }).click();
  const actual = objectiveForecastSchema.parse(await (await received).json());
  expect(actual.direction.status).toBe("experimental");
  expect(actual.volatility.status).toBe("experimental");
  const probabilities = actual.direction.probabilities!;
  await expect(panel.locator(".objective-value")).toHaveText(
    { down: "Downward", neutral: "Neutral", up: "Upward" }[
      actual.direction.direction!
    ],
  );
  for (const probability of Object.values(probabilities))
    await expect(panel.locator(".direction-probabilities")).toContainText(
      pct(probability),
    );
  await panel.getByRole("button", { name: "Volatility", exact: true }).click();
  await expect(panel.locator(".objective-value")).toHaveText(
    pct(actual.volatility.expectedVolatility!),
  );
  const priceResponse = page.waitForResponse((r) =>
    r.url().includes("/v2/forecasts/BTCUSDT?horizon=15m"),
  );
  await panel
    .getByText("Experimental price projection", { exact: true })
    .click();
  const price = forecastSchema.parse(await (await priceResponse).json());
  expect(price.status).toBe("experimental");
  const renderedPrice = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price.predictedPrice!);
  await expect(panel.locator(".forecast-price")).toContainText(renderedPrice);
  await panel
    .getByText("Model and historical evaluation", { exact: true })
    .click();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${directory}/desktop-actual.png`,
    fullPage: true,
  });
  const samples = [];
  for (const asset of assets) {
    const f = objectiveForecastSchema.parse(
      await (
        await fetch(`${origin}/api/v3/forecasts/${asset.symbol}?horizon=15m`)
      ).json(),
    );
    samples.push({
      symbol: asset.symbol,
      direction: f.direction.status,
      volatility: f.volatility.status,
    });
  }
  // Disconnect the browser and let actual candle-derived expiry run naturally.
  await context.setOffline(true);
  await expect(panel.locator(".objective-value")).toHaveCount(0, {
    timeout: 95000,
  });
  await expect(panel.locator(".forecast-price")).toHaveCount(0, {
    timeout: 95000,
  });
  await context.setOffline(false);
  await page.reload();
  await panel.getByRole("button", { name: "15m", exact: true }).click();
  await expect(panel.locator(".objective-value")).toBeVisible({
    timeout: 35000,
  });
  const result = {
    version: "local-real-ui-verification-v1",
    verifiedAt: new Date().toISOString(),
    syntheticDataUsed: false,
    requestInterceptionUsed: false,
    fakeClockUsed: false,
    direction: actual.direction,
    volatility: actual.volatility,
    sourceCandleTime: actual.sourceCandleTime,
    targetTime: actual.targetTime,
    price: {
      model: price.modelVersion,
      predictedPrice: price.predictedPrice,
      sourceCandleTime: price.sourceCandleTime,
    },
    exactUiValuesMatchedApi: true,
    offlineExpiredNumbersRemoved: true,
    reconnectedNumbersRecovered: true,
    otherCoins: samples,
  };
  await writeFile(
    `${directory}/verification.json`,
    JSON.stringify(result, null, 2),
  );
  console.info(
    JSON.stringify({
      actualModelUiVerified: true,
      offlineExpiryVerified: true,
      result: `${directory}/verification.json`,
    }),
  );
} finally {
  await browser.close();
}
