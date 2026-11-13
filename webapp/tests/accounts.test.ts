import { afterEach, describe, expect, it, vi } from 'vitest';
import { account } from '@investing-hub/shared/portfolio';
import { settingsSchema, type SavedPortfolio } from '@investing-hub/shared/mobile';
import { createAccountStore, type AccountStore } from '../src/lib/accounts';

const users = [
  { id: '111111111111111111111111', firstName: 'Ayla', lastName: 'Owner', email: 'a@example.test' },
  { id: '222222222222222222222222', firstName: 'Bora', lastName: 'Owner', email: 'b@example.test' },
];
const stores: AccountStore[] = [];
afterEach(() => {
  stores.splice(0).forEach((store) => store.logout());
  vi.useRealTimers();
});
function fixture() {
  const portfolios = new Map<string, SavedPortfolio[]>();
  const settings = new Map(
    users.map((user) => [user.id, settingsSchema.parse({ selectedCoins: ['BTC', 'UNSUPPORTED'] })]),
  );
  let nextId = 10;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const request = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname,
      method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const token = (init?.headers as Record<string, string>).Authorization?.replace('Bearer ', '');
    const owner = users.find((user) => token === 'token-' + user.id);
    if (path === '/api/capabilities')
      return reply({ accounts: true, registration: false, notifications: false });
    if (path === '/api/auth/login') {
      const user = users.find((item) => item.email === body.email);
      return user && body.password !== 'wrong'
        ? reply({
            user,
            token: 'token-' + user.id,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          })
        : reply({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong login.' } }, 401);
    }
    if (!owner) return reply({ error: { code: 'SESSION_EXPIRED', message: 'Expired.' } }, 401);
    if (path === '/api/me') return reply(owner);
    if (path === '/api/me/settings') {
      const value = { ...settings.get(owner.id)!, ...body };
      if (method === 'PATCH') settings.set(owner.id, value);
      return reply(settings.get(owner.id));
    }
    const list = portfolios.get(owner.id) ?? [];
    if (path === '/api/portfolios' && method === 'GET') return reply(list);
    if (path === '/api/portfolios' && method === 'POST') {
      const value = {
        _id: String(nextId++).padStart(24, '0'),
        name: body.name,
        transactions: [],
        revision: 0,
      };
      portfolios.set(owner.id, [...list, value]);
      return reply(value, 201);
    }
    const [, , , id, , transactionId] = path.split('/');
    const value = list.find((item) => item._id === id);
    if (!value)
      return reply({ error: { code: 'PORTFOLIO_NOT_FOUND', message: 'Not found.' } }, 404);
    if (path.endsWith('/transactions') || transactionId) {
      const transactions =
        method === 'POST'
          ? [...value.transactions, { ...body, id: String(nextId++).padStart(24, '0') }]
          : method === 'PUT'
            ? value.transactions.map((t) =>
                t.id === transactionId ? { ...body, id: transactionId } : t,
              )
            : value.transactions.filter((t) => t.id !== transactionId);
      try {
        account(transactions);
      } catch {
        return reply({ error: { code: 'INVALID_LEDGER', message: 'Invalid.' } }, 400);
      }
      value.transactions = transactions;
    } else if (method === 'DELETE') {
      portfolios.set(
        owner.id,
        list.filter((p) => p !== value),
      );
      return reply({ message: 'Deleted.' });
    } else if (method === 'PATCH') value.name = body.name;
    value.revision++;
    return reply(value);
  });
  const store = createAccountStore({ baseUrl: 'https://investing.example.test', request });
  stores.push(store);
  async function login(email = users[0].email) {
    await store.login({ email, password: 'test-only-password' });
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false));
  }
  return { store, request, login };
}
const trade = {
  id: 'temporary-ui-id',
  symbol: 'BTCUSDT' as const,
  side: 'buy' as const,
  quantity: '2',
  price: '100.12345678',
  fee: '1',
  timestamp: '2024-01-01T00:00:00.000Z',
};

