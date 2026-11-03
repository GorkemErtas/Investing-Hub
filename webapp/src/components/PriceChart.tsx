import { useEffect, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type UTCTimestamp,
} from 'lightweight-charts';
import { CandlestickChart, ChartNoAxesCombined } from 'lucide-react';
import { assets, type Candle, type Interval, type Symbol } from '@investing-hub/shared/contracts';
import { useCandles } from '../lib/api';
import { fibonacciLevels, movingAverage } from '@investing-hub/shared/analysis';
import { money, utc } from '../lib/format';
import { Coin, ErrorState, Notice, Skeleton, Status } from './ui';

function Canvas({
  data,
  mode,
  theme,
  analysis,
}: {
  data: Candle[];
  mode: 'candles' | 'area';
  theme: string;
  analysis: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dark = theme === 'dark';
    const chart = createChart(ref.current, {
      autoSize: true,
      height: 310,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: dark ? '#8a9aa9' : '#607286',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: dark ? '#ffffff08' : '#162b4010' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.23 } },
      timeScale: { borderVisible: false, timeVisible: true },
      localization: { locale: 'en-US', priceFormatter: (price: number) => money(price) },
    });
    const time = (c: Candle) => Math.floor(c.openTime / 1000) as UTCTimestamp;
    const series =
      mode === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: '#31c9a1',
            downColor: '#ed7288',
            borderVisible: false,
            wickUpColor: '#31c9a1',
            wickDownColor: '#ed7288',
          })
        : chart.addSeries(AreaSeries, {
            lineColor: '#31c9a1',
            topColor: '#31c9a130',
            bottomColor: '#31c9a100',
            lineWidth: 2,
          });
    if (mode === 'candles')
      series.setData(
        data.map((c) => ({
          time: time(c),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
    else series.setData(data.map((c) => ({ time: time(c), value: c.close })));
    if (analysis) {
      const average = chart.addSeries(LineSeries, {
        color: '#dbaf6d',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      average.setData(
        movingAverage(data).map((p) => ({
          time: Math.floor(p.openTime / 1000) as UTCTimestamp,
          value: p.value,
        })),
      );
      fibonacciLevels(data).forEach((level) =>
        series.createPriceLine({
          price: level.price,
          color: '#8293a677',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: `${(level.ratio * 100).toFixed(1)}%`,
        }),
      );
    }
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    volume.setData(
      data.map((c) => ({
        time: time(c),
        value: c.volume,
        color: c.close >= c.open ? '#31c9a130' : '#ed728830',
      })),
    );
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      setHover(p.time ? (data.find((c) => time(c) === p.time) ?? null) : null);
    });
    return () => chart.remove();
  }, [data, mode, theme, analysis]);
  const candle = hover ?? data.at(-1);
  return (
    <>
      <div className="ohlc" aria-live="off">
        {candle && (
          <>
            <span>{utc(candle.openTime)}</span>
            <span>
              O <b>{money(candle.open)}</b>
            </span>
            <span>
              H <b>{money(candle.high)}</b>
            </span>
            <span>
              L <b>{money(candle.low)}</b>
            </span>
            <span>
              C <b>{money(candle.close)}</b>
            </span>
            <span>{candle.completed ? 'Closed' : 'In progress'}</span>
          </>
        )}
      </div>
      <div
        ref={ref}
        className="price-canvas"
        role="img"
        aria-label="Interactive price and volume chart. Drag to pan and scroll to zoom. Exact recent prices are available below."
      />
    </>
  );
}
export function PriceChart({
  symbol,
  onSymbol,
  theme,
}: {
  symbol: Symbol;
  onSymbol: (symbol: Symbol) => void;
  theme: string;
}) {
  const [interval, setInterval] = useState<Interval>('1d');
  const [mode, setMode] = useState<'candles' | 'area'>('candles');
  const [showData, setShowData] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const query = useCandles(symbol, interval);
  const asset = assets.find((a) => a.symbol === symbol)!;
  const close = query.data?.data.at(-1)?.close;
  return (
    <section className="panel chart-panel" aria-label="Asset chart">
      <div className="panel-heading">
        <div className="asset-heading">
          <Coin symbol={symbol} />
          <div>
            <div className="eyebrow">MARKET EXPLORER</div>
            <label className="asset-select">
              <span className="sr-only">Chart asset</span>
              <select value={symbol} onChange={(e) => onSymbol(e.target.value as Symbol)}>
                {assets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.name} / USDT
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="chart-price">
          {money(close)} <small>USDT</small>
          <span>{asset.base} spot market</span>
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="segmented" aria-label="Candle interval">
          {(['15m', '1h', '4h', '1d', '1w', '1M'] as Interval[]).map((i) => (
            <button
              key={i}
              aria-pressed={interval === i}
              className={interval === i ? 'selected' : ''}
              onClick={() => setInterval(i)}
            >
              {i === '1M' ? '1mo' : i}
            </button>
          ))}
        </div>
        <div className="segmented">
          <button
            aria-label="Candlestick chart"
            aria-pressed={mode === 'candles'}
            className={mode === 'candles' ? 'selected' : ''}
            onClick={() => setMode('candles')}
          >
            <CandlestickChart size={17} />
          </button>
          <button
            aria-label="Area chart"
            aria-pressed={mode === 'area'}
            className={mode === 'area' ? 'selected' : ''}
            onClick={() => setMode('area')}
          >
            <ChartNoAxesCombined size={17} />
          </button>
        </div>
      </div>
      <div className="analysis-toolbar">
        <button
          className="text-button"
          aria-pressed={analysis}
          onClick={() => setAnalysis(!analysis)}
        >
          {analysis ? 'Hide' : 'Show'} SMA 20 & Fibonacci levels
        </button>
        <span>Closed candles · descriptive indicators</span>
      </div>
      {query.isPending ? (
        <Skeleton rows={5} />
      ) : query.data ? (
        <>
          <Canvas
            key={`${symbol}-${interval}`}
            data={query.data.data}
            mode={mode}
            theme={theme}
            analysis={analysis}
          />
          {query.data.meta.stale || query.isError ? (
            <Notice>Showing last available candles. Prices may be out of date.</Notice>
          ) : null}
        </>
      ) : (
        <ErrorState
          message="We couldn't retrieve candles from the public provider. No sample prices are substituted."
          retry={() => void query.refetch()}
        />
      )}
      <div className="chart-footer">
        <Status meta={query.data?.meta} failed={query.isError} />
        <button
          className="text-button"
          onClick={() => setShowData(!showData)}
          aria-expanded={showData}
        >
          {showData ? 'Hide' : 'View'} price data
        </button>
      </div>
      {showData && query.data && (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Last ten candles, UTC; prices in USDT</caption>
            <thead>
              <tr>
                <th>UTC open</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Close</th>
                <th>Base volume</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.slice(-10).map((c) => (
                <tr key={c.openTime}>
                  <td>{utc(c.openTime)}</td>
                  <td>{money(c.open)}</td>
                  <td>{money(c.high)}</td>
                  <td>{money(c.low)}</td>
                  <td>{money(c.close)}</td>
                  <td>{money(c.volume)}</td>
                  <td>{c.completed ? 'Closed' : 'In progress'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
