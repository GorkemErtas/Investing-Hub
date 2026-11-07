import { expect, test, type Page } from '@playwright/test';
import type { NewsInsightResponse, NewsSymbol } from '@investing-hub/shared/news';
import { newsFixture, unavailableFixture } from './news-fixtures';

async function routes(page: Page, response: (symbol: NewsSymbol) => NewsInsightResponse | null) {
  const apiRequests: { method: string; path: string }[] = [],
    providerRequests: string[] = [];
  await page.route(
    /^https?:\/\/(?:api\.gdeltproject\.org|api\.github\.com|(?:generativelanguage|(?:[\w-]+-)?aiplatform)\.googleapis\.com|bitcoincore\.org|www\.federalreserve\.gov|www\.sec\.gov|blog\.ethereum\.org)\//,
    (route) => {
      providerRequests.push(route.request().url());
      return route.abort();
    },
  );
  await page.route('**/api/**', (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    apiRequests.push({ method: req.method(), path });
    if (path.startsWith('/api/news/insights/')) {
      const fixture = response(path.split('/').at(-1) as NewsSymbol);
      return fixture ? route.fulfill({ json: fixture }) : route.fulfill({ status: 503, json: {} });
    }
    if (path.startsWith('/api/predictions/'))
      return route.fulfill({
        json: {
          symbol: path.split('/').at(-1),
          target: 'next_daily_close',
          horizon: '1d',
          predictionTimestamp: new Date().toISOString(),
          sourceDataTimestamp: null,
          modelVersion: null,
          predictedValue: null,
          evaluationReference: 'TEST FIXTURE',
          status: 'disabled_unvalidated',
          reason: 'TEST FIXTURE: no model approved.',
        },
      });
    if (path === '/api/markets')
      return route.fulfill({
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
      });
    return route.fulfill({ status: 404, json: {} });
  });
  return { apiRequests, providerRequests };
}
const section = (page: Page) =>
  page.getByRole('region', { name: 'News Intelligence', exact: true });

test('Research reads source-only BTC and ETH with honest times, safe links and zero browser provider calls', async ({
  page,
}) => {
  const requests = await routes(page, (symbol) => newsFixture(symbol, { disabledAi: true }));
  await page.goto('/research');
  const news = section(page);
  await expect(news.getByText('AI analysis not enabled', { exact: true })).toBeVisible();
  const btc = news.getByRole('article');
  await expect(btc).toContainText('BTC specific');
  await expect(btc.getByText('Published at').locator('..')).toContainText('Unknown');
  await expect(btc.getByText('Indexed at').locator('..').locator('time')).toHaveAttribute(
    'datetime',
    '2026-11-07T06:00:00.000Z',
  );
  const link = btc.getByRole('link');
  await expect(link).toHaveAttribute('href', 'http://publisher.example.com/bitcoin-fixture');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(news.locator('.news-analysis')).toHaveCount(0);
  await news.getByRole('combobox', { name: 'News asset' }).selectOption('ETHUSDT');
  const eth = news.getByRole('article');
  await expect(eth).toContainText('Ethereum Lighthouse');
  await expect(eth).toContainText('ETH specific');
  await expect(eth.getByText('Published at').locator('..').locator('time')).toHaveAttribute(
    'datetime',
    '2026-10-23T00:41:38.000Z',
  );
  await expect(eth.getByText('Indexed at')).toHaveCount(0);
  await expect(eth).toContainText('Sigma Prime / Lighthouse releases');
  await news.getByRole('button', { name: 'Check cache' }).click();
  await expect(news.getByRole('button', { name: 'Check cache' })).toBeEnabled();
  expect(requests.providerRequests).toEqual([]);
  expect(
    requests.apiRequests
      .filter((r) => r.path.includes('/news/'))
      .every(
        (r) => r.method === 'GET' && /^\/api\/news\/insights\/(BTCUSDT|ETHUSDT)$/.test(r.path),
      ),
  ).toBe(true);
  expect(requests.apiRequests.filter((r) => r.path === '/api/news/insights/ETHUSDT')).toHaveLength(
    2,
  );
  await expect(page.getByRole('heading', { name: 'No published forecast' })).toBeVisible();
  await expect(
    page.getByText(/Inspected history through 2026 is development evidence/),
  ).toBeVisible();
});

