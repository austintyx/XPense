import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { colors } from "../theme/tokens";

interface ProgressBarProps {
  pct: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  testID?: string;
}

export function ProgressBar({ pct, height = 9, trackColor = colors.track, fillColor = colors.success, testID }: ProgressBarProps) {
  const width = useRef(new Animated.Value(0)).current;
  const clamped = Math.min(100, Math.max(0, pct));

  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: 450,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [clamped, width]);

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}
      testID={testID}
    >
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: fillColor,
          width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: "hidden",
  },
});
