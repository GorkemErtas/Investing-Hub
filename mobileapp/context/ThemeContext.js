import React from "react";
import { SettingsProvider, useSettings } from "./SettingsContext";
export const ThemeProvider = SettingsProvider;
export const useTheme = () => {
  const { settings, save, warning } = useSettings();
  return {
    isDarkMode: settings.theme === "dark",
    warning,
    setDarkMode: async (value) => {
      try {
        await save({ theme: value ? "dark" : "light" });
      } catch {
        /* warning is rendered by the layout */
      }
    },
  };
};
