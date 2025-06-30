import React, { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import notificationSound from '../assets/sounds/notification.mp3';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const AlertThresholdContext = createContext();

export const AlertThresholdProvider = ({ children }) => {
  const [priceAlerts, setPriceAlerts] = useState({});
  const [notifications, setNotifications] = useState([]);

  const fetchSettings = async () => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/settings/${user.id}`);
      setPriceAlerts(res.data.priceAlerts || {});
    } catch (error) {
      console.error("Error fetching alert thresholds:", error.message);
    }
  };

  const updateSettings = async (newPriceAlerts) => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/settings/${user.id}`, { priceAlerts: newPriceAlerts });
      setPriceAlerts(newPriceAlerts);
    } catch (error) {
      console.error("Error updating alert thresholds:", error.message);
    }
  };

  const loadTriggeredAlerts = async () => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    console.log("🔁 [AlertThreshold] Fetching triggered alerts for:", user.id);

    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/triggered-alerts/${user.id}`);
      console.log("📥 [AlertThreshold] Raw alerts from server:", res.data);
      if (res.data.length > 0) {
  const audio = new Audio(notificationSound);
  audio.volume = 0.7;
  audio.play().catch((e) => console.error("🔇 Ses çalma hatası:", e));
}
      setNotifications(res.data);
    } catch (error) {
      console.error("❌ [AlertThreshold] Error loading triggered alerts:", error.message);
    }
  };

  const removeNotification = (indexToRemove) => {
  setNotifications((prev) => prev.filter((_, i) => i !== indexToRemove));
};

  useEffect(() => {
    fetchSettings();
    loadTriggeredAlerts();
  }, []);

  return (
    <AlertThresholdContext.Provider
      value={{
        priceAlerts,
        setPriceAlerts: updateSettings,
        notifications,
        loadTriggeredAlerts,
        removeNotification,
      }}
    >
      {children}
    </AlertThresholdContext.Provider>
  );
};

export const useAlertThreshold = () => useContext(AlertThresholdContext);