describe('memory-only web accounts', () => {
  it('bootstraps /me and never attaches a bearer to login or public requests', async () => {
    const { store, request, login } = fixture();
    expect(store.getSnapshot().session).toBeNull();
    await login();
    await store.capabilities();
    expect(store.getSnapshot().session?.user).toEqual(users[0]);
    expect(
      request.mock.calls.find(([url]) => String(url).endsWith('/me'))?.[1]?.headers,
    ).toHaveProperty('Authorization', 'Bearer token-' + users[0].id);
    for (const [url, init] of request.mock.calls.filter(([url]) =>
      /login|capabilities/.test(String(url)),
    )) {
      expect(init?.headers, String(url)).not.toHaveProperty('Authorization');
    }
    const fresh = createAccountStore({ baseUrl: 'https://investing.example.test', request });
    expect(fresh.getSnapshot().session).toBeNull();
  });

  it('keeps a failed login unauthenticated without fetching private data', async () => {
    const { store, request } = fixture();
    await expect(store.login({ email: users[0].email, password: 'wrong' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(store.getSnapshot().session).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses existing CRUD/trade APIs and server IDs, preserves precision and rejects oversells', async () => {
    const { store, login } = fixture();
    await login();
    await store.create('Private');
    const id = store.getSnapshot().selected!;
    await store.rename(id, 'Renamed');
    await store.saveTrade(id, trade, false);
    const saved = store.getSnapshot().portfolios[0].transactions[0];
    expect(saved.id).toMatch(/^[a-f\d]{24}$/);
    expect(saved.id).not.toBe(trade.id);
    expect(saved.price).toBe('100.12345678');
    await store.saveTrade(id, { ...saved, quantity: '3' }, true);
    await expect(
      store.saveTrade(id, { ...trade, side: 'sell', quantity: '4' }, false),
    ).rejects.toMatchObject({ code: 'INVALID_LEDGER' });
    expect(store.getSnapshot().portfolios[0].transactions).toHaveLength(1);
    await store.removeTrade(id, saved.id);
    expect(store.getSnapshot().portfolios[0].transactions).toEqual([]);
    await store.remove(id);
    expect(store.getSnapshot().portfolios).toEqual([]);
  });

  it('isolates users and updates only account settings, preserving unsupported favorites', async () => {
    const { store, login } = fixture();
    await login();
    await store.create('Ayla private');
    const id = store.getSnapshot().selected!;
    await store.watch('SOLUSDT');
    await store.theme('dark');
    expect(store.getSnapshot().settings?.selectedCoins).toEqual(['BTC', 'UNSUPPORTED', 'SOL']);
    store.logout();
    expect(store.getSnapshot().portfolios).toEqual([]);
    expect(store.getSnapshot().settings).toBeNull();
    await login(users[1].email);
    expect(store.getSnapshot().portfolios).toEqual([]);
    await expect(store.rename(id, 'Stolen')).rejects.toMatchObject({ status: 404 });
    expect(store.getSnapshot().portfolios).toEqual([]);
    store.logout();
    await login();
    expect(store.getSnapshot().portfolios[0].name).toBe('Ayla private');
  });

  it('expires automatically and clears every private response', async () => {
    vi.useFakeTimers();
    const { store, login } = fixture();
    await login();
    await store.create('Private');
    await vi.advanceTimersByTimeAsync(3600001);
    expect(store.getSnapshot()).toMatchObject({
      session: null,
      portfolios: [],
      settings: null,
      notice: 'accounts.expired',
    });
    await expect(store.create('Expired write')).rejects.toMatchObject({ status: 401 });
  });

  it('discards a login bootstrap that finishes after cancellation', async () => {
    const { store, request } = fixture();
    let finish: (response: Response) => void = () => {};
    request.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            user: users[0],
            token: 'secret',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          }),
        ),
    );
    request.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = store.login({ email: users[0].email, password: 'test-password' });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    store.cancelLogin();
    finish(new Response(JSON.stringify(users[0])));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(store.getSnapshot().session).toBeNull();
  });

  it.each([200, 401])(
    'ignores a late %s from an old session after another user logs in',
    async (status) => {
      const { store, request, login } = fixture();
      await login();
      let finish: (response: Response) => void = () => {};
      let started = false;
      request.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            started = true;
            finish = resolve;
          }),
      );
      const pending = store.create('Late request');
      const rejected = expect(pending).rejects.toMatchObject({ status: 401 });
      await vi.waitFor(() => expect(started).toBe(true));
      store.logout();
      await login(users[1].email);
      finish(
        new Response(
          JSON.stringify(
            status === 401
              ? { error: { code: 'SESSION_EXPIRED', message: 'Expired.' } }
              : {
                  _id: '333333333333333333333333',
                  name: 'Other user private',
                  transactions: [],
                  revision: 0,
                },
          ),
          { status },
        ),
      );
      await rejected;
      expect(store.getSnapshot().session?.user.id).toBe(users[1].id);
      expect(store.getSnapshot().portfolios).toEqual([]);
    },
  );

  it('clears the active session on a server 401 without affecting public requests', async () => {
    const { store, request, login } = fixture();
    await login();
    await store.create('Private');
    request.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Expired.' } }), {
          status: 401,
        }),
    );
    await expect(store.create('Rejected')).rejects.toMatchObject({ status: 401 });
    expect(store.getSnapshot()).toMatchObject({
      session: null,
      portfolios: [],
      settings: null,
      notice: 'accounts.expired',
    });
    await expect(store.capabilities()).resolves.toHaveProperty('accounts', true);
  });

  it('keeps account outages recoverable without fabricating saved portfolios', async () => {
    const { store, request, login } = fixture();
    await login();
    request.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'ACCOUNTS_UNAVAILABLE', message: 'Unavailable.' } }),
          { status: 503 },
        ),
    );
    await store.reload();
    expect(store.getSnapshot().error).toBe('errors.ACCOUNTS_UNAVAILABLE');
    expect(store.getSnapshot().session?.user.id).toBe(users[0].id);
    await store.reload();
    expect(store.getSnapshot().error).toBe('');
  });
});
