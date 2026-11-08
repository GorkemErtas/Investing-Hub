import { useEffect, useState } from 'react';
import { assets, type Symbol } from '@investing-hub/shared/contracts';
import { usePrediction } from '../lib/api';
import { Coin, ErrorState, Skeleton } from '../components/ui';
import { money, utc } from '../lib/format';

const reasons: Record<string, string> = {
  no_prediction_publication: 'No local forecast has been published yet.',
  no_selected_model: 'No trained model has been selected for this coin yet.',
  no_current_prediction: 'A new daily prediction is not available yet.',
  dataset_stale_or_gapped: 'The source data needs an update before a forecast can be shown.',
  prediction_expired: 'The daily forecast has expired. Waiting for an updated prediction.',
  prediction_publication_expired: 'Waiting for an updated daily publication.',
  registry_changed_regenerate_predictions:
    'The local data or model changed. Waiting for an updated prediction.',
};
function PredictionCard({ symbol }: { symbol: Symbol }) {
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
    <article className="panel prediction-card" aria-label={`${asset.name} price prediction`}>
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
          message="The prediction could not be loaded."
          retry={() => void query.refetch()}
        />
      ) : available ? (
        <>
          <p className="prediction-price">
            {money(prediction.predictedValue!)} <small>USDT</small>
          </p>
          <p>
            Target UTC date{' '}
            <time dateTime={prediction.targetTimestamp!}>
              {prediction.targetTimestamp!.slice(0, 10)}
            </time>
          </p>
          <span className="pill">Experimental prediction</span>
          <p className="prediction-time muted">Generated {utc(prediction.predictionTimestamp)}</p>
        </>
      ) : (
        <>
          <p className="prediction-unavailable">Prediction unavailable</p>
          <p className="muted">
            {reasons[prediction?.reason ?? ''] ??
              'Valid local data and a model are required before a numeric forecast can be shown.'}
          </p>
        </>
      )}
    </article>
  );
}
export function PricePredictions() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL MACHINE LEARNING</div>
          <h1>
            Price Predictions<span className="heading-dot">.</span>
          </h1>
          <p>
            Next-day closing price estimates from the selected model for each coin. Prices in USDT.
          </p>
        </div>
      </div>
      <p className="prediction-note">
        Experimental predictions can be inaccurate. Historical model comparisons are available in
        Analytics Lab.
      </p>
      <div className="prediction-grid">
        {assets.map((asset) => (
          <PredictionCard key={asset.symbol} symbol={asset.symbol} />
        ))}
      </div>
    </>
  );
}
