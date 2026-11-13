import { expect, test, type Page } from '@playwright/test';
import { assets, type Symbol } from '../../shared/contracts';
import { account } from '../../shared/portfolio';
import { settingsSchema, type SavedPortfolio } from '../../shared/mobile';
import { predictionFixture } from '../../shared/tests/predictions-fixtures';

// Explicit test HTTP fixtures. Real authentication/ownership remain covered by
// backend integration tests; no test bypass exists in application code.
async function fixture(
  page: Page,
  options: { registration?: boolean; english?: boolean; accounts?: boolean } = {},
) {
  if (options.english !== false)
    await page.addInitScript(() => {
      if (!localStorage.getItem('ih:language:v1'))
        localStorage.setItem('ih:language:v1', JSON.stringify('en-US'));
    });
  let unavailable = false;
  let nextId = 10;
  const users = [
    {
      id: '111111111111111111111111',
      firstName: 'Ayla',
      lastName: 'Owner',
      email: 'a@example.test',
    },
    {
      id: '222222222222222222222222',
      firstName: 'Bora',
      lastName: 'Owner',
      email: 'b@example.test',
    },
  ];
  const portfolios = new Map<string, SavedPortfolio[]>();
  const settings = new Map(
    users.map((user) => [
      user.id,
      settingsSchema.parse({ theme: 'dark', selectedCoins: ['BTC', 'UNSUPPORTED'] }),
    ]),
  );
  const writes: string[] = [];
  let loginCount = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    const body = request.postDataJSON() ?? {};
    const response = (json: unknown, status = 200) => route.fulfill({ json, status });
    const error = (code: string, status: number) =>
      response({ error: { code, message: 'Test fixture error' } }, status);
    const now = new Date().toISOString();
    const meta = {
      provider: 'Binance public market data',
      quoteCurrency: 'USDT',
      fetchedAt: now,
      sourceTime: now,
      stale: false,
    };
    if (path === '/api/capabilities')
      return response({
        accounts: options.accounts !== false && !unavailable,
        registration: options.registration !== false,
        notifications: false,
      });
    if (path === '/api/markets')
      return response({
        meta,
        data: assets.map((asset, index) => ({
          symbol: asset.symbol,
          price: 100 + index,
          change24h: index,
          high24h: 120,
          low24h: 90,
          quoteVolume: 100000,
          sourceTime: now,
        })),
      });
    if (path.startsWith('/api/predictions/'))
      return response(predictionFixture(path.split('/').at(-1) as Symbol, Date.now()));
    if (path.startsWith('/api/candles/'))
      return response({
        meta,
        symbol: path.split('/').at(-1),
        interval: new URL(request.url()).searchParams.get('interval'),
        data: [],
      });
    if (unavailable) return error('ACCOUNTS_UNAVAILABLE', 503);
    if (path === '/api/auth/register') {
      if (options.registration === false) return error('REGISTRATION_DISABLED', 503);
      writes.push('register');
      return response({ message: 'Code sent if available.' }, 202);
    }
    if (path === '/api/auth/verify')
      return body.verificationCode === '123456'
        ? response({ message: 'Verified.' }, 201)
        : error('INVALID_VERIFICATION', 400);
    if (path === '/api/auth/login') {
      loginCount++;
      const user = users.find((value) => value.email === body.email);
      return user && body.password !== 'wrong'
        ? response({
            user,
            token: 'fixture-token-' + user.id,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          })
        : error('INVALID_CREDENTIALS', 401);
    }
    const user = users.find(
      (value) => request.headers().authorization === 'Bearer fixture-token-' + value.id,
    );
    if (!user) return error('UNAUTHENTICATED', 401);
    if (path === '/api/me') return response(user);
    if (path === '/api/me/settings') {
      if (method === 'PATCH') {
        writes.push('settings');
        settings.set(user.id, { ...settings.get(user.id)!, ...body });
      }
      return response(settings.get(user.id));
    }
    const list = portfolios.get(user.id) ?? [];
    if (path === '/api/portfolios' && method === 'GET') return response(list);
    if (path === '/api/portfolios' && method === 'POST') {
      const value = {
        _id: String(nextId++).padStart(24, '0'),
        name: body.name,
        transactions: [],
        revision: 0,
      };
      portfolios.set(user.id, [...list, value]);
      writes.push('create');
      return response(value, 201);
    }
    const [, , , id, , tradeId] = path.split('/');
    const value = list.find((item) => item._id === id);
    if (!value) return error('PORTFOLIO_NOT_FOUND', 404);
    if (path.endsWith('/transactions') || tradeId) {
      const transactions =
        method === 'POST'
          ? [...value.transactions, { ...body, id: String(nextId++).padStart(24, '0') }]
          : method === 'PUT'
            ? value.transactions.map((trade) =>
                trade.id === tradeId ? { ...body, id: tradeId } : trade,
              )
            : value.transactions.filter((trade) => trade.id !== tradeId);
      try {
        account(transactions);
      } catch {
        return error('INVALID_LEDGER', 400);
      }
      value.transactions = transactions;
      writes.push('trade:' + method);
    } else if (method === 'PATCH') {
      value.name = body.name;
      writes.push('rename');
    } else if (method === 'DELETE') {
      portfolios.set(
        user.id,
        list.filter((item) => item !== value),
      );
      writes.push('delete');
      return response({ message: 'Deleted.' });
    }
    value.revision++;
    return response(value);
  });
  return {
    writes,
    portfolios,
    settings,
    users,
    down() {
      unavailable = true;
    },
    loginCount: () => loginCount,
  };
}
async function login(page: Page, email = 'a@example.test') {
  await page.locator('.topbar').getByRole('button', { name: 'Sign In', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByLabel('Password', { exact: true }).fill('test-only-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Loading your saved account data…')).not.toBeVisible();
  await expect(page.locator('.topbar')).toContainText('Account workspace');
}
async function storage(page: Page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
}

test('first visit stays in Guest Demo when accounts are disabled', async ({ page }) => {
  const state = await fixture(page, { accounts: false, registration: false });
  await page.goto('/portfolio');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.topbar')).toContainText(/Guest demo/i);
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeEnabled();
  await page.locator('.topbar').getByRole('button', { name: 'Sign In' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Accounts are currently unavailable/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create account' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Continue Guest Demo' }).click();
  await expect(page.getByRole('heading', { name: 'Your portfolio.' })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('registration requires capabilities and login errors are localized in both languages', async ({
  page,
}) => {
  await fixture(page, { registration: false });
  await page.goto('/');
  await page.locator('.topbar').getByRole('button', { name: 'Sign In' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/verification email is not configured/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create account' })).toBeDisabled();
  await dialog.getByLabel('Email address').fill('a@example.test');
  await dialog.getByLabel('Password', { exact: true }).fill('wrong');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(dialog.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(dialog.getByLabel('Password', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Continue Guest Demo' }).click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('tr-TR');
  await page
    .locator('.topbar')
    .getByRole('button', { name: /giriş yap/i })
    .click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Doğrulama e-postası/)).toBeVisible();
  await dialog.getByLabel('E-posta adresi').fill('a@example.test');
  await dialog.getByLabel('Parola', { exact: true }).fill('wrong');
  await dialog
    .getByRole('button', { name: /giriş yap/i })
    .last()
    .click();
  await expect(dialog.getByRole('alert')).toHaveText('E-posta veya parola hatalı.');
});

test('register and verify email before explicitly signing in, without persisting credentials', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/portfolio');
  await page.locator('.topbar').getByRole('button', { name: 'Sign In' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create account', exact: true }).first().click();
  await dialog.getByLabel('First name').fill('Ayla');
  await dialog.getByLabel('Last name').fill('Owner');
  await dialog.getByLabel('Email address').fill('a@example.test');
  await dialog.getByLabel('Password', { exact: true }).fill('test-only-password');
  await dialog.getByRole('button', { name: 'Create account', exact: true }).last().click();
  await expect(dialog.getByText(/Enter it within 10 minutes/)).toBeVisible();
  await dialog.getByLabel('Six-digit email code').fill('000000');
  await dialog.getByRole('button', { name: 'Verify email', exact: true }).last().click();
  await expect(dialog.getByRole('alert')).toContainText('invalid or expired');
  await dialog.getByLabel('Six-digit email code').fill('123456');
  await dialog.getByRole('button', { name: 'Verify email', exact: true }).last().click();
  await expect(dialog.getByText('Email verified. You can now sign in.')).toBeVisible();
  expect(state.loginCount()).toBe(0);
  await dialog.getByLabel('Password', { exact: true }).fill('test-only-password');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByText(/Your account has no portfolios yet/)).toBeVisible();
  expect(JSON.stringify(await storage(page))).not.toMatch(
    /fixture-token|test-only-password|a@example.test/,
  );
  expect(state.writes).toEqual(['register']);
});

test('account CRUD, trade editing/deletion and preferences use the API while guest data stays unchanged', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/portfolio');
  await page.getByRole('button', { name: 'Rename portfolio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Portfolio name' }).fill('My guest workspace');
  await page.getByRole('button', { name: 'Save name' }).click();
  const guest = await storage(page);
  await login(page);
  await expect(page.getByText(/Your account has no portfolios yet/)).toBeVisible();
  await page.getByRole('button', { name: 'New portfolio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Rename portfolio', exact: true }).click();
  await page.getByRole('textbox', { name: 'Portfolio name' }).fill('Cloud practice');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('combobox', { name: 'Active portfolio' })).toContainText(
    'Cloud practice',
  );
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Quantity', { exact: true }).fill('2');
  await dialog.getByLabel('Price in USDT').fill('100.12345678');
  await dialog.getByLabel('Date & time (your local time)').fill('2024-01-01T12:00');
  await dialog.getByRole('button', { name: 'Save simulated transaction' }).click();
  await expect(dialog).not.toBeVisible();
  const firstTrade = state.portfolios.get(state.users[0].id)![0].transactions[0];
  expect(firstTrade.price).toBe('100.12345678');
  expect(firstTrade.id).toMatch(/^[a-f\d]{24}$/);
  await page.getByRole('button', { name: /Edit buy BTCUSDT/i }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Quantity', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Save simulated transaction' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /Remove buy BTCUSDT/i }).click();
  await expect(
    page.getByText('Your simulated transaction history will appear here.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'Add Solana to watchlist' }).click();
  await expect(page.getByRole('button', { name: 'Remove Solana from watchlist' })).toBeVisible();
  expect(state.settings.get(state.users[0].id)?.selectedCoins).toEqual([
    'BTC',
    'UNSUPPORTED',
    'SOL',
  ]);
  expect(await storage(page)).toEqual(guest);
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await page.getByRole('button', { name: 'Delete portfolio', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete portfolio', exact: true }).last().click();
  await expect(page.getByText(/Your account has no portfolios yet/)).toBeVisible();
  await page.locator('.topbar').getByRole('button', { name: 'Log Out' }).click();
  await expect(page.getByRole('combobox', { name: 'Active portfolio' })).toContainText(
    'My guest workspace',
  );
  expect(await storage(page)).toEqual(guest);
  expect(state.writes).toEqual([
    'create',
    'rename',
    'trade:POST',
    'trade:PUT',
    'trade:DELETE',
    'settings',
    'settings',
    'delete',
  ]);
});

test('refresh returns to Guest Demo and switching users never displays another account portfolio', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/portfolio');
  await login(page);
  await page.getByRole('button', { name: 'New portfolio', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Active portfolio' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.topbar')).toContainText(/Guest demo/i);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.loginCount()).toBe(1);
  await login(page, 'b@example.test');
  await expect(page.getByText(/Your account has no portfolios yet/)).toBeVisible();
  await page.locator('.topbar').getByRole('button', { name: 'Log Out' }).click();
  await login(page);
  await expect(page.getByRole('combobox', { name: 'Active portfolio' })).toBeVisible();
  expect(JSON.stringify(await storage(page))).not.toContain('fixture-token');
});

test('expiry clears the account view and restores the guest portfolio without a forced login dialog', async ({
  page,
}) => {
  await page.clock.install();
  await fixture(page);
  await page.goto('/portfolio');
  await login(page);
  await page.getByRole('button', { name: 'New portfolio', exact: true }).click();
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.fastForward(3600001);
  await expect(page.locator('.topbar')).toContainText(/Guest demo/i);
  await expect(page.getByText(/Your sign-in expired/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Mongo outage does not block public pages, predictions or returning to Guest Demo', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.goto('/portfolio');
  await login(page);
  state.down();
  await page.getByRole('button', { name: 'New portfolio', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Account storage is unavailable');
  await page.getByRole('link', { name: 'Price Predictions', exact: true }).click();
  await expect(page.getByText('Experimental prediction', { exact: true })).toHaveCount(8);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.market-table tbody tr')).toHaveCount(8);
  await page.locator('.topbar').getByRole('button', { name: 'Log Out' }).click();
  await page.getByRole('link', { name: 'Portfolio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeEnabled();
  expect(state.writes).toEqual([]);
});

test('Turkish account dialog works on a narrow light screen and Escape returns focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await fixture(page, { english: false });
  await page.addInitScript(() => localStorage.setItem('ih:theme:v1', JSON.stringify('light')));
  await page.goto('/');
  const signIn = page.locator('.topbar').getByRole('button', { name: /giriş yap/i });
  await signIn.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Hesap oluştur', exact: true }).first().click();
  await expect(dialog.getByLabel('Ad', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('E-posta adresi')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/accounts-tr-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(signIn).toBeFocused();
});
