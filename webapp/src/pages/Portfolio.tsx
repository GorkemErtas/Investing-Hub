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
import { money, utc } from '../lib/format';
import { Coin, Notice, Stat, Status } from '../components/ui';

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
  const ref = useRef<HTMLDialogElement>(null);
  const [symbol, setSymbol] = useState<Symbol>(original?.symbol ?? 'BTCUSDT');
  const [price, setPrice] = useState(original?.price ?? '');
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
      const date = new Date(String(data.get('date')));
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now())
        throw new Error('Choose a valid date in the past or present.');
      onSave({
        id: original?.id ?? crypto.randomUUID(),
        symbol,
        side: data.get('side') as 'buy' | 'sell',
        quantity: String(data.get('quantity')),
        price,
        fee: String(data.get('fee')),
        timestamp: date.toISOString(),
      });
    } catch (e) {
      setError(
        e instanceof Error && !('issues' in e)
          ? e.message
          : 'Use positive quantities and prices with at most 8 decimals, and a nonnegative fee.',
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
          <div className="eyebrow">PAPER TRADING ONLY</div>
          <h2 id="transaction-title">{original ? 'Edit' : 'Add'} transaction</h2>
        </div>
        <button className="icon-button" aria-label="Close transaction form" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <p className="muted">Record a simulated trade. No order is sent to an exchange.</p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>
            Asset
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
            Side
            <select name="side" defaultValue={original?.side ?? 'buy'}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </label>
          <label>
            Quantity
            <input
              name="quantity"
              inputMode="decimal"
              defaultValue={original?.quantity}
              placeholder="0.00"
              required
            />
          </label>
          <label>
            Price in USDT
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          <label>
            Fee in USDT
            <input name="fee" inputMode="decimal" defaultValue={original?.fee ?? '0'} required />
          </label>
          <label>
            Date & time (your local time)
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
            Use displayed market quote: {money(prices[symbol])} USDT
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save simulated transaction
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function Portfolio({ portfolios, selected, onSelect, onSave }: Props) {
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
    setMessage('Simulated transaction saved.');
  }
  function removeTransaction(id: string) {
    try {
      update({ ...p, transactions: p.transactions.filter((t) => t.id !== id) });
      setMessage('Transaction removed.');
    } catch {
      setMessage('This transaction supports a later sale. Edit or remove that sale first.');
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
          <div className="eyebrow">PRACTICE WITH PERSPECTIVE</div>
          <h1>
            Your portfolio<span className="heading-dot">.</span>
          </h1>
          <p>A space to learn. Simulated trades, real accounting.</p>
        </div>
        <button className="button primary" onClick={() => setEditing('new')}>
          <Plus size={17} />
          Add transaction
        </button>
      </div>
      <Notice>
        Guest demo · Example trades are fictional. Stored only in this browser. No real orders, cash
        account, or financial advice.
      </Notice>
      <div className="portfolio-toolbar">
        <label>
          <span className="sr-only">Active portfolio</span>
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
              { version: 1, name: `Demo portfolio ${portfolios.length + 1}`, transactions: [] },
            ]);
            onSelect(portfolios.length);
          }}
        >
          {' '}
          <Plus size={15} />
          New portfolio
        </button>
        <button
          className="icon-button"
          aria-label="Rename portfolio"
          onClick={() => setRename(!rename)}
        >
          <Pencil size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Delete portfolio"
          disabled={portfolios.length <= 1}
          onClick={() => setConfirmDelete(!confirmDelete)}
        >
          <Trash2 size={16} />
        </button>
        <button className="button secondary export-button" onClick={exportData}>
          <Download size={15} />
          Export
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
              setMessage('Choose a portfolio name between 1 and 60 characters.');
            }
          }}
        >
          <label>
            Portfolio name{' '}
            <input name="name" defaultValue={p.name} maxLength={60} minLength={1} required />
          </label>
          <button className="button primary">Save name</button>
        </form>
      )}
      {confirmDelete && (
        <div className="notice">
          Delete “{p.name}” and its simulated transactions?
          <button
            className="button danger"
            onClick={() => {
              onSave(portfolios.filter((_, i) => i !== selected));
              onSelect(0);
              setConfirmDelete(false);
            }}
          >
            Delete portfolio
          </button>
          <button className="text-button" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      )}
      {message && (
        <p className="feedback" role="status">
          {message}
        </p>
      )}
      <div className="stats-grid">
        <Stat
          label="Market value"
          value={money(ledger.marketValue)}
          note="USDT · current remaining holdings"
          icon={<Wallet size={17} />}
        />
        <Stat
          label="Remaining cost basis"
          value={money(ledger.costBasis)}
          note="USDT · includes purchase fees"
          icon={<Wallet size={17} />}
        />
        <Stat
          label="Unrealized profit / loss"
          value={money(ledger.unrealized)}
          note="USDT · open positions"
          icon={<Wallet size={17} />}
        />
        <Stat
          label="Realized profit / loss"
          value={money(ledger.realized)}
          note="USDT · net of sale fees"
          icon={<Wallet size={17} />}
        />
      </div>
      {query.isError || query.data?.meta.stale ? (
        <Notice>
          Live quotes are unavailable or stale. Missing prices stay blank; saved transaction
          accounting still works.
        </Notice>
      ) : null}
      <div className="portfolio-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your holdings</h2>
              <p>Weighted average cost basis · USDT</p>
            </div>
            <span className="pill">{holdings.length} assets</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Quantity</th>
                  <th>Avg. cost</th>
                  <th>Market value</th>
                  <th>Unrealized P/L</th>
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
                    <td>{h.quantity.toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
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
                <strong>No open positions</strong>
                <p>Add a simulated buy to start exploring.</p>
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
              <h2>Asset allocation</h2>
              <p>By current market value</p>
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
                  <strong>{((h.marketValue! / ledger.marketValue!) * 100).toFixed(1)}%</strong>
                </div>
              ))}
            </>
          ) : (
            <div className="empty-state">
              <p>Allocation needs open holdings and available quotes.</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Transaction history</h2>
            <p>Simulated transactions · chronological accounting · timestamps in UTC</p>
          </div>
          <span className="pill">{p.transactions.length} transactions</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Asset</th>
                <th>Side</th>
                <th>Quantity</th>
                <th>Price (USDT)</th>
                <th>Fee</th>
                <th>Gross total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...ledger.ordered].reverse().map((t) => (
                <tr key={t.id}>
                  <td>{utc(t.timestamp)}</td>
                  <td>{t.symbol.replace('USDT', '')}</td>
                  <td>
                    <span className={`side-badge ${t.side}`}>{t.side}</span>
                  </td>
                  <td>{t.quantity}</td>
                  <td>{money(Number(t.price))}</td>
                  <td>{money(Number(t.fee))}</td>
                  <td>{money(Number(t.quantity) * Number(t.price))}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Edit ${t.side} ${t.symbol} on ${utc(t.timestamp)}`}
                        onClick={() => setEditing(t)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${t.side} ${t.symbol} on ${utc(t.timestamp)}`}
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
              <p>Your simulated transaction history will appear here.</p>
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
