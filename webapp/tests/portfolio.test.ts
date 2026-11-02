import { describe, expect, it } from 'vitest';
import { account, validatePortfolio, type Transaction } from '../shared/portfolio';

const tx = (
  id: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  day: number,
  fee = '0',
): Transaction => ({
  id,
  side,
  quantity,
  price,
  fee,
  symbol: 'BTCUSDT',
  timestamp: `2024-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
});
describe('chronological weighted average ledger', () => {
  it('calculates weighted purchases, partial sale basis, realized and unrealized P/L', () => {
    const result = account(
      [
        tx('1', 'buy', '2', '100', 1),
        tx('2', 'buy', '1', '160', 2),
        tx('3', 'sell', '1', '150', 3),
      ],
      { BTCUSDT: 140 },
    );
    expect(result.holdings[0]).toEqual({
      symbol: 'BTCUSDT',
      quantity: 2,
      costBasis: 240,
      averagePrice: 120,
      realized: 30,
      marketValue: 280,
      unrealized: 40,
    });
    expect(result.realized).toBe(30);
  });
  it('capitalizes buy fees and deducts sell fees', () => {
    const result = account(
      [tx('1', 'buy', '2', '100', 1, '2'), tx('2', 'sell', '1', '150', 2, '1')],
      { BTCUSDT: 120 },
    );
    expect(result.holdings[0]).toMatchObject({
      costBasis: 101,
      averagePrice: 101,
      realized: 48,
      unrealized: 19,
    });
  });
  it('closes a position to zero basis and preserves realized profit', () => {
    const r = account([tx('1', 'buy', '0.3', '100', 1), tx('2', 'sell', '0.3', '110', 2)]);
    expect(r.holdings[0]).toMatchObject({
      quantity: 0,
      costBasis: 0,
      averagePrice: 0,
      realized: 3,
      marketValue: 0,
    });
  });
  it('starts a new cost basis after closing and reopening', () => {
    const r = account([
      tx('1', 'buy', '1', '100', 1),
      tx('2', 'sell', '1', '110', 2),
      tx('3', 'buy', '1', '150', 3),
    ]);
    expect(r.holdings[0]).toMatchObject({ quantity: 1, averagePrice: 150, realized: 10 });
  });
  it('handles decimal quantities exactly', () => {
    const r = account([
      tx('1', 'buy', '0.1', '1', 1),
      tx('2', 'buy', '0.2', '1', 2),
      tx('3', 'sell', '0.3', '2', 3),
    ]);
    expect(r.realized).toBe(0.3);
    expect(r.costBasis).toBe(0);
  });
  it('reorders history without mutating caller arrays', () => {
    const input = [tx('2', 'sell', '1', '120', 2), tx('1', 'buy', '1', '100', 1)];
    expect(account(input).realized).toBe(20);
    expect(input[0].id).toBe('2');
  });
  it('rejects a backdated oversell even if later purchases cover it', () => {
    expect(() => account([tx('1', 'buy', '1', '100', 3), tx('2', 'sell', '1', '100', 2)])).toThrow(
      'Insufficient',
    );
  });
  it('rejects editing or deleting a buy that supports a later sell', () => {
    const buy = tx('1', 'buy', '2', '100', 1),
      sale = tx('2', 'sell', '2', '110', 2);
    expect(() => validatePortfolio({ version: 1, name: 'Demo', transactions: [sale] })).toThrow();
    expect(() => account([{ ...buy, quantity: '1' }, sale])).toThrow();
  });
  it.each(['0', '-1', 'Infinity', 'NaN', '0.000000001', '1e2'])(
    'rejects invalid quantity %s',
    (quantity) => {
      expect(() => account([{ ...tx('1', 'buy', '1', '1', 1), quantity }])).toThrow();
    },
  );
  it('rejects duplicate IDs, invalid dates, negative fees and invalid actions', () => {
    const t = tx('1', 'buy', '1', '1', 1);
    expect(() => account([t, t])).toThrow('Duplicate');
    for (const fields of [
      { timestamp: 'garbage' },
      { fee: '-1' },
      { side: 'order' },
      { price: '0' },
    ])
      expect(() => account([{ ...t, ...fields } as Transaction])).toThrow();
  });
  it('keeps unknown valuations null instead of inventing zero prices', () => {
    const r = account([tx('1', 'buy', '1', '100', 1)]);
    expect(r.marketValue).toBeNull();
    expect(r.unrealized).toBeNull();
    expect(r.costBasis).toBe(100);
  });
  it('retains insertion order for equal timestamps', () => {
    expect(account([tx('1', 'buy', '1', '100', 1), tx('2', 'sell', '1', '110', 1)]).realized).toBe(
      10,
    );
    expect(() =>
      account([tx('2', 'sell', '1', '110', 1), tx('1', 'buy', '1', '100', 1)]),
    ).toThrow();
  });
});
