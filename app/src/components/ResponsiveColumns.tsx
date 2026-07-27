import type { ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";

const WIDE_WEB_THRESHOLD = 900;

interface ResponsiveColumnsProps {
  left: ReactNode;
  right: ReactNode;
  rightWidth?: number;
  testID?: string;
}

// Native always renders the stacked (mobile) layout -- Platform.OS is never "web" there, so this
// falls through to the same single-column structure every screen already had before web existed.
export function ResponsiveColumns({ left, right, rightWidth = 320, testID }: ResponsiveColumnsProps) {
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === "web" && width >= WIDE_WEB_THRESHOLD;

  if (!isWideWeb) {
    return (
      <View testID={testID}>
        {left}
        {right}
      </View>
    );
  }

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.left}>{left}</View>
      <View style={{ width: rightWidth }}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 24, alignItems: "flex-start" },
  left: { flex: 1 },
});