test('stale and limited provider coverage stay visible with the last usable headlines', async ({
  page,
}) => {
  const fixture = newsFixture('BTCUSDT', { stale: true });
  fixture.data!.coverage[0] = {
    ...fixture.data!.coverage[0],
    status: 'rate_limited',
    reason: 'http_rate_limit',
    httpStatus: 429,
    elapsedMs: 7654,
    accepted: 0,
  };
  fixture.data!.coverage.push({
    ...fixture.data!.coverage[0],
    sourceId: 'gdelt_eth',
    status: 'cooldown',
    reason: 'local_cooldown',
    httpStatus: null,
    elapsedMs: null,
  });
  await routes(page, () => fixture);
  await page.goto('/research');
  const news = section(page);
  await expect(news.getByText('Stale cached data', { exact: true })).toBeVisible();
  await expect(news.getByRole('article')).toBeVisible();
  await news.locator('summary').click();
  await expect(news.getByText(/HTTP rate limit/)).toBeVisible();
  await expect(news.getByText(/Local cooldown; no request sent/)).toBeVisible();
  await expect(news.getByText(/HTTP 429/)).toBeVisible();
  await expect(news.getByText(/Disabled pending access permission/)).toBeVisible();
});

test('empty valid cache reports insufficient evidence without inventing news', async ({ page }) => {
  await routes(page, (symbol) => newsFixture(symbol, { empty: true }));
  await page.goto('/research');
  const news = section(page);
  await expect(news.getByRole('heading', { name: 'Insufficient news evidence' })).toBeVisible();
  await expect(news.getByRole('article')).toHaveCount(0);
  await expect(news.getByText('AI analysis not enabled', { exact: true })).toBeVisible();
  await news.locator('summary').click();
  await expect(news.getByText(/No matching articles/)).toBeVisible();
});

for (const [reason, heading] of [
  ['disabled', 'News collection is disabled'],
  ['no_snapshot', 'No cached news yet'],
  ['retention_expired', 'Cached news has expired'],
  ['storage_unavailable', 'News cache unavailable'],
] as const)
  test(`unavailable cache: ${reason}`, async ({ page }) => {
    await routes(page, () => unavailableFixture(reason));
    await page.goto('/research');
    await expect(section(page).getByRole('heading', { name: heading })).toBeVisible();
    await expect(section(page).getByRole('article')).toHaveCount(0);
  });

test('only validated AI classifications are displayed with quotes and high uncertainty', async ({
  page,
}) => {
  await routes(page, (symbol) => newsFixture(symbol, { analyzed: true }));
  await page.goto('/research');
  const news = section(page);
  await expect(
    news.getByText('AI classification · high uncertainty', { exact: true }),
  ).toBeVisible();
  await expect(news.locator('blockquote')).toHaveText('TEST FIXTURE Bitcoin ETF source headline');
  await expect(news.getByText('neutral', { exact: true })).toBeVisible();
  await expect(news.getByText('AI analysis not enabled')).toHaveCount(0);
});

test('failed cache recheck keeps headlines and marks them stale', async ({ page }) => {
  let failed = false;
  await routes(page, (symbol) => (failed ? null : newsFixture(symbol)));
  await page.goto('/research');
  const news = section(page);
  await expect(news.getByRole('article')).toBeVisible();
  failed = true;
  await news.getByRole('button', { name: 'Check cache' }).click();
  await expect(news.getByText('Stale cached data', { exact: true })).toBeVisible();
  await expect(news.getByText(/The cache could not be rechecked/)).toBeVisible();
  await expect(news.getByRole('article')).toBeVisible();
});

test('malformed source links are rejected before any headline link is rendered', async ({
  page,
}) => {
  const fixture = newsFixture();
  fixture.data!.events[0].evidence.sourceUrl = 'javascript:alert(1)';
  await routes(page, () => fixture);
  await page.goto('/research');
  const news = section(page);
  await expect(news.getByText(/The news cache could not be loaded/)).toBeVisible();
  await expect(news.getByRole('article')).toHaveCount(0);
  await expect(news.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test('news selection and coverage work on a narrow viewport with keyboard navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await routes(page, (symbol) => newsFixture(symbol));
  await page.goto('/research');
  const news = section(page),
    select = news.getByRole('combobox', { name: 'News asset' });
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(news.getByRole('article')).toContainText('Ethereum Lighthouse');
  await news.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(news.getByText('Lighthouse releases', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/research-news-mobile.png', fullPage: true });
});
