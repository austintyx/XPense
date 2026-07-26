import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";

import { colors, radii, spacing, typography } from "../theme/tokens";

const AUTO_DISMISS_MS = 2200;

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback(
    (next: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(next);
      scale.setValue(0.94);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      timerRef.current = setTimeout(() => setMessage(null), AUTO_DISMISS_MS);
    },
    [opacity, scale],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message !== null && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity, transform: [{ scale }] }]}
          testID="toast"
        >
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.xxl,
    right: spacing.xxl,
    bottom: 104,
    zIndex: 95,
    backgroundColor: colors.ink,
    borderRadius: radii.card - 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  text: {
    color: colors.onDark,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.base5,
    textAlign: "center",
  },
});
