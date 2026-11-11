import { i18n, userError } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import { assets, type Symbol } from '@investing-hub/shared/contracts';
import {
  account,
  validatePortfolio,
  type Portfolio as PortfolioData,
  type Transaction,
} from '@investing-hub/shared/portfolio';
import { useMarkets } from '../lib/api';
import { money, utc, number } from '../lib/format';
import { Coin, Notice, Stat, Status } from '../components/ui';
import { decimalInput, decimalDisplay, localeValue } from '@investing-hub/shared/localization';

interface Props {
  portfolios: PortfolioData[];
  selected: number;
  onSelect: (index: number) => void;
  onSave: (portfolios: PortfolioData[]) => void;
}
function TransactionDialog({
  original,
  prices,
  onSave,
  onClose,
}: {
  original?: Transaction;
  prices: Partial<Record<Symbol, number>>;
  onSave: (t: Transaction) => void;
  onClose: () => void;
}) {
  useTranslation();
  const locale = localeValue(i18n.resolvedLanguage);
  const ref = useRef<HTMLDialogElement>(null);
  const [symbol, setSymbol] = useState<Symbol>(original?.symbol ?? 'BTCUSDT');
  const [price, setPrice] = useState(original?.price ?? '');
  const [quantity, setQuantity] = useState(original?.quantity ?? '');
  const [fee, setFee] = useState(original?.fee ?? '0');
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      if (!event.currentTarget.checkValidity()) throw new Error('common:errors.INVALID_REQUEST');
      const date = new Date(String(data.get('date')));
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now())
        throw new Error('portfolio.chooseAValidDateInThePast');
      onSave({
        id: original?.id ?? crypto.randomUUID(),
        symbol,
        side: data.get('side') as 'buy' | 'sell',
        quantity,
        price,
        fee,
        timestamp: date.toISOString(),
      });
    } catch (e) {
      setError(
        e instanceof Error && !('issues' in e)
          ? i18n.exists(e.message)
            ? userError(e)
            : 'portfolio.invalidHistory'
          : 'portfolio.usePositiveQuantitiesAndPricesWithAt',
      );
    }
  }
  const defaultDate = original ? new Date(original.timestamp) : new Date();
  const localDate = new Date(defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return (
    <dialog
      ref={ref}
      className="transaction-dialog"
      onCancel={onClose}
      aria-labelledby="transaction-title"
    >
      <div className="dialog-heading">
        <div>
          <div className="eyebrow">{i18n.t('portfolio.paperTradingOnly')}</div>
          <h2 id="transaction-title">
            {i18n.t(original ? 'portfolio.editForm' : 'portfolio.addForm')}
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label={i18n.t('portfolio.closeTransactionForm')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">{i18n.t('portfolio.recordASimulatedTradeNoOrderIs')}</p>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>
            {i18n.t('marketTable.asset')}
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value as Symbol);
                setPrice('');
              }}
            >
              {assets.map((a) => (
                <option value={a.symbol} key={a.symbol}>
                  {a.name} ({a.base})
                </option>
              ))}
            </select>
          </label>
          <label>
            {i18n.t('portfolio.side')}
            <select name="side" defaultValue={original?.side ?? 'buy'}>
              <option value="buy">{i18n.t('common:action.buy')}</option>
              <option value="sell">{i18n.t('common:action.sell')}</option>
            </select>
          </label>
          <label>
            {i18n.t('portfolio.quantity')}
            <input
              name="quantity"
              inputMode="decimal"
              value={decimalDisplay(quantity, locale)}
              onChange={(e) => setQuantity(decimalInput(e.target.value, locale))}
              placeholder={decimalDisplay('0.00', locale)}
              required
            />
          </label>
          <label>
            {i18n.t('portfolio.priceInUsdt')}
            <input
              value={decimalDisplay(price, locale)}
              onChange={(e) => setPrice(decimalInput(e.target.value, locale))}
              inputMode="decimal"
              placeholder={decimalDisplay('0.00', locale)}
              required
            />
          </label>
          <label>
            {i18n.t('portfolio.feeInUsdt')}
            <input
              name="fee"
              inputMode="decimal"
              value={decimalDisplay(fee, locale)}
              onChange={(e) => setFee(decimalInput(e.target.value, locale))}
              required
            />
          </label>
          <label>
            {i18n.t('portfolio.dateTimeYourLocalTime')}
            <input type="datetime-local" name="date" defaultValue={localDate} required />
          </label>
        </div>
        {prices[symbol] !== undefined && (
          <button
            type="button"
            className="text-button quote-fill"
            onClick={() =>
              setPrice(prices[symbol]!.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''))
            }
          >
            {i18n.t('portfolio.useDisplayedMarketQuote')}
            {money(prices[symbol])} USDT
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {i18n.t(error)}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {i18n.t('common:action.cancel')}
          </button>
          <button className="button primary" type="submit">
            {i18n.t('portfolio.saveSimulatedTransaction')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function Portfolio({ portfolios, selected, onSelect, onSave }: Props) {
  useTranslation();
  const p = portfolios[selected] ?? portfolios[0];
  const query = useMarkets();
  const prices = Object.fromEntries((query.data?.data ?? []).map((m) => [m.symbol, m.price]));
  const ledger = account(p.transactions, prices);
  const [editing, setEditing] = useState<Transaction | 'new' | null>(null);
  const [message, setMessage] = useState('');
  const [rename, setRename] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  function update(next: PortfolioData) {
    onSave(portfolios.map((item, i) => (i === selected ? validatePortfolio(next) : item)));
  }
  function saveTransaction(t: Transaction) {
    const next = {
      ...p,
      transactions:
        editing !== 'new' && editing
          ? p.transactions.map((old) => (old.id === t.id ? t : old))
          : [...p.transactions, t],
    };
    update(next);
    setEditing(null);
    setMessage('portfolio.simulatedTransactionSaved');
  }
  function removeTransaction(id: string) {
    try {
      update({ ...p, transactions: p.transactions.filter((t) => t.id !== id) });
      setMessage('portfolio.transactionRemoved');
    } catch {
      setMessage('portfolio.thisTransactionSupportsALaterSaleEdit');
    }
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investing-hub-demo-portfolio.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  const holdings = ledger.holdings.filter((h) => h.quantity > 0);
  return (
    <>
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
      <Notice>{i18n.t('portfolio.guestDemoExampleTradesAreFictionalStored')}</Notice>
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
          onClick={() => {
            onSave([
              ...portfolios,
              {
                version: 1,
                name: i18n.t('portfolio.newName', { count: portfolios.length + 1 }),
                transactions: [],
              },
            ]);
            onSelect(portfolios.length);
          }}
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
          disabled={portfolios.length <= 1}
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
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              update({ ...p, name: String(form.get('name')) });
              setRename(false);
            } catch {
              setMessage('portfolio.nameValidation');
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
            onClick={() => {
              onSave(portfolios.filter((_, i) => i !== selected));
              onSelect(0);
              setConfirmDelete(false);
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
    </>
  );
}
