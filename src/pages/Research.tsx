import { useState } from 'react';
import { ArrowRight, Check, FlaskConical, LockKeyhole } from 'lucide-react';
import { usePrediction } from '../lib/api';
import { ErrorState, Notice, Skeleton } from '../components/ui';
import { utc } from '../lib/format';

export function Research() {
  const [symbol, setSymbol] = useState<'BTCUSDT' | 'ETHUSDT'>('BTCUSDT');
  const query = usePrediction(symbol);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVIDENCE BEFORE PREDICTION</div>
          <h1>
            The research lab<span className="heading-dot">.</span>
          </h1>
          <p>Transparent methodology. Reproducible experiments. No invented certainty.</p>
        </div>
        <span className="pill research-pill">
          <FlaskConical size={15} />
          Experimental
        </span>
      </div>
      <div className="research-hero panel">
        <div>
          <span className="eyebrow">ONE-DAY HORIZON · BTC & ETH</span>
          <h2>
            A forecast has to earn
            <br />
            its place on your dashboard.
          </h2>
          <p>
            Complexity is easy to add. Predictive value is harder to prove. We compare simple models
            against a no-change forecast, using only information available at prediction time.
          </p>
        </div>
        <div className="research-orbit" aria-hidden="true">
          <div />
          <FlaskConical size={46} />
          <span>t → t + 1</span>
        </div>
      </div>
      <div className="research-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Prediction status</h2>
              <p>Next completed daily close · USDT</p>
            </div>
            <label>
              <span className="sr-only">Research asset</span>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value as typeof symbol)}>
                <option>BTCUSDT</option>
                <option>ETHUSDT</option>
              </select>
            </label>
          </div>
          {query.isPending ? (
            <Skeleton rows={3} />
          ) : query.data ? (
            <div className="prediction-disabled">
              <span className="lock-icon">
                <LockKeyhole size={24} />
              </span>
              <span className="pill">DISABLED · UNVALIDATED</span>
              <h3>No published forecast</h3>
              <p>{query.data.reason}</p>
              <dl>
                <div>
                  <dt>Prediction target</dt>
                  <dd>Next daily close, 1 day</dd>
                </div>
                <div>
                  <dt>Model version</dt>
                  <dd>None approved</dd>
                </div>
                <div>
                  <dt>Source candle</dt>
                  <dd>Not used for inference</dd>
                </div>
                <div>
                  <dt>Status checked</dt>
                  <dd>{utc(query.data.predictionTimestamp)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <ErrorState
              message="Prediction status service is unavailable. Forecasts remain disabled."
              retry={() => void query.refetch()}
            />
          )}
        </section>
        <section className="panel methodology">
          <div className="panel-heading">
            <div>
              <h2>Our evaluation standard</h2>
              <p>A reproducible path from data to evidence</p>
            </div>
          </div>
          {[
            [
              '01',
              'Validate the source',
              'UTC daily OHLCV, checksums and provenance. Gaps break feature windows; no fabricated candles.',
            ],
            [
              '02',
              'Respect the timeline',
              'Past-only features. Chronological train, validation and held-out test sets with a horizon gap.',
            ],
            [
              '03',
              'Challenge the baseline',
              'Ridge, Random Forest and Gradient Boosting compete against no-change and historical-mean returns.',
            ],
            [
              '04',
              'Report what happened',
              'MAE, RMSE, directional accuracy and expanding-window results. No cherry-picked backtests.',
            ],
          ].map(([n, title, description]) => (
            <div className="method-step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
      <Notice>
        Offline experiment results are written to versioned local reports. This page does not imply
        that a trained candidate is deployed. Legacy ONNX models are preserved only as unverified
        historical artifacts.
      </Notice>
      <section className="panel research-checks">
        <h2>The publication gate</h2>
        <div>
          {[
            'Beat the naive baseline on validation before opening the final test',
            'Pass expanding-window evaluation with consistent improvement',
            'Verify preprocessing, feature order and exported inference parity',
            'Review held-out results before any manual deployment decision',
          ].map((text) => (
            <p key={text}>
              <Check size={17} />
              {text}
            </p>
          ))}
        </div>
        <a
          className="text-button"
          href="https://github.com/binance/binance-public-data"
          target="_blank"
          rel="noreferrer"
        >
          Explore the historical data source <ArrowRight size={15} />
        </a>
      </section>
    </>
  );
}
