import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getUser, setCurrentUserId } from "../api/client";

const STORAGE_KEY = "xpense.userId";

interface AuthContextValue {
  ready: boolean;
  userId: number | null;
  login: (id: number) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const storedId = stored ? Number(stored) : null;
      if (storedId !== null) {
        try {
          await getUser(storedId);
          setCurrentUserId(storedId);
          setUserId(storedId);
        } catch {
          // Stale id -- e.g. the backend database was reset/redeployed since this device last
          // logged in. Clear it rather than leaving the app stuck calling every endpoint with a
          // user_id that no longer exists.
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (id: number) => {
    // Must happen before the userId state update below: App.tsx swaps straight from Login to
    // TransactionsProvider the instant userId becomes non-null, and every fetch that provider
    // fires on mount depends on CURRENT_USER_ID already being correct.
    setCurrentUserId(id);
    await AsyncStorage.setItem(STORAGE_KEY, String(id));
    setUserId(id);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUserId(null);
  }, []);

  const value = useMemo(() => ({ ready, userId, login, logout }), [ready, userId, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
