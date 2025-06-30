// TradePage.jsx
import React, { useState, useEffect } from "react";
import { useLayoutEffect } from "react";
import { useRef } from "react";
import { Line } from "react-chartjs-2";
import zoomPlugin from "chartjs-plugin-zoom";
import candleChartImg from "../assets/images/candlestick-chart-definition.png";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  TimeScale,
} from "chart.js";
import { CandlestickController, CandlestickElement } from "chartjs-chart-financial";
import 'chartjs-adapter-date-fns';
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const intervalMap = (mins) => {
  if (mins % 10080 === 0) return `${mins / 10080}w`;
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60   === 0) return `${mins /   60}h`;
  return `${mins}m`;
};

ChartJS.register( zoomPlugin, TimeScale, LinearScale, CandlestickController, CandlestickElement, LineElement, CategoryScale, PointElement, Tooltip, Legend);

const TradePage = ({ crypto, onBack }) => {
  const [quantity, setQuantity] = useState(0);
  const [price, setPrice] = useState(crypto?.price || 0);
  const [action, setAction] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 16));
  const [message, setMessage] = useState("");
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState("");
  const [timeframe, setTimeframe] = useState("1M");
  const [chartData, setChartData] = useState(null);
  const [yAxisRange, setYAxisRange] = useState(null);
  const [predInterval, setPredInterval] = useState(15);
  const models = ["tree","svr","rf","lr","cnn_reg","lstm"];
  const [preds, setPreds] = useState({});
  const [showHint, setShowHint] = useState(false);
  const [chartType, setChartType] = useState("line");
  const candlestickRef = useRef(null);
  const [showChartHint, setShowChartHint] = useState(false);
  const lineChartRef = useRef(null);

  useEffect(() => {
  if (!crypto?.symbol) return;

  const fetchCryptoInfo = async () => {
    try {
      const response = await fetch("/crypto-data");
      const result = await response.json();
      const matched = result.data.find((c) => c.symbol === crypto.symbol);
      if (matched) {
        // crypto nesnesi değişmediği için üstte tanımlı price ve change gibi değerleri güncellemek gerek
        setPrice(matched.price);
        crypto.price = matched.price;
        crypto.change = matched.dailyChange;
        crypto.hourlyHigh = matched.hourlyHigh;
        crypto.hourlyLow = matched.hourlyLow;
        crypto.dailyHigh = matched.dailyHigh;
        crypto.dailyLow = matched.dailyLow;
        crypto.weeklyHigh = matched.weeklyHigh;
        crypto.weeklyLow = matched.weeklyLow;
        crypto.monthlyHigh = matched.monthlyHigh;
        crypto.monthlyLow = matched.monthlyLow;
        crypto.volume = matched.volume;
      }
    } catch (error) {
      console.error("Error updating coin stats:", error);
    }
  };

  fetchCryptoInfo();
  const intervalId = setInterval(fetchCryptoInfo, 15000); // every 15 sec

  return () => clearInterval(intervalId);
}, [crypto?.symbol]);


  useEffect(() => {
    if (!crypto?.symbol) return;
    setPreds({});  // clear old predictions

    const intervalStr = intervalMap(predInterval);

    models.forEach((m) => {
      fetch(
        `/predict/${m}/${crypto.symbol}/${intervalStr}`
      )
        .then((r) => r.json())
        .then((data) =>
          setPreds((cur) => ({
            ...cur,
            [m]:
              typeof data.prediction === "number"
                ? data.prediction.toFixed(2)
                : Array.isArray(data.prediction)
                ? data.prediction.map((v) => v.toString()).join(",")
                : "—",
          }))
        )
        .catch(() =>
          setPreds((cur) => ({ ...cur, [m]: "—" }))
        );
    });
  }, [crypto.symbol, predInterval]);

  useEffect(() => {
    const fetchPortfolios = async () => {
      try {
        const userId = JSON.parse(localStorage.getItem("user")).id;
        const response = await fetch(`/portfolios?userId=${userId}`);
        const data = await response.json();
        setPortfolios(data);
      } catch (error) {
        console.error("Error fetching portfolios:", error);
      }
    };

    fetchPortfolios();
  }, []);

  useEffect(() => {
  const fetchGraphData = async () => {
    try {
      let response;

      // Veri başlangıç zamanı hesapla
      const now = Date.now();
      let from;
      if (timeframe === "1m") {
          from = now - 2 * 60 * 60 * 1000;
        } else if (timeframe === "15m") {
          from = now - 15 * 60 * 60 * 1000;
        } else if (timeframe === "1h") {
          from = now - 3 * 24 * 60 * 60 * 1000;
        } else if (timeframe === "1d") {
          from = now - 30 * 24 * 60 * 60 * 1000;
        } else if (timeframe === "1w") {
          from = now - 40 * 7 * 24 * 60 * 60 * 1000;
        } else {
          from = 0;
        }

      const fromParam = `&from=${Math.floor(from / 1000)}`;

      if (chartType === "candlestick") {
        response = await fetch(
          `/graph-candles/${crypto.symbol}?timeframe=${timeframe}${from ? fromParam : ""}`
        );
        const data = await response.json();
        const min = Math.min(...data.map((p) => p.low)) * 0.95;
        const max = Math.max(...data.map((p) => p.high)) * 1.05;
        setYAxisRange({ min, max });
        setChartData({
          datasets: [
            {
              label: `${crypto.symbol} Price`,
              data,
            },
          ],
          labels: data.map((d) => d.time),
        });
      } else {
        response = await fetch(
          `/graph-data/${crypto.symbol}?timeframe=${timeframe}${from ? fromParam : ""}`
        );
        const data = await response.json();
        const filtered = data.filter(d => new Date(d.time).getTime() >= from);
        const prices = filtered.map((point) => point.price);
        const times = filtered.map((point) => point.time);
        const min = Math.min(...prices) * 0.95;
        const max = Math.max(...prices) * 1.05;
        setYAxisRange({ min, max });
        setChartData({
          labels: times,
          datasets: [
            {
              label: `${crypto.symbol} Price`,
              data: prices,
              borderColor: "rgba(75,192,192,1)",
              backgroundColor: "rgba(75,192,192,0.2)",
              tension: 0.3,
            },
          ],
        });
      }
    } catch (error) {
      console.error("Error fetching chart data:", error);
    }
  };
  fetchGraphData();
}, [crypto.symbol, timeframe, chartType]);

