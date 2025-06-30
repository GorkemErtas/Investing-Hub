import React from "react";
import TrendingCoins from "../components/TrendingCoins";
import TopExchanges from "../components/TopExchanges";
import CryptoPricesTable from "../components/CryptoPricesTable";
import RightSidebar from "../components/RightSidebar";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const Home = () => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-black dark:text-white px-4 sm:px-6 lg:px-8">
      {/* Sayfa Başlığı */}
      <div className="text-center py-6">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white">Crypto Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg mt-2">
          Follow the market, trade smart, grow your portfolio.
        </p>
      </div>

      {/* İçerik */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sol Alan: Ana içerik */}
        <div className="flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TrendingCoins />
            <TopExchanges />
          </div>
          <CryptoPricesTable />
        </div>
      </div>

      {/* Sağ Kenar Çubuğu */}
      <RightSidebar />
    </div>
  );
};

export default Home;