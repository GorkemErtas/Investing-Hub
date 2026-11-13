import { i18n } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
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
  watchDisabled = false,
}: {
  data: Market[];
  watchlist: Symbol[];
  onWatch: (s: Symbol) => void;
  selected: Symbol;
  onSelect: (s: Symbol) => void;
  watchDisabled?: boolean;
}) {
  useTranslation();
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
          <h2>{i18n.t('marketTable.marketOverview')}</h2>
          <p>{i18n.t('marketTable.onePlaceForYourNextPerspective')}</p>
        </div>
        <span className="pill">{i18n.t('marketTable.usdtPairs')}</span>
      </div>
      <div className="market-controls">
        <div className="under-tabs">
          <button className={!onlyWatch ? 'active' : ''} onClick={() => setOnlyWatch(false)}>
            {i18n.t('marketTable.allAssets')}
            <span>{data.length}</span>
          </button>
          <button className={onlyWatch ? 'active' : ''} onClick={() => setOnlyWatch(true)}>
            <Star size={13} />
            {i18n.t('marketTable.watchlist')}
            <span>{watchlist.length}</span>
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">{i18n.t('marketTable.searchAssets')}</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={i18n.t('marketTable.searchAssets2')}
          />
        </label>
      </div>
      <div className="table-scroll">
        <table className="market-table">
          <caption className="sr-only">
            {i18n.t('marketTable.trackedExchangePairsAllPricesAndQuote')}
          </caption>
          <thead>
            <tr>
              <th>
                <span className="sr-only">{i18n.t('marketTable.watch')}</span>
              </th>
              <th>{i18n.t('marketTable.asset')}</th>
              {(
                [
                  ['price', i18n.t('marketTable.price')],
                  ['change24h', i18n.t('marketTable.24hChange')],
                  ['quoteVolume', i18n.t('marketTable.24hQuoteVolume')],
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
              <th>{i18n.t('marketTable.24hRange')}</th>
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
                      disabled={watchDisabled}
                      aria-label={i18n.t(
                        watchlist.includes(m.symbol)
                          ? 'marketTable.watchRemove'
                          : 'marketTable.watchAdd',
                        { coin: a.name },
                      )}
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
                    <Link className="text-button" to={`/predictions?symbol=${m.symbol}`}>
                      {i18n.t('common:nav.predictions')}
                      <span aria-hidden="true">↗</span>
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
            <strong>{i18n.t('marketTable.noMatchingAssets')}</strong>
            <p>{i18n.t('marketTable.tryAnotherSearchOrAddAssetsTo')}</p>
          </div>
        )}
      </div>
      <div className="table-footer">
        {i18n.t('marketTable.count', { shown: filtered.length, total: data.length })}
        <span>{i18n.t('marketTable.exchangeVolumeMarketCapitalization')}</span>
      </div>
    </section>
  );
}
