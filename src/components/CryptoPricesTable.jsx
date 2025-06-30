import React, { useState, useEffect } from "react";
import TradePage from "./TradePage";
import { useSelectedCoins } from "../context/SelectedCoinsContext";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const CryptoPricesTable = () => {
  const [cryptoData, setCryptoData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrypto, setSelectedCrypto] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({
    assetType: "All assets",
    timeframe: "1H",
    currency: "USD",
    rowCount: 30,
  });

  const { selectedCoins } = useSelectedCoins();

  const [sortField, setSortField] = useState("mktCap");
  const [sortOrder, setSortOrder] = useState("desc");

  const conversionRates = { USD: 1, EUR: 0.88, GBP: 0.74, TRY: 39.14 };
  const currencySymbols = { USD: "$", EUR: "€", GBP: "£", TRY: "₺" };

  useEffect(() => {
    const fetchCryptoData = async () => {
      try {
        const response = await fetch("/crypto-data");
        const result = await response.json();
        setCryptoData(result.data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching crypto data from backend:", error.message);
        setLoading(false);
      }
    };

    fetchCryptoData();
    const interval = setInterval(fetchCryptoData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleFilterChange = async (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));

    if (key === "assetType") {
      try {
        setLoading(true);
        const response = await fetch(`/${value.toLowerCase()}`);
        const result = await response.json();
        setCryptoData(result.data);
      } catch (error) {
        console.error(`Error fetching ${value.toLowerCase()} data:`, error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSort = (field) => {
    let newOrder;
    if (sortField === field) {
      newOrder = sortOrder === "asc" ? "desc" : sortOrder === "desc" ? "" : "asc";
    } else {
      newOrder = "asc";
    }
    setSortField(field);
    setSortOrder(newOrder);

    if (newOrder === "") {
      setCryptoData([...cryptoData]);
      return;
    }

    const sortedData = [...cryptoData].sort((a, b) => {
      const valA = a[field];
      const valB = b[field];
      if (typeof valA === "string") {
        return newOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return newOrder === "asc" ? valA - valB : valB - valA;
    });

    setCryptoData(sortedData);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gray-100 dark:bg-gray-900 text-black dark:text-white">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (selectedCrypto) {
    return <TradePage crypto={selectedCrypto} onBack={() => setSelectedCrypto(null)} />;
  }

  const displayedData = selectedCoins.length > 0
    ? cryptoData.filter((coin) => selectedCoins.includes(coin.symbol))
    : cryptoData;

  return (
    <div className="bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg shadow-lg p-4 sm:p-6 overflow-x-auto max-w-screen-xl mx-auto">
      <div className="flex flex-wrap gap-4 justify-between items-center mb-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={filters.currency}
            onChange={(e) => handleFilterChange("currency", e.target.value)}
            className="border px-3 py-2 rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="TRY">TRY</option>
          </select>

          <select
            value={filters.rowCount}
            onChange={(e) => handleFilterChange("rowCount", parseInt(e.target.value))}
            className="border px-3 py-2 rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <option value={10}>10 rows</option>
            <option value={30}>30 rows</option>
            <option value={50}>50 rows</option>
          </select>
        </div>

        <div className="flex-1 sm:flex-none">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or symbol"
            className="w-full sm:w-auto border px-3 py-2 rounded dark:bg-gray-700 dark:text-white dark:border-gray-600"
          />
        </div>
      </div>

      <table className="table-auto w-full text-sm">
        <thead>
          <tr className="border-b dark:border-gray-600">
            {[
              ["symbol", "Asset"],
              ["price", "Price"],
              ["volume", "Volume (24h)"],
              ["dailyChange", "Daily Change (%)"],
              ["weeklyChange", "Weekly Change (%)"],
              ["monthlyChange", "Monthly Change (%)"],
            ].map(([field, label]) => (
              <th
                key={field}
                className="px-4 py-2 cursor-pointer whitespace-nowrap"
                onClick={() => handleSort(field)}
              >
                {label}{" "}
                {sortField === field &&
                  (sortOrder === "asc" ? "▲" : sortOrder === "desc" ? "▼" : "")}
              </th>
            ))}
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {displayedData
            .filter((item) =>
              item.symbol?.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .slice(0, filters.rowCount)
            .map((item, index) => {
              const currency = filters.currency;
              const rate = conversionRates[currency] || 1;
              const symbol = currencySymbols[currency] || "$";
              const convertedPrice = (item.price ?? 0) * rate;
              const dailyChange = item.dailyChange?.toFixed(2) ?? "0.00";
              const weeklyChange = item.weeklyChange?.toFixed(2) ?? "0.00";
              const monthlyChange = item.monthlyChange?.toFixed(2) ?? "0.00";
              const volume = (item.volume ?? 0) * rate;

              return (
                <tr key={item.symbol || index} className="border-t dark:border-gray-600">
                  <td className="px-4 py-2 whitespace-nowrap">{item.symbol}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{symbol}{convertedPrice.toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{symbol}{volume.toLocaleString()}</td>
                  <td className={`px-4 py-2 whitespace-nowrap ${dailyChange > 0 ? "text-green-500" : "text-red-500"}`}>{dailyChange}%</td>
                  <td className={`px-4 py-2 whitespace-nowrap ${weeklyChange > 0 ? "text-green-500" : "text-red-500"}`}>{weeklyChange}%</td>
                  <td className={`px-4 py-2 whitespace-nowrap ${monthlyChange > 0 ? "text-green-500" : "text-red-500"}`}>{monthlyChange}%</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button
                      onClick={() =>
                        setSelectedCrypto({
                          ...item,
                          change: item.dailyChange,
                          highPrice: item.highPrice ?? 0,
                          lowPrice: item.lowPrice ?? 0,
                        })
                      }
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
};

export default CryptoPricesTable;
