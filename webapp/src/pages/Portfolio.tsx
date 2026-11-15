import { i18n, userError } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Download, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { assets } from '@investing-hub/shared/contracts';
import {
  account,
  validatePortfolio,
  type Portfolio as PortfolioData,
  type Transaction,
} from '@investing-hub/shared/portfolio';
import { useMarkets } from '../lib/api';
import { money, utc, number } from '../lib/format';
import { Coin, Notice, Stat, Status } from '../components/ui';
import { TransactionDialog } from '../components/TransactionDialog';

interface Props {
  portfolios: PortfolioData[];
  selected: number;
  onSelect: (index: number) => void;
  onSave?: (portfolios: PortfolioData[]) => void;
  actions?: {
    create: (name: string) => Promise<void>;
    rename: (index: number, name: string) => Promise<void>;
    remove: (index: number) => Promise<void>;
    saveTrade: (index: number, trade: Transaction, editing: boolean) => Promise<void>;
    removeTrade: (index: number, id: string) => Promise<void>;
  };
  busy?: boolean;
}
export function Portfolio({
  portfolios,
  selected,
  onSelect,
  onSave,
  actions,
  busy = false,
}: Props) {
  useTranslation();
  const p = portfolios[selected] ??
    portfolios[0] ?? { version: 1 as const, name: '', transactions: [] };
  const query = useMarkets();
  const prices = Object.fromEntries((query.data?.data ?? []).map((m) => [m.symbol, m.price]));
  const ledger = account(p.transactions, prices);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [rename, setRename] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  function update(next: PortfolioData) {
    onSave?.(portfolios.map((item, i) => (i === selected ? validatePortfolio(next) : item)));
  }
  async function saveTransaction(t: Transaction) {
    const next = {
      ...p,
      transactions:
        editing !== 'new' && editing
          ? p.transactions.map((old) => (old.id === t.id ? t : old))
          : [...p.transactions, t],
    };
    if (actions) await actions.saveTrade(selected, t, editing !== 'new');
    else update(next);
    setEditing(null);
    setMessage('portfolio.simulatedTransactionSaved');
  }
  async function removeTransaction(id: string) {
    try {
      if (actions) await actions.removeTrade(selected, id);
      else update({ ...p, transactions: p.transactions.filter((t) => t.id !== id) });
      setMessage('portfolio.transactionRemoved');
    } catch (error) {
      setMessage(actions ? userError(error) : 'portfolio.thisTransactionSupportsALaterSaleEdit');
    }
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = actions ? 'investing-hub-portfolio.json' : 'investing-hub-demo-portfolio.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  const holdings = ledger.holdings.filter((h) => h.quantity > 0);
  async function create() {
    setMessage('');
    try {
      const name = i18n.t('portfolio.newName', { count: portfolios.length + 1 });
      if (actions) await actions.create(name);
      else {
        onSave?.([...portfolios, { version: 1, name, transactions: [] }]);
        onSelect(portfolios.length);
      }
    } catch (error) {
      setMessage(userError(error));
    }
  }
  if (!portfolios.length)
    return (
      <div className="empty-state">
        <h1>{i18n.t('portfolio.yourPortfolio')}</h1>
        <p>{i18n.t('accounts.emptyPortfolios')}</p>
        {message && <p role="alert">{i18n.t(message)}</p>}
        <button className="button primary" disabled={busy} onClick={() => void create()}>
          {i18n.t('portfolio.newPortfolio')}
        </button>
      </div>
    );
  return (
    <fieldset className="portfolio-workspace" disabled={busy} aria-busy={busy}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{i18n.t('portfolio.practiceWithPerspective')}</div>
          <h1>
            {i18n.t('portfolio.yourPortfolio')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{i18n.t('portfolio.aSpaceToLearnSimulatedTradesReal')}</p>
        </div>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={17} />
          {i18n.t('portfolio.addTransaction')}
        </button>
      </div>
      <Notice>
        {i18n.t(
          actions
            ? 'accounts.savedPortfolios'
            : 'portfolio.guestDemoExampleTradesAreFictionalStored',
        )}
      </Notice>
      <div className="portfolio-toolbar">
        <label>
          <span className="sr-only">{i18n.t('portfolio.activePortfolio')}</span>
          <select
            value={selected}
            onChange={(e) => {
              onSelect(Number(e.target.value));
              setRename(false);
              setConfirmDelete(false);
            }}
          >
            {portfolios.map((item, i) => (
              <option value={i} key={i}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          disabled={portfolios.length >= 20}
          onClick={() => void create()}
        >
          {' '}
          <Plus size={15} />
          {i18n.t('portfolio.newPortfolio')}
        </button>
        <button
          className="icon-button"
          aria-label={i18n.t('portfolio.renamePortfolio')}
          onClick={() => setRename(!rename)}
        >
          <Pencil size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={i18n.t('portfolio.deletePortfolio')}
          disabled={!actions && portfolios.length <= 1}
          onClick={() => setConfirmDelete(!confirmDelete)}
        >
          <Trash2 size={16} />
        </button>
        <button className="button secondary export-button" onClick={exportData}>
          <Download size={15} />
          {i18n.t('portfolio.export')}
        </button>
      </div>
      {rename && (
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setMessage('');
            const form = new FormData(e.currentTarget);
            try {
              const name = String(form.get('name'));
              if (actions) await actions.rename(selected, name);
              else update({ ...p, name });
              setRename(false);
            } catch (error) {
              setMessage(actions ? userError(error) : 'portfolio.nameValidation');
            }
          }}
        >
          <label>
            {i18n.t('portfolio.portfolioName')}{' '}
            <input name="name" defaultValue={p.name} maxLength={60} minLength={1} required />
          </label>
          <button className="button primary">{i18n.t('portfolio.saveName')}</button>
        </form>
      )}
      {confirmDelete && (
        <div className="notice">
          {i18n.t('portfolio.deleteConfirmation', { name: p.name })}
          <button
            className="button danger"
            onClick={async () => {
              setMessage('');
              try {
                if (actions) await actions.remove(selected);
                else {
                  onSave?.(portfolios.filter((_, i) => i !== selected));
                  onSelect(0);
                }
                setConfirmDelete(false);
              } catch (error) {
                setMessage(userError(error));
              }
            }}
          >
            {i18n.t('portfolio.deletePortfolio')}
          </button>
          <button className="text-button" onClick={() => setConfirmDelete(false)}>
            {i18n.t('common:action.cancel')}
          </button>
        </div>
      )}
      {message && (
        <p className="feedback" role="status">
          {i18n.t(message)}
        </p>
      )}
      <div className="stats-grid">
        <Stat
          label={i18n.t('portfolio.marketValue')}
          value={money(ledger.marketValue)}
          note={i18n.t('portfolio.usdtCurrentRemainingHoldings')}
          icon={<Wallet size={17} />}
        />
        <Stat
          label={i18n.t('portfolio.remainingCostBasis')}
          value={money(ledger.costBasis)}
          note={i18n.t('portfolio.usdtIncludesPurchaseFees')}
          icon={<Wallet size={17} />}
        />
        <Stat
          label={i18n.t('portfolio.unrealizedProfitLoss')}
          value={money(ledger.unrealized)}
          note={i18n.t('portfolio.usdtOpenPositions')}
          icon={<Wallet size={17} />}
        />
        <Stat
          label={i18n.t('portfolio.realizedProfitLoss')}
          value={money(ledger.realized)}
          note={i18n.t('portfolio.usdtNetOfSaleFees')}
          icon={<Wallet size={17} />}
        />
      </div>
      {query.isError || query.data?.meta.stale ? (
        <Notice>{i18n.t('portfolio.liveQuotesAreUnavailableOrStaleMissing')}</Notice>
      ) : null}
      <div className="portfolio-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{i18n.t('portfolio.yourHoldings')}</h2>
              <p>{i18n.t('portfolio.weightedAverageCostBasisUsdt')}</p>
            </div>
            <span className="pill">
              {holdings.length} {i18n.t('portfolio.assets')}
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{i18n.t('marketTable.asset')}</th>
                  <th>{i18n.t('portfolio.quantity')}</th>
                  <th>{i18n.t('portfolio.avgCost')}</th>
                  <th>{i18n.t('portfolio.marketValue')}</th>
                  <th>{i18n.t('portfolio.unrealizedPL')}</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.symbol}>
                    <td>
                      <span className="asset-cell">
                        <Coin symbol={h.symbol} small />
                        <strong>{h.symbol.replace('USDT', '')}</strong>
                      </span>
                    </td>
                    <td>{number(h.quantity, { maximumFractionDigits: 8 })}</td>
                    <td>{money(h.averagePrice)}</td>
                    <td>{money(h.marketValue)}</td>
                    <td
                      className={
                        h.unrealized === null
                          ? 'muted'
                          : h.unrealized >= 0
                            ? 'positive'
                            : 'negative'
                      }
                    >
                      {money(h.unrealized)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!holdings.length && (
              <div className="empty-state">
                <Wallet size={28} />
                <strong>{i18n.t('portfolio.noOpenPositions')}</strong>
                <p>{i18n.t('portfolio.addASimulatedBuyToStartExploring')}</p>
              </div>
            )}
          </div>
          <div className="chart-footer">
            <Status meta={query.data?.meta} failed={query.isError} />
          </div>
        </section>
        <section className="panel allocation">
          <div className="panel-heading">
            <div>
              <h2>{i18n.t('portfolio.assetAllocation')}</h2>
              <p>{i18n.t('portfolio.byCurrentMarketValue')}</p>
            </div>
          </div>
          {ledger.marketValue !== null && ledger.marketValue > 0 ? (
            <>
              <div className="allocation-bar">
                {holdings.map((h) => (
                  <span
                    key={h.symbol}
                    style={{
                      width: `${(h.marketValue! / ledger.marketValue!) * 100}%`,
                      background: assets.find((a) => a.symbol === h.symbol)?.color,
                    }}
                  />
                ))}
              </div>
              {holdings.map((h) => (
                <div className="allocation-row" key={h.symbol}>
                  <Coin symbol={h.symbol} small />
                  <span>{h.symbol.replace('USDT', '')}</span>
                  <strong>
                    {number(h.marketValue! / ledger.marketValue!, {
                      style: 'percent',
                      maximumFractionDigits: 1,
                    })}
                  </strong>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-state">
              <p>{i18n.t('portfolio.allocationNeedsOpenHoldingsAndAvailableQuotes')}</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{i18n.t('portfolio.transactionHistory')}</h2>
            <p>{i18n.t('portfolio.simulatedTransactionsChronologicalAccountingTimestampsInUtc')}</p>
          </div>
          <span className="pill">
            {p.transactions.length} {i18n.t('portfolio.transactions')}
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{i18n.t('portfolio.dateUtc')}</th>
                <th>{i18n.t('marketTable.asset')}</th>
                <th>{i18n.t('portfolio.side')}</th>
                <th>{i18n.t('portfolio.quantity')}</th>
                <th>{i18n.t('portfolio.priceUsdt')}</th>
                <th>{i18n.t('portfolio.fee')}</th>
                <th>{i18n.t('portfolio.grossTotal')}</th>
                <th>{i18n.t('portfolio.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {[...ledger.ordered].reverse().map((t) => (
                <tr key={t.id}>
                  <td>{utc(t.timestamp)}</td>
                  <td>{t.symbol.replace('USDT', '')}</td>
                  <td>
                    <span className={`side-badge ${t.side}`}>
                      {i18n.t('common:action.' + t.side)}
                    </span>
                  </td>
                  <td>{t.quantity}</td>
                  <td>{money(Number(t.price))}</td>
                  <td>{money(Number(t.fee))}</td>
                  <td>{money(Number(t.quantity) * Number(t.price))}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={i18n.t('portfolio.editTransaction', {
                          side: i18n.t('common:action.' + t.side),
                          symbol: t.symbol,
                          date: utc(t.timestamp),
                        })}
                        onClick={() => setEditing(t)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={i18n.t('portfolio.removeTransaction', {
                          side: i18n.t('common:action.' + t.side),
                          symbol: t.symbol,
                          date: utc(t.timestamp),
                        })}
                        onClick={() => removeTransaction(t.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!p.transactions.length && (
            <div className="empty-state">
              <p>{i18n.t('portfolio.yourSimulatedTransactionHistoryWillAppearHere')}</p>
            </div>
          )}
        </div>
      </section>
      {editing && (
        <TransactionDialog
          original={editing === 'new' ? undefined : editing}
          prices={prices}
          onSave={saveTransaction}
          onClose={() => setEditing(null)}
        />
      )}
    </fieldset>
  );
}
