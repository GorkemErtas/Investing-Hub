import { useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import {
  type NewsCoverage,
  type NewsEvent,
  type NewsInsightResponse,
  type NewsSymbol,
} from '@investing-hub/shared/news';
import { useNewsInsight } from '../lib/api';
import { utc } from '../lib/format';
import { ErrorState, Notice, Skeleton } from './ui';

const label = (value: string) => value.replaceAll('_', ' ');
const sourceNames: Record<string, string> = {
  bitcoin_core: 'Bitcoin Core',
  ethereum_foundation: 'Ethereum Foundation',
  lighthouse_releases: 'Lighthouse releases',
  fed_0: 'Federal Reserve releases',
  fed_1: 'Federal Reserve monetary policy',
  sec: 'SEC releases',
  gdelt_btc: 'GDELT · Bitcoin',
  gdelt_eth: 'GDELT · Ethereum',
  gdelt_market: 'GDELT · Crypto market',
};
const coverageReasons: Record<string, string> = {
  request_timeout: 'Request timed out',
  http_rate_limit: 'HTTP rate limit',
  provider_rate_limit: 'Provider rate limit',
  local_cooldown: 'Local cooldown; no request sent',
  no_matching_articles: 'No matching articles',
  no_relevant_articles: 'No relevant articles in the date window',
  invalid_records: 'Records rejected by validation',
  invalid_response: 'Invalid response',
  some_records_rejected: 'Some records excluded',
  connection_failed: 'Connection failed',
  http_error: 'HTTP error',
  daily_budget_exhausted: 'Daily request budget reached',
  automated_access_terms_require_review: 'Disabled pending access permission',
  disabled_by_configuration: 'Disabled',
};

function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{utc(value)}</time>;
}

function Headline({ event }: { event: NewsEvent }) {
  const evidence = event.evidence;
  return (
    <article className="news-headline">
      <div className="news-tags">
        <span className="pill">{label(evidence.category)}</span>
        <span>
          {evidence.scope === 'market_wide'
            ? 'Market-wide · BTC & ETH'
            : `${event.symbol === 'BTCUSDT' ? 'BTC' : 'ETH'} specific`}
        </span>
      </div>
      <h3>
        <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">
          {evidence.title} <ExternalLink size={13} aria-label="Opens in a new tab" />
        </a>
      </h3>
      <p className="news-source">
        {evidence.sourceName}{' '}
        <span>
          ·{' '}
          {evidence.reliability === 'official_primary' ? 'Original source' : 'Via GDELT news index'}
        </span>
      </p>
      <dl className="news-times">
        <div>
          <dt>Published at</dt>
          <dd>{evidence.publishedAt ? <Timestamp value={evidence.publishedAt} /> : 'Unknown'}</dd>
        </div>
        {evidence.indexedAt && (
          <div>
            <dt>Indexed at</dt>
            <dd>
              <Timestamp value={evidence.indexedAt} />
            </dd>
          </div>
        )}
        <div>
          <dt>Retrieved at</dt>
          <dd>
            <Timestamp value={evidence.observedAt} />
          </dd>
        </div>
      </dl>
      {event.analysisStatus === 'analyzed' ? (
        <div className="news-analysis">
          <p>AI classification · high uncertainty</p>
          <dl>
            <div>
              <dt>Sentiment</dt>
              <dd>{event.sentiment}</dd>
            </div>
            <div>
              <dt>Potential impact</dt>
              <dd>{event.potentialImpact}</dd>
            </div>
            <div>
              <dt>Report type</dt>
              <dd>{label(event.reportType)}</dd>
            </div>
          </dl>
          <blockquote>{event.evidenceQuote}</blockquote>
          <p>{event.explanation}</p>
        </div>
      ) : null}
    </article>
  );
}

