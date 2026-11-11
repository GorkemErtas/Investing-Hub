import { expect, test, type Page } from '@playwright/test';
import { predictionFixture } from '../../shared/tests/predictions-fixtures';
import type { Symbol } from '../../shared/contracts';

// Synthetic fixtures belong only in tests, never in application/provider code.
const symbols = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'DOGEUSDT',
  'LINKUSDT',
];
async function fixtures(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('ih:language:v1') === null)
      localStorage.setItem('ih:language:v1', JSON.stringify('en-US'));
  });
  await page.route('**/api/predictions/**', (route) =>
    route.fulfill({
      json: predictionFixture(
        new URL(route.request().url()).pathname.split('/').at(-1) as Symbol,
        Date.now(),
        false,
      ),
    }),
  );
  const now = new Date().toISOString();
  const meta = {
    provider: 'Binance public market data',
    quoteCurrency: 'USDT',
    fetchedAt: now,
    sourceTime: now,
    stale: false,
  };
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      json: {
        data: symbols.map((symbol, i) => ({
          symbol,
          price: 100 + i * 10,
          change24h: i - 3,
          quoteVolume: 1000000 - i * 10000,
          high24h: 200,
          low24h: 50,
          sourceTime: now,
        })),
        meta,
      },
    }),
  );
  await page.route('**/api/candles/**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: {
        symbol: url.pathname.split('/').at(-1),
        interval: url.searchParams.get('interval'),
        meta,
        data: Array.from({ length: 50 }, (_, i) => ({
          openTime: 1704067200000 + i * 86400000,
          closeTime: 1704067200000 + (i + 1) * 86400000 - 1,
          open: 100 + i,
          high: 103 + i,
          low: 99 + i,
          close: 102 + i,
          volume: 500 + i,
          completed: true,
        })),
      },
    });
  });
}

test('dashboard search, watchlist persistence, theme and chart controls', async ({ page }) => {
  await fixtures(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Market dashboard.' })).toBeVisible();
  await expect(page.locator('.market-table tbody tr')).toHaveCount(8);
  await page.getByRole('textbox', { name: 'Search assets' }).fill('ethereum');
  await expect(page.locator('.market-table tbody tr')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search assets' }).fill('');
  await page.getByRole('button', { name: 'Add Solana to watchlist' }).click();
  await page.getByRole('button', { name: /Watchlist 3/ }).click();
  await expect(page.locator('.market-table tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Area chart', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Area chart', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '1mo', exact: true }).click();
  await page.getByRole('button', { name: 'View price data' }).click();
  await expect(page.getByRole('cell', { name: 'Closed', exact: true })).toHaveCount(10);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Remove Solana from watchlist' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('portfolio accounting, oversell protection, history replay and persistence', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/portfolio');
  await page.getByRole('button', { name: 'New portfolio', exact: true }).click();
  await expect(page.locator('.portfolio-toolbar select')).toHaveValue('1');
  async function trade(
    side: 'buy' | 'sell',
    quantity: string,
    price: string,
    fee: string,
    date: string,
  ) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: 'Side', exact: true }).selectOption(side);
    await dialog.getByLabel('Quantity', { exact: true }).fill(quantity);
    await dialog.getByLabel('Price in USDT', { exact: true }).fill(price);
    await dialog.getByLabel('Fee in USDT', { exact: true }).fill(fee);
    await dialog.getByLabel('Date & time (your local time)').fill(date);
    await dialog.getByRole('button', { name: 'Save simulated transaction' }).click();
  }
  await trade('buy', '2', '100', '2', '2024-01-01T12:00');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await trade('sell', '3', '150', '1', '2024-01-02T12:00');
  await expect(page.getByRole('alert')).toContainText('Insufficient');
  await page.getByRole('dialog').getByLabel('Quantity', { exact: true }).fill('1');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Save simulated transaction' })
    .click();
  await expect(
    page
      .locator('.stat-card')
      .filter({ hasText: /^Realized profit \/ loss/ })
      .locator('.stat-value'),
  ).toHaveText('48.00');
  await expect(
    page.locator('.stat-card').filter({ hasText: 'Remaining cost basis' }).locator('.stat-value'),
  ).toHaveText('101.00');
  await page.getByRole('button', { name: /Remove Buy BTCUSDT/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'supports a later sale' })).toBeVisible();
  await page.reload();
  await page.locator('.portfolio-toolbar select').selectOption('1');
  await expect(
    page
      .locator('.stat-card')
      .filter({ hasText: /^Realized profit \/ loss/ })
      .locator('.stat-value'),
  ).toHaveText('48.00');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('investing-hub-demo-portfolio.json');
});

test('learning quiz and disabled forecast presentation', async ({ page }) => {
  await fixtures(page);
  await page.goto('/learn');
  await page.getByRole('button', { name: 'A 120 USDT', exact: true }).click();
  await expect(page.locator('.quiz-explanation')).toContainText('Correct.');
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: /B The current interval/ }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await page.getByRole('button', { name: /C Keep the final chronological/ }).click();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: '3 of 3 correct' })).toBeVisible();
  await page.getByRole('link', { name: /Price Predictions/ }).click();
  await expect(page.getByText('Prediction unavailable', { exact: true })).toHaveCount(8);
});

test('mobile navigation, responsive layout and provider outage', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ih:language:v1', JSON.stringify('en-US')));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/markets', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'MARKET_UNAVAILABLE' } } }),
  );
  await page.route('**/api/candles/**', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Market dashboard.' })).toBeVisible();
  await expect(page.getByText('Data is taking a break')).toHaveCount(2, { timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your portfolio.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
