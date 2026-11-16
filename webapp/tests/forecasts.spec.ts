import { test, expect, type Page } from '@playwright/test';
import { assets, type Symbol } from '../../shared/contracts';
import type { ForecastHorizon } from '../../shared/forecasts';
import { forecastFixture } from '../../shared/tests/forecasts-fixtures';

const NOW = Date.parse('2026-11-16T10:30:01.000Z');
async function fixtures(page: Page, mode: 'available' | 'unavailable' | 'error' = 'available') {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(() => localStorage.setItem('ih:language:v1', JSON.stringify('en-US')));
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const symbol = url.pathname.split('/').at(-1) as Symbol;
    const meta = {
      provider: 'Binance public market data',
      quoteCurrency: 'USDT',
      sourceTime: new Date(NOW).toISOString(),
      fetchedAt: new Date(NOW).toISOString(),
      stale: false,
    };
    if (url.pathname.includes('/v2/forecasts/')) {
      if (mode === 'error')
        return route.fulfill({ status: 503, json: { error: { code: 'SERVICE_ERROR' } } });
      const f = forecastFixture(symbol, url.searchParams.get('horizon') as ForecastHorizon, NOW);
      return route.fulfill({
        json:
          mode === 'available'
            ? f
            : {
                ...f,
                status: 'unavailable',
                reason: 'no_meaningful_validation_advantage',
                referencePrice: null,
                predictedPrice: null,
                predictedLogReturn: null,
                modelVersion: null,
                algorithm: null,
                evaluationMetrics: null,
              },
      });
    }
    if (url.pathname.endsWith('/capabilities'))
      return route.fulfill({
        json: { accounts: false, registration: false, notifications: false },
      });
    if (url.pathname.endsWith('/markets'))
      return route.fulfill({
        json: {
          meta,
          data: assets.map((a) => ({
            symbol: a.symbol,
            price: 100,
            change24h: 1,
            quoteVolume: 10000,
            high24h: 110,
            low24h: 90,
            sourceTime: meta.sourceTime,
          })),
        },
      });
    if (url.pathname.includes('/candles/'))
      return route.fulfill({
        json: {
          symbol,
          interval: url.searchParams.get('interval'),
          meta,
          data: Array.from({ length: 50 }, (_, i) => ({
            openTime: NOW - (51 - i) * 86400000,
            closeTime: NOW - (50 - i) * 86400000 - 1,
            open: 100,
            high: 102,
            low: 98,
            close: 101,
            volume: 20,
            completed: true,
          })),
        },
      });
    return route.fulfill({ status: 404, json: {} });
  });
}

test('forecasts share coin selection with the existing chart and expose distinct horizons and evidence', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/?symbol=ETHUSDT');
  const panel = page.locator('#forecast');
  await expect(panel.getByRole('heading', { name: 'Price forecast' })).toBeVisible();
  await expect(panel).toContainText('ETH / USDT');
  await expect(panel.locator('.forecast-price')).toContainText('101.00');
  await expect(panel.getByRole('button', { name: '1M', exact: true })).toBeDisabled();
  await expect(panel).toContainText('one calendar month');
  await panel.getByRole('button', { name: '15m', exact: true }).click();
  await expect(panel.locator('time').first()).toHaveAttribute(
    'datetime',
    forecastFixture('ETHUSDT', '15m', NOW).targetTime!,
  );
  await page.getByRole('combobox', { name: 'Chart asset' }).selectOption('SOLUSDT');
  await expect(panel).toContainText('SOL / USDT');
  await expect(page).toHaveURL(/symbol=SOLUSDT/);
  await panel.getByText('Model and historical evaluation', { exact: true }).click();
  await expect(panel).toContainText('synthetic-test-model-v2');
  await expect(panel).toContainText('No-change holdout RMSE');
  await page.getByRole('button', { name: 'View price data', exact: true }).click();
  await expect(page.getByRole('table').first()).toBeVisible();
  await page
    .locator('.market-table tr')
    .filter({ hasText: 'Chainlink' })
    .getByRole('link', { name: 'View forecast' })
    .click();
  await expect(page).toHaveURL(/symbol=LINKUSDT#forecast/);
  await expect(panel).toContainText('LINK / USDT');
  await page.screenshot({ path: 'test-results/forecasts-unified-desktop.png', fullPage: true });
});

test('an expired minute prediction loses its numeric price without waiting for another request', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/');
  const panel = page.locator('#forecast');
  await expect(panel.locator('.forecast-price')).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(panel.getByText('Forecast expired', { exact: true })).toBeVisible();
  await expect(panel.locator('.forecast-price')).toHaveCount(0);
});

test('unavailable forecasts, Turkish copy, light mode and narrow screens preserve market controls', async ({
  page,
}) => {
  await fixtures(page, 'unavailable');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?symbol=LINKUSDT');
  const panel = page.locator('#forecast');
  await expect(panel).toContainText('No model demonstrated a meaningful');
  await expect(panel.locator('.forecast-price')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('tr-TR');
  await page.getByRole('button', { name: 'Açık temaya geç' }).click();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('heading', { name: 'Fiyat öngörüsü' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/forecasts-unified-mobile-tr-light.png',
    fullPage: true,
  });
});

test('provider errors show retry controls without a numeric fallback', async ({ page }) => {
  await fixtures(page, 'error');
  await page.goto('/');
  const panel = page.locator('#forecast');
  await expect(panel.getByText('The forecast could not be loaded.')).toBeVisible({
    timeout: 15000,
  });
  await expect(panel.locator('.forecast-price')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Try again' })).toBeVisible();
});
