import { expect, test, type Page } from '@playwright/test';
import { assets, type Symbol } from '../../shared/contracts';
import {
  analysisFixture,
  reviewFixture,
  experimentalFixture,
  fixtureFingerprint,
} from '../../shared/tests/future-fixtures';

async function fixtures(page: Page, ready = true, disabled = false) {
  let paidCalls = 0;
  await page.route('**/api/markets', (route) =>
    route.fulfill({
      json: {
        data: [],
        meta: {
          provider: 'Binance public market data',
          quoteCurrency: 'USDT',
          fetchedAt: new Date().toISOString(),
          sourceTime: new Date().toISOString(),
          stale: false,
        },
      },
    }),
  );
  await page.route('**/api/future-analysis/**', async (route) => {
    const req = route.request(),
      symbol = new URL(req.url()).pathname.split('/')[3] as Symbol;
    const result = analysisFixture(symbol, Date.now(), ready);
    const mode =
      req.method() === 'POST'
        ? (req.postDataJSON().mode ?? 'approved')
        : (new URL(req.url()).searchParams.get('mode') ?? 'approved');
    if (mode === 'experimental') {
      result.mode = 'experimental';
      if (ready) result.ml = experimentalFixture(symbol, Date.now());
      result.forecastFingerprint = fixtureFingerprint(result.ml, result.mlFreshness, mode);
    }
    if (disabled)
      result.research = { status: 'disabled', reason: 'paid_review_disabled', data: null };
    if (req.method() === 'POST') {
      paidCalls++;
      expect(req.postDataJSON()).toEqual({
        allowPaid: true,
        requestId: expect.any(String),
        ...(mode === 'experimental' ? { mode } : {}),
      });
      result.research = {
        status: 'available',
        reason: null,
        data: reviewFixture(result.ml, result.forecastFingerprint, Date.now()),
      };
      result.conflict = ready ? 'CONFLICTING_EVIDENCE' : null;
    }
    await route.fulfill({ json: result, headers: { 'Cache-Control': 'private, no-store' } });
  });
  return { calls: () => paidCalls };
}
test('one coherent report keeps ML authoritative and requests ML-only AI interpretation only after consent', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/future-analysis?mode=approved');
  await expect(page.getByRole('heading', { name: 'Price forecast', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '101.00', exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Calibrated interval/ })).toBeVisible();
  const button = page.getByRole('button', { name: 'Request critical review' });
  await expect(button).toBeDisabled();
  expect(fixture.calls()).toBe(0);
  await page.getByRole('checkbox').check();
  await button.click();
  await expect(page.getByText('CONFLICTING EVIDENCE', { exact: true })).toBeVisible();
  await expect(page.getByText(/Conflicting evidence: the Gemini review challenges/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /bullish scenario/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What to monitor' })).toBeVisible();
  await expect(
    page.getByText(
      'AI interpretation of supplied ML data. No live research, current news or web sources.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'AI interpretation & limitations' }),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.future-report a[href^="http"]')).toHaveCount(0);
  expect(fixture.calls()).toBe(1);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('TEST FIXTURE');
  await page.screenshot({ path: 'test-results/future-analysis-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.getByText('NOT REVIEWED', { exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(fixture.calls()).toBe(1);
  expect(errors).toEqual([]);
});
test('all canonical assets are selectable and consent/report clear when changing coin', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.goto('/research?mode=approved');
  const selector = page.getByRole('combobox', { name: 'Analysis coin' });
  await expect(selector.locator('option')).toHaveCount(assets.length);
  for (const asset of assets) {
    await selector.selectOption(asset.symbol);
    await expect(page.getByRole('article')).toHaveAttribute(
      'aria-label',
      `${asset.name} Future Analysis report`,
    );
    await expect(page.getByRole('heading', { name: 'Price forecast', exact: true })).toBeVisible();
  }
  expect(fixture.calls()).toBe(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request critical review' }).click();
  await expect(page.getByText('CONFLICTING EVIDENCE', { exact: true })).toBeVisible();
  await selector.selectOption('SOLUSDT');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.locator('iframe')).toHaveCount(0);
});
test('missing ML disables paid interpretation without inventing a forecast or report', async ({
  page,
}) => {
  const fixture = await fixtures(page, false);
  await page.goto('/future-analysis?mode=approved&symbol=SOLUSDT');
  await expect(page.getByRole('heading', { name: 'No validated ML forecast' })).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request critical review' })).toBeDisabled();
  await expect(page.getByRole('img', { name: /Calibrated interval/ })).toHaveCount(0);
  await expect(page.locator('.future-direction')).toHaveCount(0);
  expect(fixture.calls()).toBe(0);
});

test('paid review disabled by default while validated ML remains visible', async ({ page }) => {
  const fixture = await fixtures(page, true, true);
  await page.goto('/future-analysis?mode=approved');
  await expect(page.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request critical review' })).toBeDisabled();
  await expect(page.getByRole('img', { name: /Calibrated interval/ })).toBeVisible();
  expect(fixture.calls()).toBe(0);
});
test('Gemini outage keeps ML and never fabricates scenarios', async ({ page }) => {
  await fixtures(page);
  await page.route('**/api/future-analysis/*/review', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } }),
  );
  await page.goto('/future-analysis?mode=approved');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request critical review' }).click();
  await expect(
    page.getByText('The review service is unavailable. Your ML forecast remains unchanged.'),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Calibrated interval/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bullish scenario' })).toHaveCount(0);
});
test('mobile layout preserves one report without horizontal overflow', async ({ page }) => {
  await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/future-analysis?mode=approved&symbol=LINKUSDT');
  await expect(page.getByRole('heading', { name: 'Price forecast', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request critical review' }).click();
  await expect(page.getByText('CONFLICTING EVIDENCE', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/future-analysis-mobile.png', fullPage: true });
});

test('experimental mode is the default for all eight coins without performance approval or invented intervals', async ({
  page,
}) => {
  const fixture = await fixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/future-analysis');
  await expect(page.getByRole('combobox', { name: 'Forecast mode' })).toHaveValue('experimental');
  const selector = page.getByRole('combobox', { name: 'Analysis coin' });
  for (const asset of assets) {
    await selector.selectOption(asset.symbol);
    await expect(page.getByRole('heading', { name: '101.00', exact: false })).toBeVisible();
    await expect(page.locator('.future-report-status')).toContainText(
      'Experimental / Not validated',
    );
    await expect(
      page.getByText('No valid model-derived interval is available.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: /Calibrated interval/ })).toHaveCount(0);
    await expect(page.locator('.future-direction')).toHaveText('UP');
  }
  await page.getByText('Model evidence & methodology').click();
  await expect(page.getByText('0 (not required for experimental display)')).toBeVisible();
  expect(fixture.calls()).toBe(0);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Request critical review' }).click();
  await expect(page.getByText('CONFLICTING EVIDENCE', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '101.00', exact: false })).toBeVisible();
  expect(fixture.calls()).toBe(1);
  await expect(
    page.getByText(
      'AI interpretation of experimental ML data. No live research, current news or web sources.',
    ),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/future-experimental-mobile.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Forecast mode' }).selectOption('approved');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.future-report-status')).toContainText('APPROVED ML EVIDENCE');
  await expect(page.getByRole('img', { name: /Calibrated interval/ })).toBeVisible();
  expect(fixture.calls()).toBe(1);
});
