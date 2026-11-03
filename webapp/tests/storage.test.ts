import { describe, expect, it } from 'vitest';
import { readStored, writeStored } from '../src/lib/storageAdapter';
import { validatePortfolio, type Portfolio } from '@investing-hub/shared/portfolio';
const empty: Portfolio = { version: 1, name: 'Guest', transactions: [] };
const buy = {
  id: 'one',
  symbol: 'BTCUSDT',
  side: 'buy',
  quantity: '0.1',
  price: '100',
  fee: '1',
  timestamp: '2024-01-01T00:00:00.000Z',
} as const;
describe('guest portfolio persistence', () => {
  it('round trips exact decimal strings and does not overwrite unreadable historical data', () => {
    let raw = '{broken';
    const storage = {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        raw = value;
      },
    };
    const initial = readStored(storage, 'ih:portfolios:v1', empty, validatePortfolio);
    expect(initial.warning).not.toBe('');
    expect(raw).toBe('{broken');
    const portfolio = { ...empty, transactions: [buy] };
    expect(writeStored(storage, 'ih:portfolios:v1', portfolio, validatePortfolio).warning).toBe('');
    expect(
      readStored(storage, 'ih:portfolios:v1', empty, validatePortfolio).value.transactions[0]
        .quantity,
    ).toBe('0.1');
  });
  it('never persists an invalid replay and reports storage denial without losing in-memory changes', () => {
    let writes = 0;
    const storage = {
      getItem: () => null,
      setItem: () => {
        writes++;
        throw new Error('Quota exceeded');
      },
    };
    expect(() =>
      writeStored(
        storage,
        'portfolio',
        { ...empty, transactions: [{ ...buy, side: 'sell' }] },
        validatePortfolio,
      ),
    ).toThrow();
    expect(writes).toBe(0);
    const value = { ...empty, transactions: [buy] };
    const saved = writeStored(storage, 'portfolio', value, validatePortfolio);
    expect(saved.value).toEqual(value);
    expect(saved.warning).toContain('only until');
  });
});
