import { i18n, userError } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { assets, type Symbol } from '@investing-hub/shared/contracts';
import type { Transaction } from '@investing-hub/shared/portfolio';
import { decimalInput, decimalDisplay, localeValue } from '@investing-hub/shared/localization';
import { ApiError } from '@investing-hub/shared/client';
import { money } from '../lib/format';

export function TransactionDialog({
  original,
  prices,
  onSave,
  onClose,
}: {
  original?: Transaction;
  prices: Partial<Record<Symbol, number>>;
  onSave: (t: Transaction) => Promise<void>;
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
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    try {
      if (!event.currentTarget.checkValidity()) throw new Error('common:errors.INVALID_REQUEST');
      const date = new Date(String(data.get('date')));
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now())
        throw new Error('portfolio.chooseAValidDateInThePast');
      setPending(true);
      await onSave({
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
            : e instanceof ApiError
              ? userError(e)
              : 'portfolio.invalidHistory'
          : 'portfolio.usePositiveQuantitiesAndPricesWithAt',
      );
    } finally {
      setPending(false);
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
          <button className="button primary" type="submit" disabled={pending}>
            {i18n.t('portfolio.saveSimulatedTransaction')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
