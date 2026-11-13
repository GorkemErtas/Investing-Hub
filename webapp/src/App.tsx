import { i18n } from './lib/i18n';
import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { z } from 'zod';
import { assets, symbolSchema, type Symbol } from '@investing-hub/shared/contracts';
import {
  examplePortfolio,
  validatePortfolio,
  type Portfolio as PortfolioData,
  type Transaction,
} from '@investing-hub/shared/portfolio';
import { useStored } from './lib/storage';
import { Notice, Skeleton } from './components/ui';
import { LanguageSelector } from './components/LanguageSelector';
import { AuthDialog } from './components/AuthDialog';
import { createAccountStore, portfolioView } from './lib/accounts';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Portfolio = lazy(() => import('./pages/Portfolio').then((m) => ({ default: m.Portfolio })));
const PricePredictions = lazy(() =>
  import('./pages/PricePredictions').then((m) => ({ default: m.PricePredictions })),
);
const Learn = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Learn })));

const nav = [
  { to: '/', label: 'common:nav.overview', icon: LayoutDashboard },
  { to: '/portfolio', label: 'common:nav.portfolio', icon: Wallet },
  { to: '/predictions', label: 'common:nav.predictions', icon: FlaskConical },
  { to: '/learn', label: 'common:nav.learning', icon: BookOpen },
];
function validatePortfolios(value: unknown) {
  return z.array(z.unknown()).min(1).max(20).parse(value).map(validatePortfolio);
}
export default function App() {
  const { i18n: language } = useTranslation();
  const [guestTheme, saveGuestTheme, themeWarning] = useStored('ih:theme:v1', 'dark', (value) =>
    z.enum(['dark', 'light']).parse(value),
  );
  const [guestWatchlist, saveWatchlist, watchWarning] = useStored<Symbol[]>(
    'ih:watchlist:v1',
    ['BTCUSDT', 'ETHUSDT'],
    (value) => [...new Set(z.array(symbolSchema).max(8).parse(value))],
  );
  const [guestPortfolios, savePortfolios, portfolioWarning] = useStored<PortfolioData[]>(
    'ih:portfolios:v1',
    [{ ...examplePortfolio, name: i18n.t('portfolio.exampleName') }],
    validatePortfolios,
  );
  const [guestSelected, setGuestSelected] = useState(0);
  const [accounts] = useState(() => createAccountStore({ baseUrl: window.location.origin }));
  const accountState = useSyncExternalStore(accounts.subscribe, accounts.getSnapshot);
  const session = accountState.session;
  const [authOpen, setAuthOpen] = useState(false);
  const capabilities = useQuery({
    queryKey: ['capabilities'],
    queryFn: accounts.capabilities,
    retry: false,
    staleTime: 30000,
  });
  const theme = session ? (accountState.settings?.theme ?? 'dark') : guestTheme;
  const watchlist = session
    ? assets
        .filter((asset) => accountState.settings?.selectedCoins.includes(asset.base))
        .map((asset) => asset.symbol)
    : guestWatchlist;
  const portfolios = session ? accountState.portfolios.map(portfolioView) : guestPortfolios;
  const selected = session
    ? Math.max(
        0,
        accountState.portfolios.findIndex((p) => p._id === accountState.selected),
      )
    : guestSelected;
  const privateBusy = accountState.busy || accountState.loading || !accountState.settings;
  function setSelected(index: number) {
    if (session) accounts.select(index);
    else setGuestSelected(index);
  }
  function saveTheme(next: 'dark' | 'light') {
    if (session) void accounts.theme(next).catch(() => {});
    else saveGuestTheme(next);
  }
  const [menu, setMenu] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const location = useLocation();
  const active = nav.find(
    (item) =>
      item.to === (location.pathname === '/future-analysis' ? '/predictions' : location.pathname),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const check = () => accounts.checkExpiry();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
    };
  }, [accounts]);
  useEffect(() => {
    document.title = `${i18n.t(active?.label ?? 'app.pageNotFound')} · Investing Hub`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', i18n.t('app.description'));
  }, [active?.label, language.language]);
  useEffect(() => {
    if (!menu || !sidebar.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = [
      ...sidebar.current.querySelectorAll<HTMLElement>('a, button, select'),
    ].filter((element) => element.getClientRects().length > 0);
    focusable[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key === 'Tab') {
        const first = focusable[0],
          last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const resize = () => {
      if (window.innerWidth > 760) setMenu(false);
    };
    document.addEventListener('keydown', keydown);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', resize);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [menu]);
  function watch(symbol: Symbol) {
    if (session) {
      void accounts.watch(symbol).catch(() => {});
      return;
    }
    saveWatchlist(
      watchlist.includes(symbol) ? watchlist.filter((s) => s !== symbol) : [...watchlist, symbol],
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {i18n.t('app.skipToContent')}
      </a>
      <aside ref={sidebar} id="workspace-navigation" className={`sidebar ${menu ? 'open' : ''}`}>
        <NavLink to="/" className="brand" onClick={() => setMenu(false)}>
          <span className="brand-mark">
            <ChartNoAxesCombined size={25} />
          </span>
          <span>
            investing<span className="brand-light">hub</span>
            <i />
          </span>
        </NavLink>
        <button
          className="mobile-close icon-button"
          onClick={() => setMenu(false)}
          aria-label={i18n.t('app.closeNavigation')}
        >
          <X size={20} />
        </button>
        <nav aria-label={i18n.t('app.mainNavigation')}>
          {nav.map((item) => (
            <NavLink
              end={item.to === '/'}
              to={item.to}
              key={item.to}
              onClick={() => setMenu(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <item.icon size={19} />
              {i18n.t(item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LanguageSelector />
          <div className="theme-control">
            <span>{i18n.t('app.appearance')}</span>
            <button
              aria-label={i18n.t(theme === 'dark' ? 'app.switchLight' : 'app.switchDark')}
              onClick={() => saveTheme(theme === 'dark' ? 'light' : 'dark')}
              disabled={Boolean(session && privateBusy)}
            >
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              {theme === 'dark' ? i18n.t('app.dark') : i18n.t('app.light')}
            </button>
          </div>
          <div className="guest-profile">
            <span className="guest-avatar">
              {session ? session.user.firstName.slice(0, 1) : i18n.t('app.g')}
            </span>
            <div>
              <strong>{session ? session.user.firstName : i18n.t('app.guestExplorer')}</strong>
              <small>
                {i18n.t(session ? 'accounts.accountWorkspace' : 'app.localDemoWorkspace')}
              </small>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-backdrop"
          aria-label={i18n.t('app.closeNavigation')}
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell" inert={menu}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label={i18n.t('app.openNavigation')}
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>{i18n.t('app.workspace2')}</span>
            <ChevronRight size={14} />
            <strong>{i18n.t(active?.label ?? 'app.notFound')}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-dot" />
            {i18n.t(session ? 'accounts.accountWorkspace' : 'app.guestDemo')}
            <span className="topbar-divider" />
            <span className="topbar-note">{i18n.t('app.exploreLearnSimulate')}</span>
            {session ? (
              <button className="button secondary account-button" onClick={() => accounts.logout()}>
                {i18n.t('common:action.logOut')}
              </button>
            ) : (
              <button className="button secondary account-button" onClick={() => setAuthOpen(true)}>
                {i18n.t('common:action.signIn')}
              </button>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {[themeWarning, watchWarning, portfolioWarning].filter(Boolean).map((text, i) => (
            <Notice key={i}>{text}</Notice>
          ))}
          {accountState.notice && <Notice>{i18n.t(accountState.notice)}</Notice>}
          {session && accountState.error && (
            <Notice>
              <span role="alert">{i18n.t(accountState.error)}</span>{' '}
              <button
                className="text-button"
                disabled={accountState.loading || accountState.busy}
                onClick={() => void accounts.reload()}
              >
                {i18n.t('common:action.retry')}
              </button>
            </Notice>
          )}
          {session && accountState.loading && <p role="status">{i18n.t('accounts.loading')}</p>}
          <Suspense fallback={<Skeleton rows={6} />}>
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    accountMode={Boolean(session)}
                    watchDisabled={Boolean(session && privateBusy)}
                    theme={theme}
                    watchlist={watchlist}
                    onWatch={watch}
                    portfolio={
                      portfolios[selected] ??
                      portfolios[0] ??
                      (session && !accountState.settings
                        ? null
                        : { version: 1, name: '', transactions: [] })
                    }
                  />
                }
              />
              <Route
                path="/portfolio"
                element={
                  session && !accountState.settings ? (
                    accountState.loading ? (
                      <Skeleton rows={3} />
                    ) : (
                      <div className="empty-state">
                        <h1>{i18n.t('portfolio.yourPortfolio')}</h1>
                        <p>{i18n.t('accounts.unavailable')}</p>
                      </div>
                    )
                  ) : (
                    <Portfolio
                      key={session?.scope ?? 'guest'}
                      portfolios={portfolios}
                      selected={selected}
                      onSelect={setSelected}
                      {...(session
                        ? {
                            busy: privateBusy,
                            actions: {
                              create: async (name: string) => {
                                await accounts.create(name);
                              },
                              rename: async (index: number, name: string) => {
                                await accounts.rename(accountState.portfolios[index]._id, name);
                              },
                              remove: async (index: number) => {
                                await accounts.remove(accountState.portfolios[index]._id);
                              },
                              saveTrade: async (
                                index: number,
                                trade: Transaction,
                                editing: boolean,
                              ) => {
                                await accounts.saveTrade(
                                  accountState.portfolios[index]._id,
                                  trade,
                                  editing,
                                );
                              },
                              removeTrade: async (index: number, id: string) => {
                                await accounts.removeTrade(accountState.portfolios[index]._id, id);
                              },
                            },
                          }
                        : { onSave: savePortfolios })}
                    />
                  )
                }
              />
              <Route path="/predictions" element={<PricePredictions />} />
              <Route path="/future-analysis" element={<Navigate to="/predictions" replace />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learning-hub" element={<Learn />} />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>{i18n.t('app.pageNotFound')}</h1>
                    <NavLink className="button primary" to="/">
                      {i18n.t('app.backToOverview')}
                    </NavLink>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>
            {i18n.t('app.investingHub')}
            <span className="footer-dot">·</span> {i18n.t('app.builtForAClearerPerspective')}
          </span>
          <span>
            {i18n.t('app.educationalDemo')}
            <span className="footer-dot">·</span> {i18n.t('app.pricesInUsdt')}{' '}
            <span className="footer-dot">·</span> {i18n.t('app.noRealTrading')}
          </span>
        </footer>
      </div>
      {authOpen && (
        <AuthDialog
          store={accounts}
          capabilities={capabilities.data}
          retry={() => {
            void capabilities.refetch();
          }}
          onClose={() => {
            accounts.cancelLogin();
            setAuthOpen(false);
          }}
        />
      )}
    </div>
  );
}
