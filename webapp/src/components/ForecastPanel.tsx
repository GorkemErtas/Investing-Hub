import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { assets, type Market, type Symbol } from '@investing-hub/shared/contracts';
import { forecastHorizonSchema, type ForecastHorizon } from '@investing-hub/shared/forecasts';
import { useForecast, useObjectiveForecast } from '../lib/api';
import { money, percent, utc } from '../lib/format';
import { ErrorState, Skeleton } from './ui';

function PriceProjection({
  symbol,
  horizon,
  clock,
}: {
  symbol: Symbol;
  horizon: ForecastHorizon;
  clock: number;
}) {
  const { t } = useTranslation();
  const query = useForecast(symbol, horizon);
  const f = query.data;
  const available =
    !query.isError &&
    f?.status === 'experimental' &&
    !f.stale &&
    Date.parse(f.targetTime!) > clock &&
    clock - Date.parse(f.sourceCandleTime!) <= 90000 &&
    Date.parse(f.generatedAt) <= clock;
  return (
    <div className="price-projection">
      <p className="forecast-note">{t('objectiveForecast.priceDisclosure')}</p>
      {query.isPending ? (
        <Skeleton rows={2} />
      ) : query.isError ? (
        <ErrorState message={t('forecast.error')} retry={() => void query.refetch()} />
      ) : available ? (
        <>
          <span className="pill">{t('forecast.experimental')}</span>
          <p className="forecast-price">
            {money(f.predictedPrice!)} <small>USDT</small>
          </p>
          <p>
            {t('forecast.expectedChange')} {percent(Math.expm1(f.predictedLogReturn!) * 100)}
          </p>
          <p className="forecast-note">
            {t('forecast.target')} <time dateTime={f.targetTime!}>{utc(f.targetTime!)}</time>
          </p>
          <p className="forecast-note">
            {t('forecast.generated')} {utc(f.generatedAt)}
          </p>
        </>
      ) : (
        <p role="status">{t('objectiveForecast.priceUnavailable')}</p>
      )}
    </div>
  );
}

