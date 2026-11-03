import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { settingsSchema, type Settings } from "@investing-hub/shared/mobile";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

const defaults = settingsSchema.parse({});
const Context = createContext<{
  settings: Settings;
  warning: string;
  save: (patch: Partial<Settings>) => Promise<void>;
} | null>(null);
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const identity = useRef(user?.id);
  identity.current = user?.id;
  const [settings, setSettings] = useState(defaults);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    let active = true;
    setSettings(defaults);
    setWarning("");
    async function load() {
      try {
        let value: Settings;
        if (user) value = await api.settings();
        else {
          const values = await AsyncStorage.multiGet([
            "theme",
            "guest_selectedCoins",
            "guest_alertThreshold",
          ]);
          value = settingsSchema.parse({
            theme: values[0][1] ?? "light",
            selectedCoins: JSON.parse(values[1][1] ?? "[]"),
            alertThreshold: Number(values[2][1] ?? "10"),
          });
        }
        if (active) setSettings(value);
      } catch {
        if (active)
          setWarning(
            "Saved settings could not be loaded. Original data has been preserved.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);
  async function save(patch: Partial<Settings>) {
    const owner = user?.id;
    try {
      const next = settingsSchema.parse({ ...settings, ...patch });
      if (user) {
        const result = await api.saveSettings(patch);
        if (identity.current === owner) setSettings(result);
      } else {
        await AsyncStorage.multiSet([
          ["theme", next.theme],
          ["guest_selectedCoins", JSON.stringify(next.selectedCoins)],
          ["guest_alertThreshold", String(next.alertThreshold)],
        ]);
        if (identity.current === owner) setSettings(next);
      }
      setWarning("");
    } catch (error) {
      setWarning("Settings could not be saved. Please retry.");
      throw error;
    }
  }
  return (
    <Context.Provider value={{ settings, warning, save }}>
      {children}
    </Context.Provider>
  );
}
export function useSettings() {
  const value = useContext(Context);
  if (!value) throw new Error("SettingsProvider is required.");
  return value;
}
