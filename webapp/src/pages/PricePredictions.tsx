import { i18n } from '../lib/i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { assets, type Symbol } from '@investing-hub/shared/contracts';
import { usePrediction } from '../lib/api';
import { Coin, ErrorState, Skeleton } from '../components/ui';
import { money, utc, date } from '../lib/format';

const reasons: Record<string, string> = {
  no_prediction_publication: 'pricePredictions.noLocalForecastHasBeenPublishedYet',
  no_selected_model: 'pricePredictions.noTrainedModelHasBeenSelectedFor',
  no_current_prediction: 'pricePredictions.aNewDailyPredictionIsNotAvailable',
  dataset_stale_or_gapped: 'pricePredictions.theSourceDataNeedsAnUpdateBefore',
  prediction_expired: 'pricePredictions.theDailyForecastHasExpiredWaitingFor',
  prediction_publication_expired: 'pricePredictions.waitingForAnUpdatedDailyPublication',
  registry_changed_regenerate_predictions: 'pricePredictions.theLocalDataOrModelChangedWaiting',
};
function PredictionCard({ symbol }: { symbol: Symbol }) {
  useTranslation();
  const asset = assets.find((item) => item.symbol === symbol)!;
  const query = usePrediction(symbol);
  const prediction = query.data;
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const available =
    prediction?.status === 'experimental' &&
    prediction.predictedValue !== null &&
    !!prediction.targetTimestamp &&
    Date.parse(prediction.targetTimestamp) > clock;
  return (
    <article
      className="panel prediction-card"
      aria-label={i18n.t('common:prediction.card', { coin: asset.name })}
    >
      <header>
        <Coin symbol={symbol} />
        <div>
          <h2>{asset.name}</h2>
          <span className="muted">{symbol}</span>
        </div>
      </header>
      {query.isPending ? (
        <Skeleton rows={2} />
      ) : query.isError ? (
        <ErrorState
          message={i18n.t('pricePredictions.thePredictionCouldNotBeLoaded')}
          retry={() => void query.refetch()}
        />
      ) : available ? (
        <>
          <p className="prediction-price">
            {money(prediction.predictedValue!)} <small>USDT</small>
          </p>
          <p>
            {i18n.t('pricePredictions.targetUtcDate')}{' '}
            <time dateTime={prediction.targetTimestamp!}>{date(prediction.targetTimestamp!)}</time>
          </p>
          <span className="pill">{i18n.t('common:prediction.experimental')}</span>
          <p className="prediction-time muted">
            {i18n.t('pricePredictions.generated')} {utc(prediction.predictionTimestamp)}
          </p>
        </>
      ) : (
        <>
          <p className="prediction-unavailable">{i18n.t('common:prediction.unavailable')}</p>
          <p className="muted">
            {i18n.t(
              reasons[prediction?.reason ?? ''] ?? 'pricePredictions.validLocalDataAndAModelAre',
            )}
          </p>
        </>
      )}
    </article>
  );
}
export function PricePredictions() {
  useTranslation();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{i18n.t('pricePredictions.localMachineLearning')}</div>
          <h1>
            {i18n.t('common:nav.predictions')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{i18n.t('pricePredictions.nextDayClosingPriceEstimatesFromThe')}</p>
        </div>
      </div>
      <p className="prediction-note">{i18n.t('common:prediction.note')}</p>
      <div className="prediction-grid">
        {assets.map((asset) => (
          <PredictionCard key={asset.symbol} symbol={asset.symbol} />
        ))}
      </div>
    </>
  );
}