export function ForecastPanel({ symbol, market }: { symbol: Symbol; market?: Market }) {
  const { t, i18n } = useTranslation();
  const [horizon, setHorizon] = useState<ForecastHorizon>('1m');
  const [objective, setObjective] = useState<'direction' | 'volatility'>('direction');
  const [priceOpen, setPriceOpen] = useState(false);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useObjectiveForecast(symbol, horizon);
  const f = query.data;
  const selected = f?.[objective];
  const fresh =
    !query.isError &&
    !!f &&
    !f.stale &&
    !!f.expiresAt &&
    Date.parse(f.expiresAt) > clock &&
    !!f.sourceCandleTime &&
    clock - Date.parse(f.sourceCandleTime) <= 90000 &&
    Date.parse(f.generatedAt) <= clock;
  const available = selected?.status === 'validated' && fresh;
  const stale = !!f?.stale || (selected?.status === 'validated' && !fresh);
  const asset = assets.find((a) => a.symbol === symbol)!;
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, { maximumSignificantDigits: 4 }).format(value);
  const probability = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value);
  const evaluation = selected?.evaluation;
  const explanation =
    selected?.reason === 'future_confirmation_required'
      ? 'futureRequired'
      : selected?.reason === 'no_robust_direction_advantage' ||
          selected?.reason === 'no_robust_volatility_advantage'
        ? 'noAdvantage'
        : 'waiting';
  return (
    <section id="forecast" className="panel forecast-panel" aria-labelledby="forecast-heading">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{asset.base} / USDT</div>
          <h2 id="forecast-heading">
            <FlaskConical size={17} aria-hidden="true" /> {t('objectiveForecast.title')}
          </h2>
        </div>
        <span className="pill">
          {t(available ? 'objectiveForecast.validated' : 'forecast.unavailable')}
        </span>
      </div>
      <div className="forecast-content">
        <div className="forecast-market">
          <span>{t('forecast.currentPrice')}</span>
          <strong>{money(market?.price)} USDT</strong>
        </div>
        <div
          className="segmented forecast-horizons"
          role="group"
          aria-label={t('forecast.horizon')}
        >
          {forecastHorizonSchema.options.map((h) => (
            <button
              key={h}
              disabled={h === '1M'}
              aria-pressed={horizon === h}
              aria-describedby={h === '1M' ? 'monthly-explanation' : undefined}
              onClick={() => setHorizon(h)}
              className={horizon === h ? 'selected' : ''}
            >
              {h}
            </button>
          ))}
        </div>
        <p id="monthly-explanation" className="muted forecast-note">
          {t('forecast.monthly')}
        </p>
        <div
          className="segmented objective-tabs"
          role="group"
          aria-label={t('objectiveForecast.objective')}
        >
          {(['direction', 'volatility'] as const).map((name) => (
            <button
              key={name}
              aria-pressed={objective === name}
              className={objective === name ? 'selected' : ''}
              onClick={() => setObjective(name)}
            >
              {t(`objectiveForecast.${name}`)}
            </button>
          ))}
        </div>
        <div className="objective-result" aria-live="polite" aria-atomic="true">
          {query.isPending ? (
            <Skeleton rows={3} />
          ) : query.isError ? (
            <ErrorState message={t('forecast.error')} retry={() => void query.refetch()} />
          ) : available && f ? (
            <>
              {objective === 'direction' && f.direction.probabilities ? (
                <>
                  <p className="objective-value">
                    {t(`objectiveForecast.${f.direction.direction}`)}
                  </p>
                  <p>
                    {t('objectiveForecast.calibratedProbability')}{' '}
                    <strong>
                      {probability(f.direction.probabilities[f.direction.direction!])}
                    </strong>
                  </p>
                  <div className="direction-probabilities">
                    {(['down', 'neutral', 'up'] as const).map((label) => (
                      <div key={label}>
                        <span>{t(`objectiveForecast.${label}`)}</span>
                        <strong>{probability(f.direction.probabilities![label])}</strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : objective === 'volatility' && f.volatility.expectedVolatility !== null ? (
                <>
                  <p className="objective-value">{probability(f.volatility.expectedVolatility)}</p>
                  <p>
                    {t('objectiveForecast.movementLevel')}{' '}
                    <strong>{t(`objectiveForecast.${f.volatility.riskCategory}`)}</strong>
                  </p>
                  <p className="forecast-note muted">{t('objectiveForecast.volatilityUnits')}</p>
                  {f.volatility.interval && (
                    <p className="forecast-note">
                      {t('objectiveForecast.interval')} {probability(f.volatility.interval.lower)} –{' '}
                      {probability(f.volatility.interval.upper)}
                      <br />
                      {t('objectiveForecast.measuredCoverage')}{' '}
                      {probability(f.volatility.interval.measuredCoverage)}
                    </p>
                  )}
                </>
              ) : null}
              <dl className="forecast-details">
                <div>
                  <dt>{t('forecast.target')}</dt>
                  <dd>
                    <time dateTime={f.targetTime!}>{utc(f.targetTime!)}</time>
                  </dd>
                </div>
                <div>
                  <dt>{t('forecast.generated')}</dt>
                  <dd>{utc(selected!.generatedAt!)}</dd>
                </div>
                <div>
                  <dt>{t('forecast.input')}</dt>
                  <dd>{utc(f.sourceCandleTime!)}</dd>
                </div>
                <div>
                  <dt>{t('forecast.marketFetched')}</dt>
                  <dd>{utc(f.marketUpdatedAt!)}</dd>
                </div>
                <div>
                  <dt>{t('objectiveForecast.expires')}</dt>
                  <dd>{utc(f.expiresAt!)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="forecast-empty" role="status">
              <strong>{t(stale ? 'forecast.stale' : 'forecast.unavailable')}</strong>
              <p>{t(stale ? 'forecast.staleReason' : `objectiveForecast.${explanation}`)}</p>
            </div>
          )}
        </div>
        {evaluation && (
          <details className="forecast-model">
            <summary>{t('forecast.modelInfo')}</summary>
            <p>
              {t(
                evaluation.futureConfirmed
                  ? 'objectiveForecast.futureConfirmed'
                  : 'objectiveForecast.developmentOnly',
              )}
            </p>
            <p className="forecast-version">
              {available
                ? `${selected?.algorithm} · ${selected?.modelVersion}`
                : evaluation.candidate}
            </p>
            <dl className="forecast-details">
              <div>
                <dt>
                  {t(
                    objective === 'direction'
                      ? 'objectiveForecast.logLoss'
                      : 'objectiveForecast.volatilityMae',
                  )}
                </dt>
                <dd>{number(evaluation.primaryLoss)}</dd>
              </div>
              <div>
                <dt>{t('objectiveForecast.baselineImprovement')}</dt>
                <dd>{percent(evaluation.baselineRelativeImprovement * 100)}</dd>
              </div>
              {evaluation.calibrationError !== null && (
                <div>
                  <dt>{t('objectiveForecast.calibrationError')}</dt>
                  <dd>{probability(evaluation.calibrationError)}</dd>
                </div>
              )}
              {evaluation.intervalCoverage !== null && (
                <div>
                  <dt>{t('objectiveForecast.measuredCoverage')}</dt>
                  <dd>{probability(evaluation.intervalCoverage)}</dd>
                </div>
              )}
            </dl>
          </details>
        )}
        <details
          className="forecast-model optional-price"
          onToggle={(event) => setPriceOpen(event.currentTarget.open)}
        >
          <summary>{t('objectiveForecast.priceProjection')}</summary>
          {priceOpen && <PriceProjection symbol={symbol} horizon={horizon} clock={clock} />}
        </details>
        <p className="muted forecast-note">{t('objectiveForecast.disclaimer')}</p>
      </div>
    </section>
  );
}
