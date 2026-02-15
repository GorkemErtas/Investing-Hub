import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
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
import { symbolSchema, type Symbol } from '../shared/contracts';
import {
  examplePortfolio,
  validatePortfolio,
  type Portfolio as PortfolioData,
} from '../shared/portfolio';
import { useStored } from './lib/storage';
import { Notice, Skeleton } from './components/ui';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Portfolio = lazy(() => import('./pages/Portfolio').then((m) => ({ default: m.Portfolio })));
const Research = lazy(() => import('./pages/Research').then((m) => ({ default: m.Research })));
const Learn = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Learn })));

const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/research', label: 'Research lab', icon: FlaskConical },
  { to: '/learn', label: 'Learning Hub', icon: BookOpen },
];
function validatePortfolios(value: unknown) {
  return z.array(z.unknown()).min(1).max(20).parse(value).map(validatePortfolio);
}
export default function App() {
  const [theme, saveTheme, themeWarning] = useStored('ih:theme:v1', 'dark', (value) =>
    z.enum(['dark', 'light']).parse(value),
  );
  const [watchlist, saveWatchlist, watchWarning] = useStored<Symbol[]>(
    'ih:watchlist:v1',
    ['BTCUSDT', 'ETHUSDT'],
    (value) => [...new Set(z.array(symbolSchema).max(8).parse(value))],
  );
  const [portfolios, savePortfolios, portfolioWarning] = useStored<PortfolioData[]>(
    'ih:portfolios:v1',
    [examplePortfolio],
    validatePortfolios,
  );
  const [selected, setSelected] = useState(0);
  const [menu, setMenu] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const location = useLocation();
  const active = nav.find((item) => item.to === location.pathname);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = `${active?.label ?? 'Page not found'} · Investing Hub`;
  }, [active?.label]);
  useEffect(() => {
    if (!menu || !sidebar.current) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = [...sidebar.current.querySelectorAll<HTMLElement>('a, button')].filter(
      (element) => element.getClientRects().length > 0,
    );
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
    saveWatchlist(
      watchlist.includes(symbol) ? watchlist.filter((s) => s !== symbol) : [...watchlist, symbol],
    );
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
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
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <div className="workspace-tag">
          <i className="status-dot" />
          Your personal workspace<span>DEMO</span>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <NavLink
              end={item.to === '/'}
              to={item.to}
              key={item.to}
              onClick={() => setMenu(false)}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <item.icon size={19} />
              {item.label}
              {item.to === '/research' && <span className="nav-beta">LAB</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-learn">
            <span className="sidebar-learn-icon">
              <BookOpen size={20} />
            </span>
            <strong>Your edge is understanding.</strong>
            <p>Turn market curiosity into lasting knowledge.</p>
            <NavLink to="/learn" onClick={() => setMenu(false)}>
              Keep learning
              <ArrowUpRight size={15} />
            </NavLink>
          </div>
          <div className="theme-control">
            <span>Appearance</span>
            <button
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              onClick={() => saveTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
          </div>
          <div className="guest-profile">
            <span className="guest-avatar">G</span>
            <div>
              <strong>Guest explorer</strong>
              <small>Local demo workspace</small>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell" inert={menu}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={menu}
              aria-controls="workspace-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{active?.label ?? 'Not found'}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-dot" />
            Guest demo
            <span className="topbar-divider" />
            <span className="topbar-note">Explore. Learn. Simulate.</span>
            <span className="avatar-small">G</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {[themeWarning, watchWarning, portfolioWarning].filter(Boolean).map((text, i) => (
            <Notice key={i}>{text}</Notice>
          ))}
          <Suspense fallback={<Skeleton rows={6} />}>
            <Routes>
              <Route
                path="/"
                element={
                  <Dashboard
                    theme={theme}
                    watchlist={watchlist}
                    onWatch={watch}
                    portfolio={portfolios[selected] ?? portfolios[0]}
                  />
                }
              />
              <Route
                path="/portfolio"
                element={
                  <Portfolio
                    portfolios={portfolios}
                    selected={selected}
                    onSelect={setSelected}
                    onSave={savePortfolios}
                  />
                }
              />
              <Route path="/research" element={<Research />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/learning-hub" element={<Learn />} />
              <Route
                path="*"
                element={
                  <div className="empty-state">
                    <h1>Page not found</h1>
                    <NavLink className="button primary" to="/">
                      Back to overview
                    </NavLink>
                  </div>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer className="app-footer">
          <span>
            © Investing Hub <span className="footer-dot">·</span> Built for a clearer perspective.
          </span>
          <span>
            Educational demo <span className="footer-dot">·</span> Prices in USDT{' '}
            <span className="footer-dot">·</span> No real trading
          </span>
        </footer>
      </div>
    </div>
  );
}
