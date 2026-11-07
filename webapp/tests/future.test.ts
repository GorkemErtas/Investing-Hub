import { afterEach, expect, it, vi } from 'vitest';
import { requestFutureReview } from '../src/lib/api';
import { analysisFixture } from '../../shared/tests/future-fixtures';
afterEach(() => vi.unstubAllGlobals());
it('requests a private paid review with explicit consent and no client numeric payload', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(analysisFixture('BTCUSDT', Date.now(), true, true))),
  );
  vi.stubGlobal('fetch', fetch);
  await requestFutureReview('BTCUSDT', new AbortController().signal);
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/future-analysis/BTCUSDT/review');
  expect(options.cache).toBe('no-store');
  expect(options.method).toBe('POST');
  expect(JSON.parse(String(options.body))).toEqual({
    allowPaid: true,
    requestId: expect.any(String),
  });
});
it('rejects a different coin response and never retries failed paid requests', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(analysisFixture('ETHUSDT', Date.now()))),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(requestFutureReview('BTCUSDT', new AbortController().signal)).rejects.toThrow(
    'did not pass validation',
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