useLayoutEffect(() => {
  if (chartType !== "candlestick" || !chartData || !chartData.datasets[0]?.data?.length) return;

  const drawChart = () => {
    const ctx = document.getElementById("candlestick-chart");
    if (!ctx) return;

    if (candlestickRef.current) {
      candlestickRef.current.destroy();
    }

    candlestickRef.current = new ChartJS(ctx, {
      type: "candlestick",
      data: {
        datasets: [
          {
            label: `${crypto.symbol} Candlestick`,
            data: chartData.datasets[0].data,
            borderColor: "#26a69a",
            color: {
              up: "#26a69a",
              down: "#ef5350",
              unchanged: "#888"
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: {
          xAxisKey: "x",
          yAxisKey: "c" // sadece tooltip için, candlestick kendi o/h/l/c'yi kullanır
        },
        plugins: {
          legend: { display: false },
          zoom: {
            pan: {
              enabled: true,
              mode: "xy"
            },
            zoom: {
              wheel: {
                enabled: true
              },
              pinch: {
                enabled: true
              },
              mode: "xy"
            },
            limits: {
              x: { min: 'original', max: 'original' },
              y: { min: 'original', max: 'original' }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
      const point = context.raw;
      return `O: ${point.o}  H: ${point.h}  L: ${point.l}  C: ${point.c}`;
    },
            }
          }
        },
        scales: {
          x: {
            type: "time",
  time: {
    tooltipFormat: "MMM d, yyyy HH:mm",
                unit: timeframe === "1m" || timeframe === "15m" ? "minute" :
                      timeframe === "1h"  ? "hour"   :
                      timeframe === "1d" || timeframe === "1w" ? "day" :
                      "month"
  },
  ticks: { color: "#aaa" }
          },
          y: {
            ticks: { color: "#aaa" },
            // min ve max grafik dinamikliği için chartData'dan hesaplanıyor
            min: Math.min(...chartData.datasets[0].data.map(d => d.l)) * 0.95,
            max: Math.max(...chartData.datasets[0].data.map(d => d.h)) * 1.05
          }
        }
      }
    });

    console.log("✅ Candlestick chart initialized", candlestickRef.current);
    console.log("📊 Candlestick data points:", chartData.datasets[0].data);
  };

  requestAnimationFrame(drawChart);

  return () => {
    if (candlestickRef.current) {
      candlestickRef.current.destroy();
      candlestickRef.current = null;
    }
  };
}, [chartType, chartData, crypto.symbol]);



  const handleTrade = async () => {
    if (!action || !selectedPortfolioId || quantity <= 0 || price <= 0) {
      setMessage("Please fill all fields correctly.");
      return;
    }
    const total = quantity * price;
    try {
      const response = await fetch(`/portfolio/${selectedPortfolioId}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: crypto.symbol,
          action,
          quantity,
          price,
          total,
          transactionDate,
        }),
      });
      const result = await response.json();
      setMessage(response.ok ? "Trade successful!" : result.message);
    } catch (error) {
      setMessage("Error occurred while processing the trade.");
    }
  };

  if (!crypto) return null;

  return (
  <div className="bg-gray-100 dark:bg-gray-900 text-black dark:text-white min-h-screen px-4 sm:px-6 lg:px-8 py-6">
    <button onClick={onBack} className="bg-blue-500 text-white px-4 py-2 rounded mb-6">Back</button>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold mb-4">{crypto.symbol}</h1>
        <p className="text-green-500 text-xl font-semibold">
          ${crypto.price.toLocaleString()} ({crypto.change?.toFixed(2)}%)
        </p>
        <div className="grid grid-cols-2 gap-4 text-sm mt-4">
          {[
            ["High (1h)", crypto.hourlyHigh],
            ["Low (1h)", crypto.hourlyLow],
            ["High (1d)", crypto.dailyHigh],
            ["Low (1d)", crypto.dailyLow],
            ["High (1w)", crypto.weeklyHigh],
            ["Low (1w)", crypto.weeklyLow],
            ["High (1M)", crypto.monthlyHigh],
            ["Low (1M)", crypto.monthlyLow],
            ["Volume (24h)", crypto.volume],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="font-bold">{label}</p>
              <p>{typeof value === "number" ? `$${value.toLocaleString()}` : "Loading..."}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-lg font-bold mb-4">Trade {crypto.symbol}</h2>

        <select className="w-full mb-4 px-3 py-2 border rounded dark:bg-gray-700 dark:text-white" value={selectedPortfolioId} onChange={(e) => setSelectedPortfolioId(e.target.value)}>
          <option value="">-- Select Portfolio --</option>
          {portfolios.map((p) => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>

        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          {["buy", "sell"].map((value) => (
            <button
              key={value}
              onClick={() => setAction(value)}
              className={`flex-1 px-4 py-2 rounded ${
                action === value ? (value === "buy" ? "bg-green-500 text-white" : "bg-red-500 text-white") : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded dark:bg-gray-700"
            placeholder="Price"
          />
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded dark:bg-gray-700"
            placeholder="Quantity"
          />
          <input
            type="datetime-local"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            className="col-span-1 md:col-span-2 px-3 py-2 border rounded dark:bg-gray-700"
          />
        </div>

        <p className="text-lg font-bold mb-2">Total: ${(price * quantity).toFixed(2)}</p>
        <button onClick={handleTrade} className="w-full bg-blue-500 text-white py-2 rounded">
          Submit Trade
        </button>
        {message && <p className="mt-2 text-center">{message}</p>}
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-lg font-bold">Predictions</h2>
        <div className="relative">
          <button
            onClick={() => setShowHint((prev) => !prev)}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-300 dark:bg-gray-600 text-black dark:text-white text-sm font-bold ml-2"
            title="Model Info"
          >
            ?
          </button>
          {showHint && (
            <div className="absolute right-0 mt-2 w-80 p-3 text-sm text-black dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg z-50">
              <p><b>TREE</b>: Decision Tree – fast but can overfit</p>
              <p><b>SVR</b>: Support Vector Regression – good for smaller data</p>
              <p><b>RF</b>: Random Forest – ensemble of trees, stable</p>
              <p><b>LR</b>: Linear Regression – fast, works for simple trends</p>
              <p><b>CNN_REG</b>: Convolutional Neural Network – learns from price patterns</p>
              <p><b>LSTM</b>: Long Short-Term Memory – ideal for time-series with memory</p>
            </div>
          )}
        </div>

        <select
          className="w-full mb-4 px-3 py-2 border rounded dark:bg-gray-700 dark:text-white"
          value={predInterval}
          onChange={(e) => setPredInterval(Number(e.target.value))}
        >
          {[15, 60, 240, 1440].map((mins) => (
            <option key={mins} value={mins}>
              Next {intervalMap(mins)}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {models.map((m) => (
            <div
              key={m}
              className="flex flex-col items-center p-2 bg-gray-100 dark:bg-gray-700 rounded"
            >
              <span className="font-semibold text-sm">{m.toUpperCase()}</span>
              <span className="mt-1 text-sm break-words text-center">
                {preds[m] ?? <em>…</em>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="flex flex-wrap gap-4 mt-8">
      {["1m", "15m", "1h", "1d", "1w", "1M"].map((tf) => (
        <button
          key={tf}
          onClick={() => setTimeframe(tf)}
          className={`px-4 py-2 rounded ${timeframe === tf ? "bg-blue-500 text-white" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          {tf}
        </button>
      ))}
    </div>

    <div className="mt-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h3 className="text-lg font-bold">Price Chart</h3>
      <button
        onClick={() => setShowChartHint((prev) => !prev)}
        className="w-5 h-5 flex items-center justify-center text-xs font-bold bg-gray-300 dark:bg-gray-600 text-black dark:text-white rounded-full"
        title="Candlestick Chart Help"
      >
        ?
      </button>
      {chartType === "candlestick" && showChartHint && (
        <div className="relative z-50 bg-white dark:bg-gray-800 text-black dark:text-white border dark:border-gray-700 p-4 rounded shadow-md mb-4 max-w-4xl text-sm flex flex-col md:flex-row items-start gap-4">
          <div className="flex-1">
            <p className="mb-2 font-semibold text-blue-600 dark:text-blue-400">📊 How to Read a Candlestick Chart</p>
            <p className="mb-1">
              Each candle shows <b>open</b>, <b>high</b>, <b>low</b>, and <b>close</b> prices of a time period:
            </p>
            <ul className="list-disc list-inside mb-2">
              <li><b>O</b>: Opening price</li>
              <li><b>H</b>: Highest price</li>
              <li><b>L</b>: Lowest price</li>
              <li><b>C</b>: Closing price</li>
            </ul>
            <p>
              A <span className="text-green-600 font-bold">green</span> candle means price went up (<code>Close &gt; Open</code>),
              and a <span className="text-red-500 font-bold">red</span> candle means price went down (<code>Close &lt; Open</code>).
            </p>
          </div>
          <img
            src={candleChartImg}
            alt="Candlestick chart structure"
            className="w-full md:w-96 rounded shadow-md border dark:border-gray-600"
          />
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setChartType("line")}
          className={`px-3 py-1 rounded ${chartType === "line" ? "bg-blue-500 text-white" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          Line
        </button>
        <button
          onClick={() => setChartType("candlestick")}
          className={`px-3 py-1 rounded ${chartType === "candlestick" ? "bg-blue-500 text-white" : "bg-gray-300 dark:bg-gray-600"}`}
        >
          Candlestick
        </button>
      </div>

      <div className="relative h-[400px] w-full overflow-hidden mt-4">
        {chartData ? (
          chartType === "candlestick" ? (
            <canvas
              id="candlestick-chart"
              width="1000"
              height="400"
              style={{ display: "block", width: "100%", height: "400px" }}
            ></canvas>
          ) : (
            <Line
              ref={lineChartRef}
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    type: "time",
                    time: {
                      tooltipFormat: "PPpp",
                      displayFormats: {
                        minute: "HH:mm",
                        hour: "MMM d, HH:mm",
                        day: "MMM d",
                        week: "MMM d",
                        month: "MMM d",
                      },
                    },
                    ticks: {
                      autoSkip: true,
                      maxTicksLimit: 12,
                      maxRotation: 0,
                      minRotation: 0,
                      source: "auto",
                    },
                    title: {
                      display: true,
                      text: "Time",
                    },
                  },
                  y: {
                    min: yAxisRange?.min,
                    max: yAxisRange?.max,
                    title: {
                      display: true,
                      text: "Price (USDT)",
                    },
                  },
                },
                plugins: {
                  tooltip: {
                    callbacks: {
                      title: (tooltipItems) => {
                        const ts = new Date(tooltipItems[0].label);
                        return `Time: ${ts.toLocaleString("tr-TR")}`;
                      },
                      label: (context) => {
                        const price = context.raw;
                        return price ? `Price: $${price.toFixed(2)}` : "";
                      },
                    },
                  },
                  zoom: {
                    pan: { enabled: true, mode: "xy" },
                    zoom: {
                      wheel: { enabled: true },
                      pinch: { enabled: true },
                      mode: "xy",
                    },
                    limits: {
                      x: { min: 'original', max: 'original' },
                      y: { min: 'original', max: 'original' },
                    },
                    reset: false,
                  },
                  legend: { display: false },
                },
              }}
              height={400}
            />
          )
        ) : (
          <p>Loading chart...</p>
        )}
      </div>
    </div>
  </div>
);
};

export default TradePage;
