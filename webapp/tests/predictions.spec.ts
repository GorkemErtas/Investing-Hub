import { test, expect, type Page } from '@playwright/test';
import { assets, type Symbol } from '../../shared/contracts';
import { predictionFixture } from '../../shared/tests/predictions-fixtures';
async function fixture(page: Page, available = true, expired = false) {
  let calls = 0;
  await page.route('**/api/predictions/**', (r) => {
    calls++;
    expect(r.request().method()).toBe('GET');
    const symbol = new URL(r.request().url()).pathname.split('/').at(-1) as Symbol;
    return r.fulfill({
      json: predictionFixture(symbol, Date.now() - (expired ? 86400000 : 0), available),
    });
  });
  return () => calls;
}
test('all eight numerical forecasts show names, USDT prices, UTC targets and experimental labels without review controls', async ({
  page,
}) => {
  const calls = await fixture(page),
    requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/predictions');
  await expect(page.getByRole('heading', { name: 'Price Predictions.' })).toBeVisible();
  for (const { symbol, name } of assets) {
    const card = page.getByRole('article', { name: name + ' price prediction' });
    await expect(card).toContainText(symbol);
    await expect(card).toContainText(
      predictionFixture(symbol, Date.now()).predictedValue!.toFixed(2),
    );
    await expect(card).toContainText('USDT');
    await expect(card.locator('time')).toHaveAttribute(
      'dateTime',
      predictionFixture(symbol, Date.now()).targetTimestamp!,
    );
    await expect(card).toContainText('Experimental prediction');
  }
  // React StrictMode may cancel/restart initial GETs in development.
  expect(calls()).toBeGreaterThanOrEqual(8);
  expect(
    new Set(
      requests
        .filter((url) => url.includes('/api/predictions/'))
        .map((url) => new URL(url).pathname),
    ).size,
  ).toBe(8);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Research', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Analytics Lab', exact: true })).toHaveCount(0);
  await expect(page.getByText('Analytics Lab', { exact: false })).toHaveCount(0);
  expect(requests.some((url) => /generativelanguage|future-analysis|review/.test(url))).toBe(false);
  await page.screenshot({ path: 'test-results/price-predictions-desktop.png', fullPage: true });
});
test('missing data and expired forecasts show explicit unavailable states, never invented numbers', async ({
  page,
}) => {
  await fixture(page, false);
  await page.goto('/predictions');
  await expect(page.getByText('Prediction unavailable', { exact: true })).toHaveCount(8);
  await expect(page.locator('.prediction-price')).toHaveCount(0);
  await fixture(page, true, true);
  await page.reload();
  await expect(page.getByText('Prediction unavailable', { exact: true })).toHaveCount(8);
  await expect(page.locator('.prediction-price')).toHaveCount(0);
});
test('old analysis links redirect to the single prediction page and Research is removed', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/future-analysis');
  await expect(page).toHaveURL(/\/predictions$/);
  await page.goto('/research');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
test('mobile predictions stay readable without horizontal overflow', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/predictions');
  await expect(page.getByText('Experimental prediction', { exact: true })).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/price-predictions-mobile.png', fullPage: true });
});
