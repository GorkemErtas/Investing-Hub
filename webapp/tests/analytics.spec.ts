import { expect, test, type Page } from '@playwright/test';
import { assets, type Symbol } from '../../shared/contracts';
import { analyticsResponseFixture } from '../../shared/tests/analytics-fixtures';

async function fixture(page: Page) {
  let calls = 0,
    paid = 0;
  await page.route('**/api/future-analysis/*/review', (r) => {
    paid++;
    return r.fulfill({ status: 500, json: { error: { code: 'UNEXPECTED' } } });
  });
  await page.route('**/api/analytics/**', (r) => {
    calls++;
    expect(r.request().method()).toBe('GET');
    const symbol = new URL(r.request().url()).pathname.split('/').at(-1) as Symbol;
    return r.fulfill({ json: analyticsResponseFixture(symbol) });
  });
  return { calls: () => calls, paid: () => paid };
}
test('Analytics Lab renders quantitative research, filters, provenance and keeps Future Analysis separate', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Bitcoin data overview' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Daily return distribution/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Classification & rare events' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Direction classification · fold 3' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Anomaly detection', exact: true })).toBeVisible();
  await expect(page.getByText(/No genuine evaluated prospective observations/)).toBeVisible();
  await page.getByLabel('Research target').selectOption('extreme_event');
  await expect(
    page.getByText('Insufficient contiguous history for chronological classification.'),
  ).toBeVisible();
  await page.getByLabel('Alert method').selectOption('isolation_forest');
  await expect(page.getByText('No qualifying observed alerts in this view.')).toBeVisible();
  await page.getByLabel('Alert method').selectOption('all');
  await expect(page.getByRole('cell', { name: '4.000 / 3.000' })).toBeVisible();
  expect(f.paid()).toBe(0);
  expect(f.calls()).toBeGreaterThanOrEqual(1);
  await page.getByLabel('Research target').selectOption('direction');
  await page.screenshot({ path: 'test-results/analytics-desktop.png', fullPage: true });
});
test('all eight assets have explicit available or no-data states', async ({ page }) => {
  await fixture(page);
  await page.goto('/analytics');
  const selector = page.getByRole('combobox', { name: 'Analytics asset' });
  await expect(selector.locator('option')).toHaveCount(8);
  for (const asset of assets) {
    await selector.selectOption(asset.symbol);
    await expect(page.getByRole('heading', { name: `${asset.name} data overview` })).toBeVisible();
    if (!['BTCUSDT', 'ETHUSDT'].includes(asset.symbol)) {
      await expect(page.getByRole('heading', { name: 'No verified observations' })).toBeVisible();
      await expect(page.getByRole('table', { name: /classification/ })).toHaveCount(0);
    }
  }
});
test('loading, disabled, failure and invalid export never invent metrics', async ({ page }) => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/analytics/**', async (route) => {
    await gate;
    await route.fulfill({
      json: {
        symbol: 'BTCUSDT',
        status: 'disabled',
        reason: 'local_analytics_disabled',
        report: null,
      },
    });
  });
  await page.goto('/analytics');
  await expect(page.getByLabel('Loading data')).toBeVisible();
  finish();
  await expect(page.getByRole('heading', { name: 'Research report unavailable' })).toBeVisible();
  await expect(page.getByText(/only on localhost in development/)).toBeVisible();
  await page.unroute('**/api/analytics/**');
  await page.route('**/api/analytics/**', (r) =>
    r.fulfill({ status: 500, json: { error: { code: 'INTERNAL_ERROR' } } }),
  );
  await page.getByRole('button', { name: 'Check report' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/analytics/**');
  await page.route('**/api/analytics/**', (r) =>
    r.fulfill({ json: { symbol: 'BTCUSDT', status: 'available', report: { malformed: true } } }),
  );
  await page.getByRole('button', { name: 'Check report' }).click();
  await expect(page.getByText('The service returned data we could not validate.')).toBeVisible();
});
test('mobile Analytics Lab stays readable without horizontal page overflow', async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/analytics');
  await expect(page.getByRole('heading', { name: 'Bitcoin data overview' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/analytics-mobile.png', fullPage: true });
});
