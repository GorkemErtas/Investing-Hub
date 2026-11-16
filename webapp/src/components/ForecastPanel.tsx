import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import { assets, type Market, type Symbol } from '@investing-hub/shared/contracts';
import { forecastHorizonSchema, type ForecastHorizon } from '@investing-hub/shared/forecasts';
import { useForecast } from '../lib/api';
import { money, percent, utc } from '../lib/format';
import { ErrorState, Skeleton } from './ui';

export function ForecastPanel({ symbol, market }: { symbol: Symbol; market?: Market }) {
  const { t, i18n } = useTranslation();
  const [horizon, setHorizon] = useState<ForecastHorizon>('1m');
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const query = useForecast(symbol, horizon);
  const forecast = query.data;
  const available =
    !query.isError &&
    forecast?.status === 'experimental' &&
    !forecast.stale &&
    Date.parse(forecast.targetTime!) > clock &&
    clock - Date.parse(forecast.sourceCandleTime!) <= 90000 &&
    Date.parse(forecast.generatedAt) <= clock;
  const stale = forecast?.stale || (forecast?.status === 'experimental' && !available);
  const asset = assets.find((a) => a.symbol === symbol)!;
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, { maximumSignificantDigits: 4 }).format(value);
  const reason =
    forecast?.reason === 'no_meaningful_validation_advantage'
      ? 'noAdvantage'
      : forecast?.reason === 'incomplete_required_benchmark'
        ? 'incomplete'
        : 'waiting';
  return (
    <section id="forecast" className="panel forecast-panel" aria-labelledby="forecast-heading">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{asset.base} / USDT</div>
          <h2 id="forecast-heading">
            <FlaskConical size={17} aria-hidden="true" /> {t('forecast.title')}
          </h2>
        </div>
        <span className="pill">
          {t(available ? 'forecast.experimental' : 'forecast.unavailable')}
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
        <div aria-live="polite" aria-atomic="true">
          {query.isPending ? (
            <Skeleton rows={3} />
          ) : query.isError ? (
            <ErrorState message={t('forecast.error')} retry={() => void query.refetch()} />
          ) : available ? (
            <>
              <p className="forecast-price">
                {money(forecast.predictedPrice!)} <small>USDT</small>
              </p>
              <p className="forecast-change">
                {t('forecast.expectedChange')}{' '}
                {percent(Math.expm1(forecast.predictedLogReturn!) * 100)}
              </p>
              <dl className="forecast-details">
                <div>
                  <dt>{t('forecast.target')}</dt>
                  <dd>
                    <time dateTime={forecast.targetTime!}>{utc(forecast.targetTime!)}</time>
                  </dd>
                </div>
                <div>
                  <dt>{t('forecast.generated')}</dt>
                  <dd>
                    <time dateTime={forecast.generatedAt}>{utc(forecast.generatedAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt>{t('forecast.input')}</dt>
                  <dd>{utc(forecast.sourceCandleTime!)}</dd>
                </div>
                <div>
                  <dt>{t('forecast.marketFetched')}</dt>
                  <dd>{utc(forecast.marketUpdatedAt!)}</dd>
                </div>
              </dl>
              <details className="forecast-model">
                <summary>{t('forecast.modelInfo')}</summary>
                <p>
                  {forecast.algorithm} ·{' '}
                  <span className="forecast-version">{forecast.modelVersion}</span>
                </p>
                <dl className="forecast-details">
                  <div>
                    <dt>{t('forecast.validationError')}</dt>
                    <dd>{number(forecast.evaluationMetrics!.validationReturnRmse)}</dd>
                  </div>
                  <div>
                    <dt>{t('forecast.holdoutError')}</dt>
                    <dd>{number(forecast.evaluationMetrics!.holdoutReturnRmse)}</dd>
                  </div>
                  <div>
                    <dt>{t('forecast.baselineError')}</dt>
                    <dd>{number(forecast.evaluationMetrics!.baselineHoldoutReturnRmse)}</dd>
                  </div>
                  <div>
                    <dt>{t('forecast.direction')}</dt>
                    <dd>{percent(forecast.evaluationMetrics!.holdoutDirectionalAccuracy * 100)}</dd>
                  </div>
                </dl>
                <p className="muted forecast-note">{t('forecast.metricsNote')}</p>
              </details>
            </>
          ) : (
            <div className="forecast-empty" role="status">
              <strong>{t(stale ? 'forecast.stale' : 'forecast.unavailable')}</strong>
              <p>{t(stale ? 'forecast.staleReason' : `forecast.${reason}`)}</p>
            </div>
          )}
        </div>
        <p className="muted forecast-note">{t('forecast.disclaimer')}</p>
      </div>
    </section>
  );
}
