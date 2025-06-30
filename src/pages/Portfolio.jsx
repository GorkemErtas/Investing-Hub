import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PortfolioCustomization from "../components/PortfolioCustomization";
import PortfolioDetails from "../components/PortfolioDetails";
import axios from 'axios';
axios.defaults.baseURL = import.meta.env.VITE_API_URL;

export default function Portfolio() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDetailsVisible, setDetailsVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [isCustomizationVisible, setCustomizationVisible] = useState(false);
  const [portfolios, setPortfolios] = useState([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);

  // Fetch Portfolios
  useEffect(() => {
    // Fetch user's portfolios from the server
    const fetchPortfolios = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem("user"));
        if (userData) {
          setUser(userData);
          const response = await fetch(
            `/portfolios?userId=${userData.id}`
          );
          const data = await response.json();
          setPortfolios(data);
        }
      } catch (error) {
        console.error("Error fetching portfolios:", error);
      }
    };

    fetchPortfolios();
  }, []);

  const handleCreatePortfolio = () => {
    if (user) {
      setSelectedPortfolio(null);
      setCustomizationVisible(true);
    } else {
      navigate("/auth", { state: { from: location.pathname } });
    }
  };

  const handleEditPortfolio = (portfolio) => {
    setSelectedPortfolio(portfolio);
    setCustomizationVisible(true);
  };

  // Portföyleri yeniden yüklemek için bir yardımcı fonksiyon
  const reloadPortfolios = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem("user"));
      if (userData) {
        const response = await fetch(
          `/portfolios?userId=${userData.id}`
        );
        const data = await response.json();
        setPortfolios(data);
      }
    } catch (error) {
      console.error("Error fetching portfolios:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-black dark:text-white px-4 sm:px-6 lg:px-8">
      <header className="bg-white dark:bg-gray-800 shadow"></header>
      <main className="max-w-7xl mx-auto py-16">
        {!isCustomizationVisible && !isDetailsVisible ? (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-gray-800 dark:text-white mb-4">
              Crypto Portfolio Tracker
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-8">
              Keep track of your profits, losses, and portfolio valuation with
              our easy-to-use platform.
            </p>
            <div className="space-x-4">
              <button
                onClick={handleCreatePortfolio}
                className="bg-blue-500 text-white px-6 py-3 rounded hover:bg-blue-600"
              >
                Create New Portfolio
              </button>
            </div>

            {portfolios.length > 0 && (
              <div className="mt-12">
                <h3 className="text-2xl font-bold mb-6">Your Portfolios</h3>
                <div className="space-y-4">
                  {portfolios.map((portfolio) => (
                    <div
                      key={portfolio._id}
                      className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4"
                    >
                      <div>
                        <h4 className="text-lg font-bold">{portfolio.name}</h4>
                        <p className="text-gray-600 dark:text-gray-400">
                          Transactions: {portfolio.transactions.length}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => handleEditPortfolio(portfolio)}
                          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPortfolio(portfolio);
                            setDetailsVisible(true);
                          }}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : isCustomizationVisible ? (
          <PortfolioCustomization
            portfolio={selectedPortfolio}
            userId={user?.id}
            onBack={() => {
              setCustomizationVisible(false);
              reloadPortfolios();
            }}
          />
        ) : (
          <PortfolioDetails
            portfolioId={selectedPortfolio?._id}
            onBack={() => {
              setDetailsVisible(false);
              reloadPortfolios();
            }}
          />
        )}
      </main>
    </div>
  );
}
