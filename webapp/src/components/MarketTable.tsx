import { useState } from 'react';
import { ArrowDownUp, Search, Star } from 'lucide-react';
import { assets, type Market, type Symbol } from '@investing-hub/shared/contracts';
import { money } from '../lib/format';
import { Change, Coin } from './ui';
import { Link } from 'react-router-dom';

export function MarketTable({
  data,
  watchlist,
  onWatch,
  selected,
  onSelect,
}: {
  data: Market[];
  watchlist: Symbol[];
  onWatch: (s: Symbol) => void;
  selected: Symbol;
  onSelect: (s: Symbol) => void;
}) {
  const [search, setSearch] = useState('');
  const [onlyWatch, setOnlyWatch] = useState(false);
  const [sort, setSort] =
    useState<keyof Pick<Market, 'price' | 'change24h' | 'quoteVolume'>>('quoteVolume');
  const [descending, setDescending] = useState(true);
  function sortBy(key: typeof sort) {
    if (key === sort) setDescending(!descending);
    else {
      setSort(key);
      setDescending(true);
    }
  }
  const filtered = data
    .filter((m) => {
      const a = assets.find((a) => a.symbol === m.symbol)!;
      return (
        (!onlyWatch || watchlist.includes(m.symbol)) &&
        `${a.name} ${a.base}`.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => (a[sort] - b[sort]) * (descending ? -1 : 1));
  return (
    <section className="panel markets-panel">
      <div className="panel-heading">
        <div>
          <h2>Market overview</h2>
          <p>One place for your next perspective.</p>
        </div>
        <span className="pill">USDT pairs</span>
      </div>
      <div className="market-controls">
        <div className="under-tabs">
          <button className={!onlyWatch ? 'active' : ''} onClick={() => setOnlyWatch(false)}>
            All assets <span>{data.length}</span>
          </button>
          <button className={onlyWatch ? 'active' : ''} onClick={() => setOnlyWatch(true)}>
            <Star size={13} />
            Watchlist <span>{watchlist.length}</span>
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Search assets</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets…"
          />
        </label>
      </div>
      <div className="table-scroll">
        <table className="market-table">
          <caption className="sr-only">
            Tracked exchange pairs. All prices and quote volumes in USDT.
          </caption>
          <thead>
            <tr>
              <th>
                <span className="sr-only">Watch</span>
              </th>
              <th>Asset</th>
              {(
                [
                  ['price', 'Price'],
                  ['change24h', '24h change'],
                  ['quoteVolume', '24h quote volume'],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={sort === key ? (descending ? 'descending' : 'ascending') : 'none'}
                >
                  <button onClick={() => sortBy(key)}>
                    {label}
                    <ArrowDownUp size={12} />
                  </button>
                </th>
              ))}
              <th>24h range</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const a = assets.find((a) => a.symbol === m.symbol)!;
              return (
                <tr key={m.symbol} className={m.symbol === selected ? 'selected-row' : ''}>
                  <td>
                    <button
                      className={`icon-button star ${watchlist.includes(m.symbol) ? 'starred' : ''}`}
                      onClick={() => onWatch(m.symbol)}
                      aria-label={`${watchlist.includes(m.symbol) ? 'Remove' : 'Add'} ${a.name} ${watchlist.includes(m.symbol) ? 'from' : 'to'} watchlist`}
                      aria-pressed={watchlist.includes(m.symbol)}
                    >
                      <Star size={16} />
                    </button>
                  </td>
                  <td>
                    <button className="asset-cell" onClick={() => onSelect(m.symbol)}>
                      <Coin symbol={m.symbol} small />
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.base}</small>
                      </span>
                    </button>
                  </td>
                  <td className="numeric">{money(m.price)}</td>
                  <td>
                    <Change value={m.change24h} />
                  </td>
                  <td className="numeric muted">{money(m.quoteVolume, true)}</td>
                  <td>
                    <div className="range-bar">
                      <i
                        style={{
                          left: `${Math.max(0, Math.min(100, ((m.price - m.low24h) / (m.high24h - m.low24h || 1)) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="range-labels">
                      <span>{money(m.low24h, true)}</span>
                      <span>{money(m.high24h, true)}</span>
                    </div>
                  </td>
                  <td>
                    <Link className="text-button" to={`/future-analysis?symbol=${m.symbol}`}>
                      Future Analysis <span aria-hidden="true">↗</span>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="empty-state">
            <Search size={24} />
            <strong>No matching assets</strong>
            <p>Try another search or add assets to your watchlist.</p>
          </div>
        )}
      </div>
      <div className="table-footer">
        {filtered.length} of {data.length} tracked pairs
        <span>Exchange volume ≠ market capitalization</span>
      </div>
    </section>
  );
}
