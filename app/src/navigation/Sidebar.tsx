import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../theme/tokens";
import { HomeIcon, ROUTE_ICONS } from "./icons";

export const SIDEBAR_WIDTH = 240;

const ROUTES: { name: string; label: string }[] = [
  { name: "Home", label: "Home" },
  { name: "Summary", label: "Summary" },
  { name: "Activity", label: "Activity" },
  { name: "Settings", label: "Settings" },
];

interface SidebarProps {
  activeRoute: string;
  onNavigate: (routeName: string) => void;
}

export function Sidebar({ activeRoute, onNavigate }: SidebarProps) {
  return (
    <View style={styles.container} testID="web-sidebar">
      <Text style={styles.wordmark}>XPense</Text>
      <View style={styles.nav}>
        {ROUTES.map((route) => {
          const isActive = activeRoute === route.name;
          const Icon = ROUTE_ICONS[route.name] ?? HomeIcon;
          const color = isActive ? colors.ink : colors.ink38;

          return (
            <Pressable
              key={route.name}
              onPress={() => onNavigate(route.name)}
              style={[styles.row, isActive && styles.rowActive]}
              testID={`sidebar-${route.name}`}
            >
              <Icon color={color} size={20} />
              <Text style={[styles.label, { color }]}>{route.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.ink08,
    paddingHorizontal: 18,
    paddingTop: 40,
    backgroundColor: colors.surface,
  },
  wordmark: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.title,
    color: colors.ink,
    marginBottom: 32,
    paddingHorizontal: 10,
  },
  nav: { gap: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  rowActive: { backgroundColor: colors.ink07 },
  label: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md5 },
});
