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
}: {
  theme: string;
  watchlist: Symbol[];
  onWatch: (s: Symbol) => void;
  portfolio: Portfolio;
}) {
  const markets = useMarkets();
  const [symbol, setSymbol] = useState<Symbol>('BTCUSDT');
  const data = markets.data?.data ?? [];
  const prices = Object.fromEntries(data.map((m) => [m.symbol, m.price]));
  const ledger = account(portfolio.transactions, prices);
  const volume = data.length ? data.reduce((n, m) => n + m.quoteVolume, 0) : null;
  const leader = [...data].sort((a, b) => b.change24h - a.change24h)[0];
  const leaderAsset = assets.find((a) => a.symbol === leader?.symbol);
  const movers = [...data].sort((a, b) => b.change24h - a.change24h).slice(0, 3);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR MARKET. A CLEARER VIEW.</div>
          <h1>
            Market dashboard<span className="heading-dot">.</span>
          </h1>
          <p>Stay curious. Follow the market. Build your perspective.</p>
        </div>
        <div className="page-heading-status">
          <Status meta={markets.data?.meta} failed={markets.isError} />
          <span className="muted">Refreshes every 60 seconds</span>
        </div>
      </div>
      {markets.data && (markets.data.meta.stale || markets.isError) && (
        <Notice>Market provider is delayed. All valuations below use last available quotes.</Notice>
      )}
      <div className="stats-grid">
        <Stat
          label="Tracked trading volume"
          value={volume === null ? '—' : `${money(volume, true)}`}
          note="24h · USDT · tracked pairs only"
          icon={<BarChart3 size={17} />}
        />
        <Stat
          label="Top 24h performer"
          value={leaderAsset?.name ?? '—'}
          note={leader ? <Change value={leader.change24h} /> : 'Waiting for provider'}
          icon={<ArrowUpRight size={18} />}
        />
        <Stat
          label="Demo portfolio value"
          value={money(ledger.marketValue)}
          note={
            <Link to="/portfolio">
              USDT · Simulated holdings <ArrowRight size={12} />
            </Link>
          }
          icon={<Wallet size={17} />}
        />
        <Stat
          label="Assets in focus"
          value={String(assets.length).padStart(2, '0')}
          note={`${watchlist.length} on your personal watchlist`}
          icon={<Layers3 size={17} />}
        />
      </div>
      <div className="dashboard-grid">
        <PriceChart symbol={symbol} onSymbol={setSymbol} theme={theme} />
        <aside className="dashboard-aside">
          <section className="panel movers">
            <div className="panel-heading">
              <div>
                <h2>Market movers</h2>
                <p>Ranked by 24h change</p>
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
              <p className="muted padded">Movers appear when market data is available.</p>
            )}
          </section>
          <section className="research-teaser">
            <div className="research-icon">
              <FlaskConical size={22} />
            </div>
            <span className="pill">RESEARCH, WITH RIGOR</span>
            <h2>
              Better questions.
              <br />
              Honest forecasts.
            </h2>
            <p>
              Explore an ML outlook, AI interpretation of ML data, scenarios and the evidence behind
              it.
            </p>
            <Link to={`/future-analysis?symbol=${symbol}`}>
              Open Future Analysis <ArrowRight size={16} />
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
        />
      ) : (
        <section className="panel">
          <ErrorState
            message="Public market data is unavailable. Your saved demo transactions remain accessible in Portfolio."
            retry={() => void markets.refetch()}
          />
        </section>
      )}
      <div className="learning-strip">
        <div className="learning-strip-icon">↗</div>
        <div>
          <h3>A little knowledge. A better perspective.</h3>
          <p>From reading candles to understanding cost basis, build your foundations.</p>
        </div>
        <Link to="/learn" className="button secondary">
          Explore the Learning Hub <ArrowRight size={15} />
        </Link>
      </div>
    </>
  );
}
