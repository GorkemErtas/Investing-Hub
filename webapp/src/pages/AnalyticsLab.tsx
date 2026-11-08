import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Database, FlaskConical, RefreshCw } from 'lucide-react';
import { assets, symbolSchema } from '@investing-hub/shared/contracts';
import { useAnalytics } from '../lib/api';
import { AnalyticsPlot } from '../components/AnalyticsPlot';
import { Coin, ErrorState, Notice, Skeleton } from '../components/ui';
import { utc } from '../lib/format';

const numeric = (v: number | null | undefined, digits = 4) =>
  v == null ? 'Unavailable' : v.toFixed(digits);
const pct = (v: number | null | undefined) =>
  v == null ? 'Unavailable' : `${(v * 100).toFixed(2)}%`;
const methods: Record<string, string> = {
  rolling_z: 'Rolling Z-score',
  rolling_iqr: 'Rolling IQR',
  rolling_mad: 'Robust median / MAD',
  isolation_forest: 'Isolation Forest',
};
const reasons: Record<string, string> = {
  local_analytics_disabled:
    'Analytics Lab is disabled. This research dashboard is available only on localhost in development with ANALYTICS_LAB_ENABLED=true.',
  no_analytics_export:
    'No local analytical report exists. Run the offline analytics command to create one.',
  analytics_registry_changed:
    'The research database changed. Run analytics again to refresh its validated snapshot.',
  analytics_export_expired:
    'This analytical export is older than seven days. Run the offline analysis again.',
  invalid_analytics_export: 'The analytical export failed validation. No metrics can be displayed.',
  no_verified_dataset: 'No verified historical dataset is available for this asset.',
  verification_or_analysis_failed: 'Data integrity or analytical validation failed for this asset.',
};
export function AnalyticsLab() {
  const [params, setParams] = useSearchParams();
  const symbol = symbolSchema.safeParse(params.get('symbol')).data ?? assets[0].symbol;
  const asset = assets.find((a) => a.symbol === symbol)!;
  const query = useAnalytics(symbol);
  const [task, setTask] = useState('direction'),
    [fold, setFold] = useState('3'),
    [method, setMethod] = useState('all');
  const response = query.data,
    report = response?.report,
    data = report?.asset,
    stats = data?.statistics;
  const classifiers =
    data?.classifiers.filter((r) => r.task === task && String(r.fold) === fold) ?? [];
  const baseline = classifiers.find((r) => r.model === 'majority_baseline');
  const alerts =
    data?.anomalies?.events
      .filter((e) => method === 'all' || e.method === method)
      .slice(-20)
      .reverse() ?? [];
  const best = classifiers
    .filter((r) => r.metrics && !r.model.includes('baseline') && !r.model.includes('naive'))
    .sort((a, b) => (b.metrics?.balancedAccuracy ?? 0) - (a.metrics?.balancedAccuracy ?? 0))[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TRANSPARENT, REPRODUCIBLE RESEARCH</div>
          <h1>
            Analytics Lab<span className="heading-dot">.</span>
          </h1>
          <p>Explore the evidence. Compare models. Understand the limits.</p>
        </div>
        <span className="pill">
          <FlaskConical size={14} /> Local research
        </span>
      </div>
      <div className="analytics-toolbar panel">
        <label className="analytics-asset">
          <Coin symbol={symbol} />
          <span className="sr-only">Analytics asset</span>
          <select
            aria-label="Analytics asset"
            value={symbol}
            onChange={(e) => setParams({ symbol: e.target.value })}
          >
            {assets.map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.name} ({a.base})
              </option>
            ))}
          </select>
        </label>
        <span className="muted">Completed UTC daily candles · USDT</span>
        <button
          className="button secondary"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={14} />
          Check report
        </button>
      </div>
      {query.isPending ? (
        <Skeleton rows={5} />
      ) : query.isError ? (
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      ) : !report ? (
        <section className="panel analytics-empty">
          <Database size={30} />
          <h2>Research report unavailable</h2>
          <p>{reasons[response?.reason ?? ''] ?? 'The local analytics report is unavailable.'}</p>
          <p>Price Predictions and normal market data remain available.</p>
        </section>
      ) : (
        <>
          <Notice>
            Historical model evaluation; selection does not prove forecast reliability. No trading
            signals, fraud probabilities or causal claims.{' '}
            {response?.status === 'stale'
              ? 'The dataset or report is stale; use its dated coverage.'
              : 'Results refer only to the recorded snapshot.'}
          </Notice>
          <section className="panel analytics-section" aria-labelledby="data-overview">
            <div className="analytics-section-title">
              <div>
                <div className="eyebrow">01 / VERIFIED INPUTS</div>
                <h2 id="data-overview">{asset.name} data overview</h2>
              </div>
              <span className="pill">{data?.dataset?.freshness ?? 'Unavailable'}</span>
            </div>
            {!data?.dataset ? (
              <div className="analytics-empty">
                <h3>No verified observations</h3>
                <p>{reasons[data?.reason ?? ''] ?? data?.reason}</p>
              </div>
            ) : (
              <>
                <div className="analytics-kpis">
                  {[
                    ['Daily observations', String(data.dataset.rows)],
                    ['Labeled feature rows', String(data.dataset.usableSamples)],
                    ['Missing days', String(data.dataset.missingDays)],
                    ['Mean daily return', pct(stats?.returns?.mean)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <p className="analytics-caption">
                  Coverage {utc(data.dataset.firstClose)} – {utc(data.dataset.lastClose)}. Generated{' '}
                  {utc(report.generatedAt)}. Outliers are retained; missing days are never filled.
                </p>
                <div className="analytics-grid">
                  <AnalyticsPlot
                    title="Daily return · weekly sampled (fraction)"
                    values={stats?.series.map((p) => p.dailyReturn) ?? []}
                    labels={stats?.series.map((p) => p.time.slice(0, 10))}
                  />
                  <AnalyticsPlot
                    title="Rolling 14-day daily volatility · weekly sampled"
                    values={stats?.series.map((p) => p.volatility14) ?? []}
                    labels={stats?.series.map((p) => p.time.slice(0, 10))}
                  />
                </div>
              </>
            )}
          </section>
          {stats && (
            <section className="panel analytics-section" aria-labelledby="statistics">
              <div className="eyebrow">02 / DISTRIBUTIONS & INFERENCE</div>
              <h2 id="statistics">Statistical analysis</h2>
              <div className="analytics-grid">
                <AnalyticsPlot
                  title="Daily return distribution · observation counts"
                  histogram
                  values={stats.histogram.map((b) => b.count)}
                  labels={stats.histogram.map(
                    (b) => `${(b.low * 100).toFixed(1)}% to ${(b.high * 100).toFixed(1)}%`,
                  )}
                />
                <dl className="analytics-facts">
                  {[
                    ['Median return', pct(stats.returns?.median)],
                    ['Daily standard deviation', pct(stats.returns?.std)],
                    ['Variance (fraction²)', numeric(stats.returns?.variance, 6)],
                    [
                      '5th / 95th percentiles',
                      `${pct(stats.returns?.q05)} / ${pct(stats.returns?.q95)}`,
                    ],
                    [
                      'Skewness / excess kurtosis',
                      `${numeric(stats.returns?.skewness, 2)} / ${numeric(stats.returns?.excessKurtosis, 2)}`,
                    ],
                    [
                      'Return / absolute-return autocorrelation',
                      `${numeric(stats.returnAutocorrelation1, 2)} / ${numeric(stats.absoluteReturnAutocorrelation1, 2)}`,
                    ],
                    ['Return / volume-change Spearman', numeric(stats.priceVolumeSpearman, 2)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <h3>Prespecified period comparison</h3>
              <p className="analytics-caption">
                Two adjacent {report.config.period_days}-day windows, anchored to the latest source
                date. Circular {report.config.block_days}-day blocks,{' '}
                {report.config.bootstrap_resamples} resamples. Approximate centered-bootstrap
                p-values; Holm correction across {report.hypothesisFamilySize} available primary
                tests. Confidence intervals are pointwise.
              </p>
              <div className="analytics-table-wrap">
                <table>
                  <caption>Historical hypotheses: period B minus period A</caption>
                  <thead>
                    <tr>
                      <th>Hypothesis</th>
                      <th>Effect (pp)</th>
                      <th>95% interval (pp)</th>
                      <th>p / Holm p</th>
                      <th>Samples A / B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tests.map((test) => (
                      <tr key={test.name}>
                        <th>
                          {test.name === 'mean_return_difference'
                            ? 'Mean daily return'
                            : 'Mean absolute return (volatility proxy)'}
                        </th>
                        {test.status === 'available' ? (
                          <>
                            <td>{numeric(test.effect * 100)}</td>
                            <td>
                              {numeric(test.ciLow * 100)} to {numeric(test.ciHigh * 100)}
                            </td>
                            <td>
                              {numeric(test.pValue, 3)} / {numeric(test.adjustedP, 3)}
                            </td>
                            <td>
                              {test.samplesA} / {test.samplesB}
                            </td>
                          </>
                        ) : (
                          <td colSpan={4}>{test.reason}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="analytics-details">
                <summary>Period boundaries, block sensitivity & assumptions</summary>
                {stats.tests.map(
                  (t) =>
                    t.status === 'available' && (
                      <p key={t.name}>
                        {t.name}: A {t.periodAStart.slice(0, 10)}–{t.periodAEnd.slice(0, 10)}; B{' '}
                        {t.periodBStart.slice(0, 10)}–{t.periodBEnd.slice(0, 10)}.{' '}
                        {t.sensitivity
                          .map(
                            (s) =>
                              `${s.blockDays}-day blocks: [${numeric(s.ciLow * 100)}, ${numeric(s.ciHigh * 100)}] pp`,
                          )
                          .join('; ')}
                        .
                      </p>
                    ),
                )}
                <p>
                  Inference assumes approximate stationarity and short-range dependence within each
                  window. Autocorrelation is shown as a diagnostic, not proof of independence. Long
                  memory and regime changes can invalidate intervals. Sensitivity is reported
                  without choosing the smallest p-value.
                </p>
              </details>
              <h3>Rolling cross-asset correlation</h3>
              {data?.correlations.length ? (
                <div className="analytics-grid">
                  {data.correlations.map((c) => (
                    <div key={c.otherSymbol}>
                      <AnalyticsPlot
                        title={`${asset.base} / ${c.otherSymbol.replace('USDT', '')} · 30-day correlation`}
                        values={c.points.map((p) => p.value)}
                        labels={c.points.map((p) => p.time.slice(0, 10))}
                      />
                      <p className="analytics-caption">
                        Latest: {numeric(c.value, 3)} · {c.samples}/30 aligned days. Association is
                        not causation.
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No second verified asset has enough aligned observations.</p>
              )}
            </section>
          )}
          {data?.dataset && (
            <section className="panel analytics-section" aria-labelledby="classification">
              <div className="eyebrow">03 / SUPERVISED EXPERIMENTS</div>
              <h2 id="classification">Classification & rare events</h2>
              <div className="analytics-filters">
                <label>
                  Research target
                  <select value={task} onChange={(e) => setTask(e.target.value)}>
                    <option value="direction">Next-day direction</option>
                    <option value="extreme_event">Rare extreme movement</option>
                  </select>
                </label>
                <label>
                  Evaluation fold
                  <select value={fold} onChange={(e) => setFold(e.target.value)}>
                    {Array.from({ length: report.config.walk_forward_splits }, (_, i) => (
                      <option key={i} value={String(i + 1)}>
                        Fold {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="analytics-caption">
                {task === 'direction'
                  ? 'Positive next-day return vs non-positive return. Regression sign accuracy is not a trained classifier.'
                  : `The extreme-move magnitude is defined by the training-only ${(report.config.event_quantile * 100).toFixed(0)}th absolute-return percentile. Weighted and unweighted fits share the same periods. Thresholds use a later validation block, never the evaluation outcomes. Accuracy can hide missed rare events.`}
              </p>
              {!classifiers.length ? (
                <p className="analytics-empty">
                  Insufficient contiguous history for chronological classification.
                </p>
              ) : (
                <>
                  <p className="analytics-result">
                    {best?.metrics?.balancedAccuracy != null &&
                    baseline?.metrics?.balancedAccuracy != null
                      ? `Best displayed candidate balanced accuracy: ${pct(best.metrics.balancedAccuracy)}; majority baseline: ${pct(baseline.metrics.balancedAccuracy)}. This historical comparison does not establish useful future performance.`
                      : 'Class variation is insufficient for a meaningful ranking comparison. Check each period?s positive counts.'}
                  </p>
                  <div className="analytics-table-wrap">
                    <table>
                      <caption>
                        {task === 'direction'
                          ? 'Direction classification'
                          : 'Extreme-event classification'}{' '}
                        · fold {fold}
                      </caption>
                      <thead>
                        <tr>
                          <th>Model</th>
                          <th>N / positives</th>
                          <th>Accuracy / balanced</th>
                          <th>Precision / recall</th>
                          <th>F1</th>
                          <th>ROC-AUC / AP</th>
                          <th>Brier</th>
                          <th>FPR</th>
                          <th>Threshold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classifiers.map((r) => (
                          <tr key={r.version}>
                            <th>{r.model.replaceAll('_', ' ')}</th>
                            {r.metrics ? (
                              <>
                                <td>
                                  {r.metrics.samples} / {r.metrics.positives}
                                </td>
                                <td>
                                  {pct(r.metrics.accuracy)} / {pct(r.metrics.balancedAccuracy)}
                                </td>
                                <td>
                                  {pct(r.metrics.precision)} / {pct(r.metrics.recall)}
                                </td>
                                <td>{numeric(r.metrics.f1, 3)}</td>
                                <td>
                                  {numeric(r.metrics.rocAuc, 3)} /{' '}
                                  {numeric(r.metrics.averagePrecision, 3)}
                                </td>
                                <td>{numeric(r.metrics.brier, 3)}</td>
                                <td>{pct(r.metrics.falsePositiveRate)}</td>
                                <td>{numeric(r.threshold, 2)}</td>
                              </>
                            ) : (
                              <td colSpan={8}>Single-class training: model unavailable</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="analytics-grid">
                    {classifiers
                      .filter((r) => r.metrics)
                      .slice(0, 2)
                      .map((r) => (
                        <div className="analytics-confusion" key={r.version}>
                          <h3>{r.model.replaceAll('_', ' ')} · confusion matrix</h3>
                          <p className="analytics-caption">
                            Rows actual: non-event / event. Columns predicted: non-event / event.
                          </p>
                          <div>
                            {r.metrics!.confusion.map((n, i) => (
                              <span key={i}>
                                <small>
                                  {
                                    [
                                      'True negative',
                                      'False positive',
                                      'False negative',
                                      'True positive',
                                    ][i]
                                  }
                                </small>
                                <strong>{n}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                  <details className="analytics-details">
                    <summary>Fold consistency, training boundaries & versions</summary>
                    <ul>
                      {data.classifiers
                        .filter((r) => r.task === task)
                        .map((r) => (
                          <li key={r.version}>
                            {r.model} · fold {r.fold}: F1 {numeric(r.metrics?.f1, 3)}; train labels
                            through {utc(r.trainEnd)}, validation {utc(r.validationStart)}–
                            {utc(r.validationEnd)}, evaluation {utc(r.evaluationStart)}–
                            {utc(r.evaluationEnd)}. Threshold policy {r.thresholdPolicy}; training
                            prevalence {pct(r.trainingPrevalence)}; event magnitude{' '}
                            {pct(r.eventThreshold)}. Version <code>{r.version}</code>.
                          </li>
                        ))}
                    </ul>
                    <p>
                      Preprocessing is fitted on training only. AP means average precision, not
                      trapezoidal PR-AUC. Model scores are uncalibrated; Brier is probability error.
                      No resampling is applied across time; class weighting avoids synthesizing
                      chronological observations. All folds remain inspected historical development
                      evidence.
                    </p>
                  </details>
                </>
              )}
            </section>
          )}
          {data?.anomalies && (
            <section className="panel analytics-section" aria-labelledby="anomaly">
              <div className="eyebrow">04 / OBSERVED BEHAVIOR</div>
              <h2 id="anomaly">Anomaly detection</h2>
              <p className="analytics-caption">
                Observed at close t, not a forecast about t+1. Scores use different method scales.
                No verified labels exist, so precision, recall and F1 are unavailable.
              </p>
              <div className="analytics-kpis">
                {data.anomalies.totals.map((m) => (
                  <div key={m.method}>
                    <span>{methods[m.method]}</span>
                    <strong>{m.flagged}</strong>
                    <small>
                      {m.eligible} scored days ·{' '}
                      {m.eligible ? pct(m.flagged / m.eligible) : 'No eligible history'} flagged
                    </small>
                  </div>
                ))}
              </div>
              <label className="analytics-filters">
                Alert method
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="all">All methods</option>
                  {Object.entries(methods).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="analytics-table-wrap">
                <table>
                  <caption>
                    Latest {alerts.length} matching alerts · snapshot retains at most 200 events
                  </caption>
                  <thead>
                    <tr>
                      <th>Observed UTC</th>
                      <th>Method / indicator</th>
                      <th>Score / threshold</th>
                      <th>Reference ends</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.length ? (
                      alerts.map((e) => (
                        <tr key={e.time + e.method}>
                          <td>{e.time.slice(0, 10)}</td>
                          <td>
                            {methods[e.method]} / {e.indicator}
                          </td>
                          <td>
                            {numeric(e.score, 3)} / {numeric(e.threshold, 3)}
                          </td>
                          <td>{e.referenceEnd.slice(0, 10)}</td>
                          <td>{e.severity}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5}>No qualifying observed alerts in this view.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <details className="analytics-details">
                <summary>Thresholds and severity policy</summary>
                <p>
                  Z-score uses earlier 60 observations (threshold 3); IQR uses earlier 90 (1.5 IQR
                  beyond the quartiles); robust MAD uses earlier 90 (6 scaled MAD). Statistical high
                  priority means twice the trigger threshold. Isolation Forest is refitted monthly
                  on up to 365 earlier observations with training contamination 0.02; positive
                  anomaly score triggers, above 0.1 is high priority. These priorities are
                  monitoring policies, not calibrated risk or fraud probabilities. Constant-scale
                  windows are not scored.
                </p>
              </details>
            </section>
          )}
          {data?.dataset && (
            <section className="panel analytics-section" aria-labelledby="regression">
              <div className="eyebrow">05 / EXISTING REGISTRY & MONITORING</div>
              <h2 id="regression">Regression performance</h2>
              <p className="analytics-caption">
                Candidates from the latest comparable training run are shown together. Model
                selection uses historical error; final-period and prospective results are separate.
                Weak performance does not block a forecast.
              </p>
              {!data.regressions.length ? (
                <p>No registered regression evidence is available.</p>
              ) : (
                <div className="analytics-table-wrap">
                  <table>
                    <caption>
                      Historical selection · {data.regressions.length} registered versions
                    </caption>
                    <thead>
                      <tr>
                        <th>Model / version</th>
                        <th>Return MAE / RMSE</th>
                        <th>Baseline RMSE</th>
                        <th>Price MAE / RMSE (USDT)</th>
                        <th>Selection direction accuracy</th>
                        <th>Final-period price RMSE / baseline (USDT)</th>
                        <th>Final direction accuracy</th>
                        <th>Registry status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.regressions.map((r) => (
                        <tr key={r.modelId}>
                          <th>
                            {r.model}
                            <small className="analytics-id">{r.modelId}</small>
                          </th>
                          <td>
                            {numeric(r.returnMae, 6)} / {numeric(r.returnRmse, 6)}
                          </td>
                          <td>{numeric(r.baselineRmse, 6)}</td>
                          <td>
                            {numeric(r.priceMaeUsdt, 2)} / {numeric(r.priceRmseUsdt, 2)}
                          </td>
                          <td>{pct(r.directionalAccuracy)}</td>
                          <td>
                            {r.finalEvaluation
                              ? `${numeric(r.finalEvaluation.priceRmseUsdt, 2)} / ${numeric(r.finalEvaluation.baselinePriceRmseUsdt, 2)}`
                              : 'Not measured separately'}
                          </td>
                          <td>{pct(r.finalEvaluation?.directionalAccuracy)}</td>
                          <td>
                            {r.selected
                              ? 'Selected for forecast'
                              : 'Candidate / historical version'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h3>Prospective residuals, regimes & interval monitoring</h3>
              {!data.monitoring.length ? (
                <p className="analytics-result">
                  No genuine evaluated prospective observations are available. Residual error,
                  deterioration and interval coverage cannot be measured yet.
                </p>
              ) : (
                data.monitoring.map((m) => (
                  <div key={m.modelId + m.phase} className="analytics-result">
                    <strong>
                      {m.modelId} · {m.phase.replaceAll('_', ' ')}
                    </strong>
                    <p>
                      {m.samples} observations · return RMSE {numeric(m.returnRmse, 6)} vs baseline{' '}
                      {numeric(m.baselineRmse, 6)}. Residual median {numeric(m.residuals.median, 6)}
                      ; 5th–95th {numeric(m.residuals.q05, 6)} to {numeric(m.residuals.q95, 6)}.
                    </p>
                    <p>
                      Interval observations {m.intervalSamples}; nominal {pct(m.nominalCoverage)},
                      measured {pct(m.intervalCoverage)}, mean relative width{' '}
                      {pct(m.meanRelativeIntervalWidth)}. Empirical coverage is not a guaranteed
                      future probability.
                    </p>
                    <p>
                      {m.regimes
                        .map(
                          (r) =>
                            `${r.regime}: ${r.samples} observations, RMSE ${numeric(r.returnRmse, 6)}`,
                        )
                        .join('; ')}
                    </p>
                  </div>
                ))
              )}
              <details className="analytics-details">
                <summary>Historical interval evidence, fold results & deterioration</summary>
                {data.regressions.map((r) => (
                  <p key={r.modelId}>
                    {r.modelId}: final artifact fit {r.trainStart.slice(0, 10)}–
                    {r.trainEnd.slice(0, 10)}, registered {utc(r.trainedAt)}; feature version{' '}
                    {r.featureVersion}. Historical selection {r.evaluationStart.slice(0, 10)}–
                    {r.evaluationEnd.slice(0, 10)}, {r.samples} samples. Fold RMSE{' '}
                    {r.foldRmses.map((v) => numeric(v, 6)).join(', ')}. Interval{' '}
                    {r.interval
                      ? `nominal ${pct(r.interval.nominalCoverage)}, measured ${pct(r.interval.empiricalCoverage)}, relative width at reference ${pct(2 * r.interval.radiusReturn)}, ${r.interval.calibrationSamples} OOS residuals / ${r.interval.validationSamples} selection observations; ${r.interval.status}`
                      : 'unavailable for this version'}
                    . Dataset <code>{r.datasetFingerprint}</code>.
                    {r.finalEvaluation && (
                      <>
                        {' '}
                        Final-period evaluation: {r.finalEvaluation.evaluationStart.slice(
                          0,
                          10,
                        )} to {r.finalEvaluation.evaluationEnd.slice(0, 10)},{' '}
                        {r.finalEvaluation.samples} observations, price MAE{' '}
                        {numeric(r.finalEvaluation.priceMaeUsdt, 2)} USDT. This period was excluded
                        from model ranking.
                      </>
                    )}
                  </p>
                ))}
                <p>
                  Walk-forward scores come from earlier per-fold fits. They are not evaluations of
                  the final artifact on its own training data.
                </p>
                {data.deterioration.map((r) => (
                  <p key={r.model_id + r.phase}>
                    {r.model_id} ({r.phase}): recent/prior counts {r.recent_samples}/
                    {r.previous_samples}; return RMSE{' '}
                    {numeric(r.recent_mse === null ? null : Math.sqrt(r.recent_mse), 6)} /{' '}
                    {numeric(r.previous_mse === null ? null : Math.sqrt(r.previous_mse), 6)}.{' '}
                    {r.previous_samples < 10 || r.recent_samples < 10
                      ? 'Insufficient samples to assess deterioration.'
                      : 'Descriptive change only; not a significance test.'}
                  </p>
                ))}
              </details>
            </section>
          )}
          <section className="panel analytics-section" aria-labelledby="findings">
            <div className="eyebrow">06 / RESEARCH, NOT CERTAINTY</div>
            <h2 id="findings">Research findings & reproducibility</h2>
            <ul>
              {data?.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <details className="analytics-details">
              <summary>Provenance, limitations & offline exports</summary>
              <p>
                Run <code>{report.runId}</code>; feature contract {report.provenance.featureVersion}
                ; seed {report.provenance.seed}. Environment{' '}
                {Object.entries(report.provenance.environment)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')}
                .
              </p>
              <p>
                Code <code>{report.provenance.codeHash}</code>; configuration{' '}
                <code>{report.provenance.configHash}</code>.
              </p>
              <ul>
                {report.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p>
                Generate local CSVs with <code>python ml/pipeline.py analytics</code>. The immutable
                run folder contains descriptive, model comparison, evaluated prediction and anomaly
                tables, plus column/unit definitions for Excel and Power BI. See
                docs/DATA_ANALYTICS.md for exercises and SQL examples. Raw candles and model
                artifacts are never served by this dashboard.
              </p>
            </details>
          </section>
        </>
      )}
      <div className="analytics-footnote">
        <BarChart3 size={15} /> Deterministic local Python evaluation · no external AI service · no
        prediction approval changes
      </div>
    </>
  );
}
