import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import {
  registerForPushNotificationsAsync,
  watchTokenRefresh,
} from "../utils/notifications";
import { api, onUnauthorized } from "../services/api";
import { tokenStore } from "../services/tokenStore";

import type { User } from "@investing-hub/shared/mobile";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  warning: string;
  login: (user: User, token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");
  const epoch = useRef(0);

  useEffect(() => {
    let alive = true;
    const loadUser = async () => {
      const generation = epoch.current;
      try {
        // Legacy plaintext sessions are deliberately retired, never trusted.
        await AsyncStorage.multiRemove(["token", "user"]);
        if (await tokenStore.get()) {
          const profile = await api.me();
          if (alive && generation === epoch.current) setUser(profile);
        }
      } catch {
        if (alive && generation === epoch.current) {
          setUser(null);
          setWarning(
            "Session could not be restored. Log in again or retry when the service is available.",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void loadUser();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadUser();
    });
    const unsubscribe = onUnauthorized(() => {
      epoch.current++;
      void tokenStore.clear().catch(() => {
        if (alive)
          setWarning(
            "Could not clear expired secure session. Please retry logout.",
          );
      });
      if (alive) setUser(null);
    });
    return () => {
      alive = false;
      subscription.remove();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let unsubscribe = () => {};
    void api
      .capabilities()
      .then(async (capabilities) => {
        if (!capabilities.notifications || !active) return;
        unsubscribe = watchTokenRefresh((token) => {
          if (active)
            void api.pushToken(token).catch(() => {
              if (active) setWarning("Push token could not be refreshed.");
            });
        });
        const token = await registerForPushNotificationsAsync();
        if (token && active) await api.pushToken(token);
      })
      .catch(() => {
        if (active)
          setWarning(
            "Push registration is unavailable. Account and portfolio access remain available.",
          );
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.id]);

  const login = async (user: User, token: string) => {
    epoch.current++;
    await tokenStore.set(token);
    setWarning("");
    setUser(user);
  };

  const logout = async () => {
    epoch.current++;
    try {
      await api.removePushToken();
    } catch {
      setWarning(
        "Logged out locally; push registration could not be removed while offline.",
      );
    }
    try {
      await tokenStore.clear();
    } catch {
      setWarning("Could not remove the secure session. Please retry logout.");
      return;
    }
    await AsyncStorage.multiRemove(["user", "token"]);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, warning, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
