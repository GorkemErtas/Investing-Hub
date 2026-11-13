import { ApiError, createApiClient } from '@investing-hub/shared/client';
import { assets, type Symbol } from '@investing-hub/shared/contracts';
import {
  loginSchema,
  portfolioMetadataSchema,
  registerSchema,
  tradeSchema,
  verifySchema,
  type SavedPortfolio,
  type Settings,
  type User,
} from '@investing-hub/shared/mobile';
import { validatePortfolio, type Transaction } from '@investing-hub/shared/portfolio';
import { errorKey } from '@investing-hub/shared/localization';

export const portfolioView = (value: SavedPortfolio) =>
  validatePortfolio({
    version: 1,
    name: value.name,
    transactions: value.transactions,
  });
type Client = ReturnType<typeof createApiClient>;
interface AccountState {
  session: { user: User; expiresAt: string; scope: number } | null;
  portfolios: SavedPortfolio[];
  settings: Settings | null;
  selected: string | null;
  loading: boolean;
  busy: boolean;
  error: string;
  notice: string;
}
const empty = (): AccountState => ({
  session: null,
  portfolios: [],
  settings: null,
  selected: null,
  loading: false,
  busy: false,
  error: '',
  notice: '',
});

// Tokens and all private responses live only in this store's memory. Each login
// gets its own client/epoch so late responses cannot affect a different user.
export function createAccountStore(options: { baseUrl: string; request?: typeof fetch }) {
  const publicApi = createApiClient(options);
  let state = empty();
  let epoch = 0;
  let client: Client | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function publish(patch: Partial<AccountState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  }
  function logout(expired = false) {
    epoch++;
    clearTimeout(expiry);
    client = null;
    state = { ...empty(), notice: expired ? 'accounts.expired' : '' };
    listeners.forEach((listener) => listener());
  }
  function checkExpiry() {
    if (state.session && Date.parse(state.session.expiresAt) <= Date.now()) logout(true);
  }
  function authenticated() {
    checkExpiry();
    if (!state.session || !client) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in again.');
    return client;
  }
  async function reload() {
    const api = authenticated(),
      version = epoch;
    if (state.busy || state.loading) return;
    publish({ loading: true, error: '' });
    try {
      const [portfolios, settings] = await Promise.all([api.portfolios(), api.settings()]);
      portfolios.forEach(portfolioView);
      if (version === epoch)
        publish({
          portfolios,
          settings,
          selected: portfolios.some((p) => p._id === state.selected)
            ? state.selected
            : (portfolios[0]?._id ?? null),
        });
    } catch (error) {
      if (version === epoch) publish({ error: errorKey(error) });
    } finally {
      if (version === epoch) publish({ loading: false });
    }
  }
  async function mutate<T>(
    operation: (api: Client) => Promise<T>,
    apply: (result: T) => Partial<AccountState>,
    reportError = false,
  ) {
    const api = authenticated(),
      version = epoch;
    if (state.busy || state.loading || !state.settings)
      throw new ApiError(503, 'ACCOUNTS_UNAVAILABLE', 'Account data is not ready.');
    publish({ busy: true, error: '' });
    try {
      const result = await operation(api);
      if (version !== epoch) throw new ApiError(401, 'SESSION_EXPIRED', 'Session changed.');
      publish(apply(result));
    } catch (error) {
      if (version === epoch && reportError) publish({ error: errorKey(error) });
      throw error;
    } finally {
      if (version === epoch) publish({ busy: false });
    }
  }
  function replace(portfolio: SavedPortfolio) {
    portfolioView(portfolio);
    return { portfolios: state.portfolios.map((p) => (p._id === portfolio._id ? portfolio : p)) };
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    capabilities: publicApi.capabilities,
    register(input: unknown) {
      return publicApi.register(registerSchema.parse(input));
    },
    verify(input: unknown) {
      return publicApi.verify(verifySchema.parse(input));
    },
    async login(input: unknown) {
      const body = loginSchema.parse(input);
      logout();
      const version = epoch;
      const result = await publicApi.login(body);
      const expiresAt = Date.parse(result.expiresAt);
      if (expiresAt <= Date.now()) throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired.');
      const api = createApiClient({
        ...options,
        token: async () => {
          if (version !== epoch) return null;
          if (expiresAt <= Date.now()) {
            logout(true);
            return null;
          }
          return result.token;
        },
        unauthorized: () => {
          if (version === epoch) logout(true);
        },
      });
      const user = await api.me();
      if (version !== epoch) throw new ApiError(401, 'SESSION_EXPIRED', 'Session changed.');
      if (user.id !== result.user.id)
        throw new ApiError(502, 'INVALID_RESPONSE', 'Account identity mismatch.');
      client = api;
      clearTimeout(expiry);
      publish({ ...empty(), session: { user, expiresAt: result.expiresAt, scope: version } });
      expiry = setTimeout(checkExpiry, Math.min(expiresAt - Date.now(), 2147483647));
      void reload();
    },
    logout,
    checkExpiry,
    reload,
    cancelLogin() {
      if (!state.session) epoch++;
    },
    select(index: number) {
      publish({ selected: state.portfolios[index]?._id ?? null });
    },
    create(name: string) {
      return mutate(
        (api) => api.createPortfolio(portfolioMetadataSchema.parse({ name })),
        (portfolio) => {
          portfolioView(portfolio);
          return { portfolios: [...state.portfolios, portfolio], selected: portfolio._id };
        },
      );
    },
    rename(id: string, name: string) {
      return mutate(
        (api) => api.updatePortfolio(id, portfolioMetadataSchema.parse({ name })),
        replace,
      );
    },
    remove(id: string) {
      return mutate(
        (api) => api.deletePortfolio(id),
        () => {
          const portfolios = state.portfolios.filter((p) => p._id !== id);
          return {
            portfolios,
            selected: state.selected === id ? (portfolios[0]?._id ?? null) : state.selected,
          };
        },
      );
    },
    saveTrade(id: string, transaction: Transaction, editing: boolean) {
      const { id: transactionId, ...input } = transaction;
      const body = tradeSchema.parse(input);
      return mutate(
        (api) => (editing ? api.editTrade(id, transactionId, body) : api.addTrade(id, body)),
        replace,
      );
    },
    removeTrade(id: string, transactionId: string) {
      return mutate((api) => api.deleteTrade(id, transactionId), replace);
    },
    theme(theme: Settings['theme']) {
      return mutate(
        (api) => api.saveSettings({ theme }),
        (settings) => ({ settings }),
        true,
      );
    },
    watch(symbol: Symbol) {
      const base = assets.find((asset) => asset.symbol === symbol)!.base;
      const current = state.settings?.selectedCoins ?? [];
      const selectedCoins = current.includes(base)
        ? current.filter((coin) => coin !== base)
        : [...current, base];
      return mutate(
        (api) => api.saveSettings({ selectedCoins }),
        (settings) => ({ settings }),
        true,
      );
    },
  };
}
export type AccountStore = ReturnType<typeof createAccountStore>;
