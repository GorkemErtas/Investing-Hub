import React, { useState, useEffect } from "react";
import axios from "axios";


axios.defaults.baseURL = import.meta.env.VITE_API_URL;

const RightSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [newsType, setNewsType] = useState("cryptoPanic");
  const [cryptoPanicNews, setCryptoPanicNews] = useState([]);
  const [dailyAnalysis, setDailyAnalysis] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const togglePanel = () => setIsOpen((prev) => !prev);

  useEffect(() => {
    const fetchAllNews = async () => {
      try {
        setLoading(true);
        const [cryptoPanicRes, geminiRes] = await Promise.all([
          axios.get(`${import.meta.env.VITE_API_URL}/crypto-news`),
          axios.get(`${import.meta.env.VITE_API_URL}/geminicrypto-news?lang=en`),

        ]);

        setCryptoPanicNews(cryptoPanicRes.data.news || []);
        setDailyAnalysis(geminiRes.data.news || "No analysis available.");
        setLastUpdated(
          geminiRes.data.lastUpdated
            ? new Date(geminiRes.data.lastUpdated).toLocaleString()
            : "N/A"
        );
      } catch (err) {
        console.error("Error fetching news:", err);
        setError("Failed to load news.");
      } finally {
        setLoading(false);
      }
    };

    fetchAllNews();
  }, []);

  return (
    <>
      {/* Floating News Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={togglePanel}
          className="bg-blue-600 dark:bg-blue-500 text-white p-3 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 shadow-lg transition"
          title="Toggle News"
        >
          📰
        </button>
      </div>

      {/* Sliding News Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white dark:bg-gray-900 text-black dark:text-white shadow-lg z-40 transform transition-transform duration-300 ease-in-out overflow-y-auto p-4 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <h2 className="text-xl font-semibold mb-4">📢 Crypto News</h2>

        {/* Tab Switch */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => setNewsType("cryptoPanic")}
            className={`px-4 py-2 rounded transition ${
              newsType === "cryptoPanic"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-black dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            CryptoPanic News
          </button>
          <button
            onClick={() => setNewsType("dailyAnalysis")}
            className={`px-4 py-2 rounded transition ${
              newsType === "dailyAnalysis"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-black dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            Daily Analysis
          </button>
        </div>

        {/* News Content */}
        {loading ? (
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <div className="text-gray-700 dark:text-gray-300">
            {newsType === "cryptoPanic" ? (
              <ul className="space-y-2">
                {cryptoPanicNews.length > 0 ? (
                  cryptoPanicNews.map((item, index) => (
                    <li key={index} className="border-b border-gray-200 dark:border-gray-600 pb-2 mb-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {item.title}
                      </a>
                    </li>
                  ))
                ) : (
                  <p>No news available.</p>
                )}
              </ul>
            ) : (
              <p>{dailyAnalysis}</p>
            )}
          </div>
        )}

        {/* Last Updated */}
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          🕒 Last updated: {lastUpdated}
        </p>
      </div>
    </>
  );
};

export default RightSidebar;