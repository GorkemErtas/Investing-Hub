// src/context/SelectedCoinsContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../components/env-config";
import { useAuth } from "./AuthContext";

interface SelectedCoinsContextProps {
  selectedCoins: string[];
  toggleCoin: (coin: string) => void;
  saveSelectedCoins: (coins: string[]) => void;
  clearSelectedCoins: () => void;
}

const SelectedCoinsContext = createContext<SelectedCoinsContextProps | undefined>(undefined);

export const SelectedCoinsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [selectedCoins, setSelectedCoins] = useState<string[]>([]);

  const fetchSelectedCoins = async () => {
    if (user) {
      try {
        const res = await axios.get(`http://${API_BASE_URL}/settings/${user.id}`);
        if (res.data.selectedCoins) {
          setSelectedCoins(res.data.selectedCoins);
        }
      } catch (err) {
        console.error("Error fetching selected coins:", err);
      }
    } else {
      const stored = await AsyncStorage.getItem("guest_selectedCoins");
      if (stored) {
        setSelectedCoins(JSON.parse(stored));
      }
    }
  };

  useEffect(() => {
    fetchSelectedCoins();
  }, [user]);

  const saveSelectedCoins = async (coins: string[]) => {
    if (user) {
      try {
        await axios.put(`http://${API_BASE_URL}/settings/${user.id}`, { selectedCoins: coins });
      } catch (err) {
        console.error("Error saving selected coins:", err);
      }
    } else {
      await AsyncStorage.setItem("guest_selectedCoins", JSON.stringify(coins));
    }
    setSelectedCoins(coins);
  };

  const toggleCoin = (coin: string) => {
    const updatedCoins = selectedCoins.includes(coin)
      ? selectedCoins.filter((c) => c !== coin)
      : [...selectedCoins, coin];
    saveSelectedCoins(updatedCoins);
  };

  const clearSelectedCoins = async () => {
    if (user) {
      saveSelectedCoins([]);
    } else {
      await AsyncStorage.removeItem("guest_selectedCoins");
      setSelectedCoins([]);
    }
  };

  return (
    <SelectedCoinsContext.Provider value={{ selectedCoins, toggleCoin, saveSelectedCoins, clearSelectedCoins }}>
      {children}
    </SelectedCoinsContext.Provider>
  );
};

export const useSelectedCoins = () => {
  const context = useContext(SelectedCoinsContext);
  if (context === undefined) {
    throw new Error("useSelectedCoins must be used within a SelectedCoinsProvider");
  }
  return context;
};
