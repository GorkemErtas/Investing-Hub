import { i18n } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, BarChart3, Layers3, Wallet, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { assets, type Symbol } from '@investing-hub/shared/contracts';
import { account, type Portfolio } from '@investing-hub/shared/portfolio';
import { useMarkets } from '../lib/api';
import { money } from '../lib/format';
import { Change, Coin, ErrorState, Notice, Skeleton, Stat, Status } from '../components/ui';
import { PriceChart } from '../components/PriceChart';
import { MarketTable } from '../components/MarketTable';

export function Dashboard({
  theme,
  watchlist,
  onWatch,
  portfolio,
  accountMode = false,
  watchDisabled = false,
}: {
  theme: string;
  watchlist: Symbol[];
  onWatch: (s: Symbol) => void;
  portfolio: Portfolio | null;
  accountMode?: boolean;
  watchDisabled?: boolean;
}) {
  useTranslation();
  const markets = useMarkets();
  const [symbol, setSymbol] = useState<Symbol>('BTCUSDT');
  const data = markets.data?.data ?? [];
  const prices = Object.fromEntries(data.map((m) => [m.symbol, m.price]));
  const ledger = account(portfolio?.transactions ?? [], prices);
  const volume = data.length ? data.reduce((n, m) => n + m.quoteVolume, 0) : null;
  const leader = [...data].sort((a, b) => b.change24h - a.change24h)[0];
  const leaderAsset = assets.find((a) => a.symbol === leader?.symbol);
  const movers = [...data].sort((a, b) => b.change24h - a.change24h).slice(0, 3);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{i18n.t('dashboard.yourMarketAClearerView')}</div>
          <h1>
            {i18n.t('dashboard.marketDashboard')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{i18n.t('dashboard.stayCuriousFollowTheMarketBuildYour')}</p>
        </div>
        <div className="page-heading-status">
          <Status meta={markets.data?.meta} failed={markets.isError} />
          <span className="muted">{i18n.t('dashboard.refreshesEvery60Seconds')}</span>
        </div>
      </div>
      {markets.data && (markets.data.meta.stale || markets.isError) && (
        <Notice>{i18n.t('dashboard.marketProviderIsDelayedAllValuationsBelow')}</Notice>
      )}
      <div className="stats-grid">
        <Stat
          label={i18n.t('dashboard.trackedTradingVolume')}
          value={volume === null ? '—' : `${money(volume, true)}`}
          note={i18n.t('dashboard.24hUsdtTrackedPairsOnly')}
          icon={<BarChart3 size={17} />}
        />
        <Stat
          label={i18n.t('dashboard.top24hPerformer')}
          value={leaderAsset?.name ?? '—'}
          note={
            leader ? <Change value={leader.change24h} /> : i18n.t('dashboard.waitingForProvider')
          }
          icon={<ArrowUpRight size={18} />}
        />
        <Stat
          label={i18n.t(accountMode ? 'accounts.portfolioValue' : 'dashboard.demoPortfolioValue')}
          value={portfolio ? money(ledger.marketValue) : '—'}
          note={
            <Link to="/portfolio">
              {i18n.t('dashboard.usdtSimulatedHoldings')}
              <ArrowRight size={12} />
            </Link>
          }
          icon={<Wallet size={17} />}
        />
        <Stat
          label={i18n.t('dashboard.assetsInFocus')}
          value={String(assets.length).padStart(2, '0')}
          note={i18n.t('dashboard.watchCount', { count: watchlist.length })}
          icon={<Layers3 size={17} />}
        />
      </div>
      <div className="dashboard-grid">
        <PriceChart symbol={symbol} onSymbol={setSymbol} theme={theme} />
        <aside className="dashboard-aside">
          <section className="panel movers">
            <div className="panel-heading">
              <div>
                <h2>{i18n.t('dashboard.marketMovers')}</h2>
                <p>{i18n.t('dashboard.rankedBy24hChange')}</p>
              </div>
              <ArrowUpRight size={19} />
            </div>
            {markets.isPending ? (
              <Skeleton rows={3} />
            ) : movers.length ? (
              movers.map((m, i) => (
                <button className="mover-row" key={m.symbol} onClick={() => setSymbol(m.symbol)}>
                  <span className="mover-rank">0{i + 1}</span>
                  <Coin symbol={m.symbol} small />
                  <span className="mover-name">
                    <strong>{assets.find((a) => a.symbol === m.symbol)?.base}</strong>
                    <small>{money(m.price)} USDT</small>
                  </span>
                  <Change value={m.change24h} />
                </button>
              ))
            ) : (
              <p className="muted padded">
                {i18n.t('dashboard.moversAppearWhenMarketDataIsAvailable')}
              </p>
            )}
          </section>
          <section className="prediction-teaser">
            <div className="prediction-icon">
              <FlaskConical size={22} />
            </div>
            <span className="pill">{i18n.t('dashboard.localPriceEstimates')}</span>
            <h2>
              {i18n.t('dashboard.betterQuestions')}
              <br />
              {i18n.t('dashboard.honestForecasts')}
            </h2>
            <p>{i18n.t('dashboard.seeTheNextDayNumericForecastFrom')}</p>
            <Link to={`/predictions?symbol=${symbol}`}>
              {i18n.t('dashboard.openPricePredictions')}
              <ArrowRight size={16} />
            </Link>
            <div className="teaser-grid" aria-hidden="true" />
          </section>
        </aside>
      </div>
      {markets.isPending ? (
        <section className="panel">
          <Skeleton rows={6} />
        </section>
      ) : data.length ? (
        <MarketTable
          data={data}
          selected={symbol}
          onSelect={(s) => {
            setSymbol(s);
            document
              .querySelector('.chart-panel')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          watchlist={watchlist}
          onWatch={onWatch}
          watchDisabled={watchDisabled}
        />
      ) : (
        <section className="panel">
          <ErrorState
            message={i18n.t('dashboard.publicMarketDataIsUnavailableYourSaved')}
            retry={() => void markets.refetch()}
          />
        </section>
      )}
      <div className="learning-strip">
        <div className="learning-strip-icon">↗</div>
        <div>
          <h3>{i18n.t('dashboard.aLittleKnowledgeABetterPerspective')}</h3>
          <p>{i18n.t('dashboard.fromReadingCandlesToUnderstandingCostBasis')}</p>
        </div>
        <Link to="/learn" className="button secondary">
          {i18n.t('dashboard.exploreTheLearningHub')}
          <ArrowRight size={15} />
        </Link>
      </div>
    </>
  );
}
