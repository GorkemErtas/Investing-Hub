import {
  newsInsightResponseSchema,
  type NewsInsightResponse,
  type NewsSymbol,
} from '@investing-hub/shared/news';

// Explicitly synthetic fixtures. Never imported by application code.
export function newsFixture(
  symbol: NewsSymbol = 'BTCUSDT',
  options: { stale?: boolean; empty?: boolean; analyzed?: boolean; disabledAi?: boolean } = {},
): NewsInsightResponse {
  const indexed = symbol === 'BTCUSDT';
  const analysisStatus = options.analyzed
    ? 'analyzed'
    : options.disabledAi
      ? 'disabled'
      : 'not_configured';
  const evidence = {
    id: (indexed ? 'a' : 'b').repeat(32),
    title: indexed
      ? 'TEST FIXTURE Bitcoin ETF source headline'
      : 'TEST FIXTURE Ethereum Lighthouse software release',
    sourceUrl: indexed
      ? 'http://publisher.example.com/bitcoin-fixture'
      : 'https://github.com/sigp/lighthouse/releases/tag/v0.0.0-fixture',
    providerUrl: indexed
      ? 'https://www.gdeltproject.org/'
      : 'https://api.github.com/repos/sigp/lighthouse/releases?per_page=10',
    provider: indexed ? 'gdelt' : 'lighthouse_releases',
    sourceName: indexed ? 'publisher.example.com' : 'Sigma Prime / Lighthouse releases',
    publisherDomain: indexed ? 'publisher.example.com' : 'github.com',
    language: 'English',
    publishedAt: indexed ? null : '2026-10-23T00:41:38.000Z',
    indexedAt: indexed ? '2026-11-07T06:00:00.000Z' : null,
    observedAt: '2026-11-07T07:00:00.000Z',
    contentLevel: 'headline_only',
    reliability: indexed ? 'news_index' : 'official_primary',
    category: indexed ? 'etf' : 'network',
    scope: 'coin_specific',
    symbols: [symbol],
    sourceResponseSha256: 'c'.repeat(64),
  };
  const data = {
    schemaVersion: 'news-insight-v2',
    symbol,
    status: options.empty ? 'insufficient_evidence' : 'available',
    generatedAt: '2026-11-07T07:00:00.000Z',
    lastCheckedAt: '2026-11-07T07:30:00.000Z',
    expiresAt: '2026-11-07T13:30:00.000Z',
    model: options.analyzed ? 'test-model' : null,
    analysisStatus,
    analyzedAt: options.analyzed ? '2026-11-07T07:15:00.000Z' : null,
    evidenceFingerprint: 'd'.repeat(64),
    outlook: options.analyzed ? 'neutral' : 'unknown',
    summary: options.analyzed ? 'TEST FIXTURE headline-only classification.' : null,
    events: options.empty
      ? []
      : [
          {
            evidence,
            symbol,
            analysisStatus,
            analyzedAt: options.analyzed ? '2026-11-07T07:15:00.000Z' : null,
            sentiment: options.analyzed ? 'neutral' : 'unknown',
            potentialImpact: options.analyzed ? 'low' : 'unknown',
            uncertainty: 'high',
            reportType: indexed ? 'unverified_reporting' : 'primary_statement',
            evidenceQuote: options.analyzed ? evidence.title : null,
            explanation: options.analyzed
              ? 'TEST FIXTURE classification from the supplied headline only.'
              : null,
          },
        ],
    coverage: [
      {
        sourceId: indexed ? 'gdelt_btc' : 'lighthouse_releases',
        provider: evidence.provider,
        status: options.empty ? 'empty' : 'ok',
        accepted: options.empty ? 0 : 1,
        rejected: 0,
        reason: options.empty ? 'no_matching_articles' : null,
        checkedAt: '2026-11-07T07:30:00.000Z',
        httpStatus: 200,
        elapsedMs: 42,
      },
      {
        sourceId: 'ethereum_foundation',
        provider: 'ethereum_foundation_rss',
        status: 'disabled',
        accepted: 0,
        rejected: 0,
        reason: 'automated_access_terms_require_review',
        checkedAt: '2026-11-07T07:30:00.000Z',
        httpStatus: null,
        elapsedMs: null,
      },
    ],
    attribution: [
      {
        provider: evidence.provider,
        name: indexed ? 'GDELT Project' : 'Sigma Prime / Lighthouse',
        url: indexed
          ? 'https://www.gdeltproject.org/'
          : 'https://github.com/sigp/lighthouse/releases',
        termsUrl: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
        usage: 'headline_metadata_and_links_only',
      },
    ],
    limitations: ['TEST FIXTURE: headline metadata only; not independently verified.'],
  };
  return newsInsightResponseSchema.parse({
    symbol,
    status: options.stale ? 'stale' : data.status,
    freshness: options.stale ? 'stale' : 'fresh',
    lastUpdatedAt: data.generatedAt,
    lastCheckedAt: data.lastCheckedAt,
    expiresAt: data.expiresAt,
    reason: null,
    data,
  });
}

export function unavailableFixture(
  reason: NonNullable<NewsInsightResponse['reason']>,
): NewsInsightResponse {
  return {
    symbol: 'BTCUSDT',
    status: 'unavailable',
    freshness: 'unavailable',
    lastUpdatedAt: null,
    lastCheckedAt: null,
    expiresAt: null,
    reason,
    data: null,
  };
}
