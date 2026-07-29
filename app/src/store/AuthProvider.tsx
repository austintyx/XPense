import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { ApiError, getUser, setCurrentUserId } from "../api/client";

const STORAGE_KEY = "xpense.userId";
// Covers most Render free-tier cold-starts (typically 30-60s) without the user having to do
// anything -- an immediate attempt, then two backoff retries, before giving up and asking them to
// retry manually.
const RETRY_DELAYS_MS = [0, 3000, 7000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AuthContextValue {
  ready: boolean;
  userId: number | null;
  // True once every retry above has failed with something other than a confirmed 404 (a
  // connectivity problem, not proof the session is invalid) -- lets App.tsx show a "couldn't
  // reach the server, retry" state instead of silently treating a cold start as a logout.
  sessionError: boolean;
  login: (id: number) => Promise<void>;
  logout: () => Promise<void>;
  retryAuth: () => Promise<void>;
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
  const [sessionError, setSessionError] = useState(false);

  const checkStoredSession = useCallback(async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const storedId = stored ? Number(stored) : null;
    if (storedId === null) {
      setReady(true);
      return;
    }

    setSessionError(false);
    for (const retryDelay of RETRY_DELAYS_MS) {
      if (retryDelay > 0) await delay(retryDelay);
      try {
        await getUser(storedId);
        setCurrentUserId(storedId);
        setUserId(storedId);
        setReady(true);
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // The stored id genuinely doesn't exist anymore -- e.g. the backend database was
          // reset/redeployed since this device last logged in. Clear it rather than leaving the
          // app stuck calling every endpoint with a user_id that no longer exists.
          await AsyncStorage.removeItem(STORAGE_KEY);
          setReady(true);
          return;
        }
        // Anything else (network error, timeout, 5xx -- exactly what a Render cold start looks
        // like) is a connectivity problem, not proof the session is invalid. Keep the stored id
        // and retry rather than bouncing the user to a full re-login.
      }
    }
    setSessionError(true);
    setReady(true);
  }, []);

  useEffect(() => {
    checkStoredSession();
  }, [checkStoredSession]);

  const login = useCallback(async (id: number) => {
    // Must happen before the userId state update below: App.tsx swaps straight from Login to
    // TransactionsProvider the instant userId becomes non-null, and every fetch that provider
    // fires on mount depends on CURRENT_USER_ID already being correct.
    setCurrentUserId(id);
    await AsyncStorage.setItem(STORAGE_KEY, String(id));
    setSessionError(false);
    setUserId(id);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setSessionError(false);
    setUserId(null);
  }, []);

  const retryAuth = useCallback(async () => {
    setReady(false);
    await checkStoredSession();
  }, [checkStoredSession]);

  const value = useMemo(
    () => ({ ready, userId, sessionError, login, logout, retryAuth }),
    [ready, userId, sessionError, login, logout, retryAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
