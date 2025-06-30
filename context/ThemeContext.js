import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL } from "../components/env-config";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const loadTheme = async () => {
      if (user) {
        try {
          const res = await axios.get(`http://${API_BASE_URL}/settings/${user.id}`);
          const serverTheme = res.data.theme || "light";
          setIsDarkMode(serverTheme === "dark");
        } catch (err) {
          console.error("Error loading theme from server:", err);
        }
      } else {
        const savedTheme = await AsyncStorage.getItem("theme");
        setIsDarkMode(savedTheme === "dark");
      }
    };
    loadTheme();
  }, [user]);

  const setDarkMode = async (isDark) => {
    setIsDarkMode(isDark);

    if (user) {
      try {
        await axios.put(`http://${API_BASE_URL}/settings/${user.id}`, {
          theme: isDark ? "dark" : "light",
        });
      } catch (err) {
        console.error("Error updating theme in server:", err.message);
      }
    } else {
      await AsyncStorage.setItem("theme", isDark ? "dark" : "light");
    }
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, setDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