function Coverage({ coverage }: { coverage: NewsCoverage[] }) {
  return (
    <details className="news-coverage">
      <summary>Source coverage · {coverage.length} source checks</summary>
      <ul>
        {coverage.map((source) => (
          <li key={source.sourceId}>
            <div>
              <strong>{sourceNames[source.sourceId] ?? label(source.sourceId)}</strong>
              <span className={`news-provider-status news-provider-${source.status}`}>
                {label(source.status)}
              </span>
            </div>
            <p>
              {source.reason
                ? (coverageReasons[source.reason] ?? 'Source check incomplete')
                : 'Source metadata received'}{' '}
              · {source.accepted} accepted, {source.rejected} excluded
            </p>
            <p>
              {source.httpStatus !== null && `HTTP ${source.httpStatus} · `}
              {source.elapsedMs !== null && `${(source.elapsedMs / 1000).toFixed(2)} s · `}
              <Timestamp value={source.checkedAt} />
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}

const unavailableMessages = {
  disabled: [
    'News collection is disabled',
    'Headlines appear here after collection is enabled and a cache is populated.',
  ],
  no_snapshot: ['No cached news yet', 'No source metadata has been collected for this asset.'],
  retention_expired: [
    'Cached news has expired',
    'The last collection is outside the retention window.',
  ],
  storage_unavailable: [
    'News cache unavailable',
    'Stored news could not be read safely. Please try again later.',
  ],
};

function NewsResults({
  response,
  readFailed,
}: {
  response: NewsInsightResponse;
  readFailed: boolean;
}) {
  const data = response.data;
  if (!data) {
    const [title, message] = unavailableMessages[response.reason ?? 'no_snapshot'];
    return (
      <div className="empty-state" role="status">
        <Newspaper size={28} />
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
    );
  }
  const stale = response.freshness === 'stale' || readFailed;
  const coinSpecific = data.events.filter(
    (event) => event.evidence.scope === 'coin_specific',
  ).length;
  return (
    <>
      <div className="news-meta" role="status">
        <span className={`status ${stale ? 'warning-text' : ''}`}>
          <i className={`status-dot ${stale ? 'offline' : ''}`} />
          {stale ? 'Stale cached data' : 'Fresh cache'}
        </span>
        <span>
          Last checked: <Timestamp value={data.lastCheckedAt} />
        </span>
        <span>
          {coinSpecific} coin-specific · {data.events.length - coinSpecific} market-wide
        </span>
      </div>
      {stale && (
        <Notice>
          {readFailed
            ? 'The cache could not be rechecked. Showing the last available response.'
            : 'This cache is past its refresh time. Headlines may be outdated; source collection runs separately.'}
        </Notice>
      )}
      <div className="news-ai-status">
        <strong>
          {data.analysisStatus === 'analyzed'
            ? 'AI classifications · headline evidence only'
            : data.analysisStatus === 'not_analyzed'
              ? 'AI analysis not run'
              : 'AI analysis not enabled'}
        </strong>
        <p>
          {data.analysisStatus === 'analyzed'
            ? 'Only evidence-linked classifications are shown, with high uncertainty. This is not a price forecast.'
            : 'Headlines and source metadata remain available. No sentiment or market-impact conclusion is inferred.'}
        </p>
        {data.analysisStatus === 'analyzed' && data.analyzedAt && (
          <p>
            {data.model} · Analyzed at <Timestamp value={data.analyzedAt} />
          </p>
        )}
      </div>
      {data.events.length ? (
        <div className="news-headlines">
          {data.events.map((event) => (
            <Headline key={event.evidence.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="empty-state" role="status">
          <h3>Insufficient news evidence</h3>
          <p>
            No matching, usable headline metadata was retained for this asset. See source coverage
            below.
          </p>
        </div>
      )}
      <Coverage coverage={data.coverage} />
      {data.attribution.length > 0 && (
        <div className="news-attribution">
          <span>Source attribution:</span>
          {data.attribution.map((source) => (
            <a key={source.provider} href={source.url} target="_blank" rel="noopener noreferrer">
              {source.name}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

export function NewsIntelligence() {
  const [symbol, setSymbol] = useState<NewsSymbol>('BTCUSDT');
  const query = useNewsInsight(symbol);
  return (
    <section className="panel news-intelligence" aria-labelledby="news-heading">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SOURCE METADATA · BTC & ETH</div>
          <h2 id="news-heading">News Intelligence</h2>
          <p>Cached headlines, original sources and explicit coverage.</p>
        </div>
        <div className="news-controls">
          <label>
            <span className="sr-only">News asset</span>
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value as NewsSymbol)}
            >
              <option value="BTCUSDT">Bitcoin (BTC)</option>
              <option value="ETHUSDT">Ethereum (ETH)</option>
            </select>
          </label>
          <button
            className="text-button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={14} />
            Check cache
          </button>
        </div>
      </div>
      <div className="news-content" aria-busy={query.isFetching}>
        {query.isPending ? (
          <Skeleton rows={3} />
        ) : query.data ? (
          <NewsResults response={query.data} readFailed={query.isError} />
        ) : (
          <ErrorState
            message="The news cache could not be loaded. Please try again later."
            retry={() => void query.refetch()}
          />
        )}
        <p className="news-disclaimer">
          Only headline metadata is shown. Linked article bodies were not read or independently
          fact-checked. Opening this page or checking the cache never collects news or runs AI
          analysis.
        </p>
      </div>
    </section>
  );
}
