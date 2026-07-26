import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, typography } from "../theme/tokens";

export type ChipSize = "default" | "small";

interface CategoryChipProps {
  label: string;
  active?: boolean;
  activeColor?: string;
  leftBorderColor?: string;
  size?: ChipSize;
  onPress: () => void;
  testID?: string;
}

export function CategoryChip({
  label,
  active = false,
  activeColor,
  leftBorderColor,
  size = "default",
  onPress,
  testID,
}: CategoryChipProps) {
  const small = size === "small";
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={[
        styles.chip,
        small && styles.chipSmall,
        {
          backgroundColor: active ? activeColor ?? colors.ink : colors.surface,
          borderColor: active ? "transparent" : colors.ink14,
        },
        leftBorderColor && { borderLeftWidth: 4, borderLeftColor: leftBorderColor },
      ]}
    >
      <Text style={[styles.text, small && styles.textSmall, { color: active ? colors.onDark : colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: radii.chip,
    borderWidth: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSmall: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 10,
  },
  text: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.md,
  },
  textSmall: {
    fontSize: typography.size.base,
  },
});
