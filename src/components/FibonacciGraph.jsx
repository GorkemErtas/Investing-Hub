import React, { useState, useEffect } from "react";
import { Chart } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { CandlestickController, CandlestickElement } from "chartjs-chart-financial";
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


ChartJS.register(
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  CandlestickController,
  CandlestickElement
);

const FibonacciGraph = ({ cryptoSymbol }) => {
  const [timeframe, setTimeframe] = useState("7");
  const [ohlcData, setOhlcData] = useState([]);
  const [labels, setLabels] = useState([]);
  const [fibonacciLevels, setFibonacciLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cryptoSymbol) {
      setError("Invalid cryptocurrency symbol.");
      return;
    }

    const fetchFibonacciData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/fibonacci/${cryptoSymbol}/${timeframe}`);
        if (!response.ok) throw new Error("Failed to fetch Fibonacci data from backend.");

        const { marketChart } = await response.json();

        const ohlc = marketChart.prices.map(([timestamp, close], index, arr) => {
          const open = index === 0 ? close : arr[index - 1][1];
          const high = Math.max(open, close);
          const low = Math.min(open, close);
          return { x: new Date(timestamp), o: open, h: high, l: low, c: close };
        });

        setOhlcData(ohlc);
        setLabels(ohlc.map((entry) => entry.x.toLocaleDateString("en-US")));

        const high = Math.max(...ohlc.map((entry) => entry.h));
        const low = Math.min(...ohlc.map((entry) => entry.l));

        setFibonacciLevels([
          { label: "0% (High)", value: high },
          { label: "23.6%", value: high - (high - low) * 0.236 },
          { label: "38.2%", value: high - (high - low) * 0.382 },
          { label: "50.0%", value: high - (high - low) * 0.5 },
          { label: "61.8%", value: high - (high - low) * 0.618 },
          { label: "78.6%", value: high - (high - low) * 0.786 },
          { label: "100% (Low)", value: low },
        ]);

        setLoading(false);
      } catch (error) {
        console.error("Error fetching Fibonacci data:", error);
        setError(error.message || "Something went wrong.");
        setLoading(false);
      }
    };

    fetchFibonacciData();
  }, [cryptoSymbol, timeframe]);

  if (loading) return <p className="text-center py-6 dark:text-white">Loading Fibonacci data...</p>;
  if (error) return <p className="text-red-500 text-center py-6">Error: {error}</p>;

  return (
    <div className="bg-gray-100 dark:bg-gray-900 text-black dark:text-white p-4 sm:p-6 max-w-screen-xl w-full mx-auto rounded-lg shadow">
      {/* Timeframe Selector */}
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {["1", "7", "30", "365"].map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-4 py-2 rounded transition ${
              timeframe === tf
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-black dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            {tf === "1" ? "1 Day" : tf === "7" ? "1 Week" : tf === "30" ? "1 Month" : "1 Year"}
          </button>
        ))}
      </div>

      {/* Chart Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 overflow-x-auto">
        <h2 className="text-xl font-bold mb-4">Fibonacci Retracement</h2>
        <div className="h-[400px]">
          <Chart
            type="candlestick"
            data={{
              labels,
              datasets: [
                {
                  label: "Candlestick Data",
                  data: ohlcData,
                  borderColor: "black",
                  borderWidth: 1,
                },
                ...fibonacciLevels.map((level) => ({
                  label: level.label,
                  data: Array(labels.length).fill(level.value),
                  borderColor: "rgba(255, 99, 132, 0.5)",
                  borderDash: [5, 5],
                  pointRadius: 0,
                  borderWidth: 1.5,
                })),
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true },
              },
              scales: {
                x: { title: { display: true, text: "Date" } },
                y: { title: { display: true, text: "Price (USD)" } },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default FibonacciGraph;
