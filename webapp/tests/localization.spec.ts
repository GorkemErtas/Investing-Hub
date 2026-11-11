import { test, expect } from '@playwright/test';
import { assets, type Symbol } from '../../shared/contracts';
import { predictionFixture } from '../../shared/tests/predictions-fixtures';
test.use({ locale: 'en-US' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const symbol = url.pathname.split('/').at(-1) as Symbol;
    const meta = {
      provider: 'Binance public market data',
      quoteCurrency: 'USDT',
      sourceTime: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      stale: false,
    };
    if (url.pathname.includes('/predictions/'))
      return route.fulfill({ json: predictionFixture(symbol, Date.now()) });
    if (url.pathname.endsWith('/markets'))
      return route.fulfill({
        json: {
          meta,
          data: assets.map((asset, i) => ({
            symbol: asset.symbol,
            price: 1234.56 + i,
            change24h: i - 3,
            quoteVolume: 10000,
            high24h: 1300,
            low24h: 1100,
            sourceTime: meta.sourceTime,
          })),
        },
      });
    const start = Math.floor(Date.now() / 86400000) * 86400000 - 40 * 86400000;
    return route.fulfill({
      json: {
        symbol,
        interval: url.searchParams.get('interval'),
        meta,
        data: Array.from({ length: 40 }, (_, i) => ({
          openTime: start + i * 86400000,
          closeTime: start + (i + 1) * 86400000 - 1,
          open: 1200,
          high: 1300,
          low: 1100,
          close: 1234.56,
          volume: 100,
          completed: true,
        })),
      },
    });
  });
});
test('Turkish defaults despite English browser; guest switching persists without changing forecasts or preferences', async ({
  page,
}) => {
  await page.goto('/predictions');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr-TR');
  await expect(page.getByRole('heading', { name: 'Fiyat Tahminleri.' })).toBeVisible();
  await expect(page.getByText('Deneysel Tahmin', { exact: true })).toHaveCount(8);
  const first = page.locator('.prediction-price').first();
  await expect(first).toContainText('101,00');
  await page.screenshot({ path: 'test-results/localization-tr-desktop.png', fullPage: true });
  const target = await page.locator('time').first().getAttribute('datetime');
  await page.evaluate(() => localStorage.setItem('unrelated-preference', 'preserved'));
  await page.getByRole('combobox', { name: 'Dil', exact: true }).selectOption('en-US');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('heading', { name: 'Price Predictions.' })).toBeVisible();
  await expect(first).toContainText('101.00');
  await page.screenshot({ path: 'test-results/localization-en-desktop.png', fullPage: true });
  await expect(page.locator('time').first()).toHaveAttribute('datetime', target!);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Price Predictions.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('preserved');
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('tr-TR');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Fiyat Tahminleri.' })).toBeVisible();
});
test('Turkish navigation, lessons, dialogs and narrow screens remain usable', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { name: 'Eğitim Merkezi.' })).toBeVisible();
  await expect(page.getByText('Gövde', { exact: true })).toBeVisible();
  await expect(page.getByText('100 USDT', { exact: false }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Portföy', exact: true }).click();
  await page.getByRole('button', { name: 'İşlem ekle', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sanal işlemi kaydet');
  await page.getByRole('button', { name: 'İptal', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/predictions');
  await page.getByRole('button', { name: 'Menüyü aç' }).click();
  await page.getByRole('combobox', { name: 'Dil', exact: true }).selectOption('en-US');
  await page.getByRole('button', { name: 'Close navigation' }).first().click();
  await expect(page.getByText('Experimental prediction', { exact: true })).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/localization-en-narrow.png', fullPage: true });
});

test('Turkish decimal inputs preserve exact stored transactions and portfolio accounting', async ({
  page,
}) => {
  await page.goto('/portfolio');
  await page.getByRole('button', { name: 'Yeni portföy', exact: true }).click();
  async function trade(
    side: 'buy' | 'sell',
    quantity: string,
    price: string,
    fee: string,
    day: string,
  ) {
    await page.getByRole('button', { name: 'İşlem ekle', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select[name=side]').selectOption(side);
    await dialog.locator('input[name=quantity]').fill(quantity);
    await dialog.getByLabel('Fiyat (USDT)', { exact: true }).fill(price);
    await dialog.locator('input[name=fee]').fill(fee);
    await dialog.locator('input[name=date]').fill(day);
    await dialog.getByRole('button', { name: 'Sanal işlemi kaydet' }).click();
  }
  await trade('buy', '2,5', '100,00', '0,25', '2024-01-01T12:00');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await trade('sell', '1', '150,00', '0,50', '2024-01-02T12:00');
  await expect(page.locator('.stat-value').filter({ hasText: /^49,40$/ })).toBeVisible();
  await expect(page.locator('.stat-value').filter({ hasText: /^150,15$/ })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ih:portfolios:v1')!));
  expect(saved[1].transactions[0]).toMatchObject({ quantity: '2.5', price: '100.00', fee: '0.25' });
  await page.getByRole('combobox', { name: 'Dil', exact: true }).selectOption('en-US');
  await expect(page.locator('.stat-value').filter({ hasText: /^49.40$/ })).toBeVisible();
  await page.reload();
  await page.locator('.portfolio-toolbar select').selectOption('1');
  await expect(page.locator('.stat-value').filter({ hasText: /^150.15$/ })).toBeVisible();
});

test('Turkish service errors, prediction unavailability and empty markets switch immediately', async ({
  page,
}) => {
  await page.route('**/api/predictions/**', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'private provider error' } },
    }),
  );
  await page.goto('/predictions');
  await expect(page.getByRole('alert')).toHaveCount(8, { timeout: 15000 });
  await expect(page.getByRole('alert').first()).toContainText('Tahmin yüklenemedi.');
  await page.getByRole('combobox', { name: 'Dil', exact: true }).selectOption('en-US');
  await expect(page.getByRole('alert').first()).toContainText(
    'The prediction could not be loaded.',
  );
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('tr-TR');
  await page.goto('/');
  await page.getByPlaceholder('Varlık ara…').fill('no-such-asset');
  await expect(page.getByText('Eşleşen varlık yok', { exact: true })).toBeVisible();
});
