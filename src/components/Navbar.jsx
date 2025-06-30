import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useSelectedCoins } from '../context/SelectedCoinsContext';
import ManageCoinsModal from './ManageCoinsModal';
import { useAlertThreshold } from '../context/AlertThresholdContext';
import axios from 'axios';

export default function Navbar() {
  const [user, setUser] = useState(null);
  const { theme, setTheme } = useTheme();
  const { clearSelectedCoins } = useSelectedCoins();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showManageCoins, setShowManageCoins] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, loadTriggeredAlerts, removeNotification } = useAlertThreshold();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user?.id) {
      localStorage.removeItem(`selectedCoins_${user.id}`);
    }
    clearSelectedCoins();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/auth');
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      loadTriggeredAlerts();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="bg-gray-800 text-white p-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
      {/* Logo */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <img
            src="https://i.hizliresim.com/bmkwbe4.png"
            alt="Logo"
            className="h-10 w-10 mr-2"
          />
          <h1 className="text-lg font-bold whitespace-nowrap">INVESTING HUB</h1>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex flex-wrap justify-center gap-4 text-sm sm:text-base">
        <Link to="/" className="hover:text-gray-400">Home</Link>
        <Link to="/portfolio" className="hover:text-gray-400">Portfolio</Link>
        <Link to="/learning-hub" className="hover:text-gray-400">Learning Hub</Link>
        {user ? (
          <button onClick={handleLogout} className="hover:text-red-400">Logout</button>
        ) : (
          <Link
            to="/auth"
            state={{ from: location.pathname }}
            className="hover:text-gray-400"
          >
            Login/Register
          </Link>
        )}
      </div>

      {/* Right Side - Notifications and Settings */}
      <div className="flex items-center justify-end gap-4 relative">
        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative text-xl hover:text-yellow-400"
            title="Price Alerts"
          >
            🔔
            {notifications.length > 0 && (
              <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full px-1">
                {notifications.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 max-h-64 overflow-y-auto bg-white dark:bg-gray-800 text-black dark:text-white shadow-lg rounded-lg z-50 p-3">
              <h3 className="text-sm font-bold mb-2">Triggered Alerts</h3>
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-400">No alerts</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {notifications.map((n, index) => (
                    <li key={index} className="border-b border-gray-300 dark:border-gray-600 pb-1 flex justify-between items-start">
                      <div>
                        <strong>{n.message || `${n.coin} hit threshold`}</strong>
                        <br />
                        <span className="text-xs text-gray-500">
                          {new Date(n.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={() => removeNotification(index)}
                        className="ml-2 text-red-500 hover:text-red-700 text-xs"
                        title="Delete"
                      >
                        ❌
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* User Name */}
        {user && (
          <span className="text-gray-200 hidden md:inline whitespace-nowrap">
            {user.firstName} {user.lastName}
          </span>
        )}

        {/* Settings Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="bg-gray-700 px-2 py-1 rounded"
          >
            ⚙️
          </button>
          {showDropdown && (
            <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 text-black dark:text-white shadow-md rounded w-44 z-50">
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  setTheme('light');
                  setShowDropdown(false);
                }}
              >
                ☀️ Light Mode
              </button>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  setTheme('dark');
                  setShowDropdown(false);
                }}
              >
                🌙 Dark Mode
              </button>
              <button
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowManageCoins(true);
                  setShowDropdown(false);
                }}
              >
                🪙 Manage Coins
              </button>
            </div>
          )}
          {showManageCoins && (
            <ManageCoinsModal onClose={() => setShowManageCoins(false)} />
          )}
        </div>
      </div>
    </nav>
  );
}
