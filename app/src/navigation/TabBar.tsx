import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, typography } from "../theme/tokens";
import { HomeIcon, ROUTE_ICONS } from "./icons";

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(22, insets.bottom);

  return (
    <View style={[styles.container, { height: 62 + bottomPadding, paddingBottom: bottomPadding }]}>
      <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel !== undefined ? String(options.tabBarLabel) : route.name;
        const isFocused = state.index === index;
        const Icon = ROUTE_ICONS[route.name] ?? HomeIcon;
        const color = isFocused ? colors.ink : colors.ink38;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.tab} testID={`tab-${route.name}`}>
            <Icon color={color} />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.ink08,
    zIndex: 40,
  },
  tint: {
    backgroundColor: "rgba(246,244,239,0.72)",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    gap: 4,
  },
  label: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.xs,
  },
});
