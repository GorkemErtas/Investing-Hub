import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNewsInsight } from '../src/lib/api';
import { newsFixture, unavailableFixture } from './news-fixtures';

afterEach(() => vi.unstubAllGlobals());
describe('schema-validated, read-only news client', () => {
  it.each(['BTCUSDT', 'ETHUSDT'] as const)(
    'reads source-only %s from the cached API only',
    async (symbol) => {
      const fetcher = vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(newsFixture(symbol))),
      );
      vi.stubGlobal('fetch', fetcher);
      const data = await getNewsInsight(symbol, new AbortController().signal);
      expect(data.data).toMatchObject({
        analysisStatus: 'not_configured',
        summary: null,
        outlook: 'unknown',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe(`/api/news/insights/${symbol}`);
      expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Accept: 'application/json' } });
      expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
    },
  );
  it('preserves publication and indexing separately with AI disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(newsFixture('BTCUSDT', { disabledAi: true })))),
    );
    expect(
      (await getNewsInsight('BTCUSDT', new AbortController().signal)).data!.events[0],
    ).toMatchObject({
      analysisStatus: 'disabled',
      sentiment: 'unknown',
      potentialImpact: 'unknown',
      evidence: { publishedAt: null, indexedAt: '2026-11-07T06:00:00.000Z' },
    });
  });
  it.each([
    newsFixture('BTCUSDT', { stale: true }),
    newsFixture('ETHUSDT', { empty: true }),
    unavailableFixture('disabled'),
  ])('accepts explicit stale, insufficient and unavailable states', async (fixture) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(fixture))),
    );
    expect(await getNewsInsight(fixture.symbol, new AbortController().signal)).toEqual(fixture);
  });
  it.each(['javascript:alert(1)', 'https://user:secret@example.com/', 'http://127.0.0.1/'])(
    'rejects unsafe source links before rendering: %s',
    async (url) => {
      const fixture = newsFixture();
      fixture.data!.events[0].evidence.sourceUrl = url;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(fixture))),
      );
      await expect(getNewsInsight('BTCUSDT', new AbortController().signal)).rejects.toThrow(
        'could not validate',
      );
    },
  );
  it('rejects a response for the wrong coin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(newsFixture('ETHUSDT')))),
    );
    await expect(getNewsInsight('BTCUSDT', new AbortController().signal)).rejects.toThrow(
      'could not validate',
    );
  });
  it('reports cache errors without trying another provider', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(getNewsInsight('BTCUSDT', new AbortController().signal)).rejects.toThrow(
      'News cache service unavailable',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
