import React, { useState, useEffect } from 'react';
import { useSelectedCoins } from '../context/SelectedCoinsContext';
import { useAlertThreshold } from '../context/AlertThresholdContext';
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const AVAILABLE_COINS = [
  'BTC', 'ETH', 'BNB', 'XRP', 'ADA', 'DOGE', 'MATIC', 'SOL', 'DOT', 'SHIB',
  'TRX', 'LTC', 'LINK', 'AVAX', 'UNI', 'ATOM', 'ETC', 'XLM', 'BCH', 'APT',
  'APE', 'FIL', 'NEAR', 'QNT', 'AAVE', 'AXS', 'SAND', 'VET', 'EGLD', 'EOS'
];

const ManageCoinsModal = ({ onClose }) => {
  const { selectedCoins, setSelectedCoins } = useSelectedCoins();
  const { priceAlerts, setPriceAlerts } = useAlertThreshold();

  const [localSelectedCoins, setLocalSelectedCoins] = useState([]);
  const [localPriceAlerts, setLocalPriceAlerts] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setLocalSelectedCoins(selectedCoins);
    setLocalPriceAlerts(priceAlerts);
  }, [selectedCoins, priceAlerts]);

  const handleToggle = (coin) => {
    setLocalSelectedCoins((prev) =>
      prev.includes(coin) ? prev.filter((c) => c !== coin) : [...prev, coin]
    );
  };

  const handlePriceChange = (coin, type, value) => {
    setLocalPriceAlerts((prev) => ({
      ...prev,
      [coin]: {
        ...prev[coin],
        [type]: parseFloat(value),
      },
    }));
  };

  const handleSave = async () => {
    await setSelectedCoins(localSelectedCoins);
    await setPriceAlerts(localPriceAlerts);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1000);
  };

  const handleSelectAll = () => setLocalSelectedCoins([...AVAILABLE_COINS]);
  const handleClearAll = () => setLocalSelectedCoins([]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50 px-4">
      <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 sm:p-6 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto relative">
        <h2 className="text-2xl font-bold mb-4 text-center sm:text-left">Select Your Coins</h2>

        {/* Select All / Clear All */}
        <div className="flex justify-between mb-4">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
          >
            Clear All
          </button>
        </div>

        {/* Coin List with Thresholds */}
        <div className="grid grid-cols-1 gap-4">
          {AVAILABLE_COINS.map((coin) => (
            <div key={coin} className="border p-3 rounded bg-gray-100 dark:bg-gray-700">
              <label className="flex items-center space-x-2 mb-2">
                <input
                  type="checkbox"
                  checked={localSelectedCoins.includes(coin)}
                  onChange={() => handleToggle(coin)}
                  className="form-checkbox"
                />
                <span className="font-semibold">{coin}</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min price (USD)"
                  value={localPriceAlerts[coin]?.min || ""}
                  onChange={(e) => handlePriceChange(coin, 'min', e.target.value)}
                  className="px-2 py-1 rounded border text-sm dark:bg-gray-600 w-full"
                />
                <input
                  type="number"
                  placeholder="Max price (USD)"
                  value={localPriceAlerts[coin]?.max || ""}
                  onChange={(e) => handlePriceChange(coin, 'max', e.target.value)}
                  className="px-2 py-1 rounded border text-sm dark:bg-gray-600 w-full"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Buttons */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 w-full sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 w-full sm:w-auto"
          >
            Save
          </button>
        </div>

        {/* Toast */}
        {saveSuccess && (
          <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded shadow-lg animate-pulse">
            Saved Successfully!
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageCoinsModal;
