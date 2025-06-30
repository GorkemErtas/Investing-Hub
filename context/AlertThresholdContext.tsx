import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../components/env-config";
import { useAuth } from "./AuthContext";

interface AlertThresholdContextProps {
  alertThreshold: number;
  setThreshold: (value: number) => void;
}

const AlertThresholdContext = createContext<AlertThresholdContextProps | undefined>(undefined);

export const AlertThresholdProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [alertThreshold, setAlertThreshold] = useState<number>(10);

  useEffect(() => {
    const loadThreshold = async () => {
      if (user) {
        try {
          const res = await axios.get(`http://${API_BASE_URL}/settings/${user.id}`);
          if (res.data.alertThreshold !== undefined) {
            setAlertThreshold(res.data.alertThreshold);
          }
        } catch (err) {
          console.error("Error loading alert threshold:", err);
        }
      } else {
        const stored = await AsyncStorage.getItem("guest_alertThreshold");
        if (stored !== null && !isNaN(Number(stored))) {
            setAlertThreshold(parseInt(stored, 10));
        }
      }
    };
    loadThreshold();
  }, [user]);

  const setThreshold = async (value: number) => {
    setAlertThreshold(value);

    if (user) {
      try {
        await axios.put(`http://${API_BASE_URL}/settings/${user.id}`, {
          alertThreshold: value,
        });
      } catch (err) {
        console.error("Error updating threshold:", err);
      }
    } else {
      await AsyncStorage.setItem("guest_alertThreshold", value.toString());
    }
  };

  return (
    <AlertThresholdContext.Provider value={{ alertThreshold, setThreshold }}>
      {children}
    </AlertThresholdContext.Provider>
  );
};

export const useAlertThreshold = () => {
  const context = useContext(AlertThresholdContext);
  if (!context) {
    throw new Error("useAlertThreshold must be used within AlertThresholdProvider");
  }
  return context;
};
