import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

// Focus-aware polling: no overlapping work, no polling of hidden tabs/background apps,
// and responses from a previous screen/asset cannot update the current view.
export function useResource<T>(load: () => Promise<T>, interval = 60000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      let active = true,
        busy = false;
      setData(null);
      setError("");
      setLoading(true);
      const refresh = async () => {
        if (!active || busy || AppState.currentState === "background") return;
        busy = true;
        try {
          const value = await load();
          if (active) {
            setData(value);
            setError("");
          }
        } catch (failure) {
          if (active)
            setError(
              failure instanceof Error ? failure.message : "Data unavailable.",
            );
        } finally {
          busy = false;
          if (active) setLoading(false);
        }
      };
      void refresh();
      const timer = setInterval(() => {
        void refresh();
      }, interval);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void refresh();
      });
      return () => {
        active = false;
        clearInterval(timer);
        subscription.remove();
      };
    }, [load, interval]),
  );
  return { data, error, loading };
}
