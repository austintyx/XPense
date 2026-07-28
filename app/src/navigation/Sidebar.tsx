import { Pressable, StyleSheet, Text, View } from "react-native";

import type { EmailAccount } from "../api/client";
import { colors, radii, typography } from "../theme/tokens";
import { relativeTime } from "../utils/derive";
import { HomeIcon, ROUTE_ICONS } from "./icons";

export const SIDEBAR_WIDTH = 236;

const ROUTES: { name: string; label: string }[] = [
  { name: "Home", label: "Home" },
  { name: "Summary", label: "Summary" },
  { name: "Activity", label: "Activity" },
  { name: "Budgets", label: "Budgets" },
  { name: "Settings", label: "Settings" },
];

interface SidebarProps {
  activeRoute: string;
  onNavigate: (routeName: string) => void;
  reviewCount: number;
  accounts: EmailAccount[];
  onAddExpense: () => void;
}

export function Sidebar({ activeRoute, onNavigate, reviewCount, accounts, onAddExpense }: SidebarProps) {
  return (
    <View style={styles.container} testID="web-sidebar">
      <Text style={styles.wordmark}>XPense</Text>

      <View style={styles.nav}>
        {ROUTES.map((route) => {
          const isActive = activeRoute === route.name;
          const Icon = ROUTE_ICONS[route.name] ?? HomeIcon;
          const color = isActive ? colors.ink : colors.ink38;
          const badge = route.name === "Activity" && reviewCount > 0 ? String(reviewCount) : null;

          return (
            <Pressable
              key={route.name}
              onPress={() => onNavigate(route.name)}
              style={[styles.row, isActive && styles.rowActive]}
              testID={`sidebar-${route.name}`}
            >
              <Icon color={color} size={20} />
              <Text style={[styles.label, { color }]}>{route.label}</Text>
              {badge && (
                <Text style={styles.badge} testID="sidebar-activity-badge">
                  {badge}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.feedsCard}>
        <Text style={styles.feedsLabel}>Feeds</Text>
        <View style={{ gap: 9 }}>
          {accounts.length === 0 ? (
            <Text style={styles.feedsEmpty}>No accounts linked</Text>
          ) : (
            accounts.map((account) => (
              <View key={account.id} style={styles.feedRow}>
                <View style={styles.feedDot} />
                <Text style={styles.feedName} numberOfLines={1}>
                  {account.provider_email}
                </Text>
                <Text style={styles.feedAgo}>
                  {account.last_synced_at ? relativeTime(account.last_synced_at) : "—"}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>

      <Pressable style={styles.addButton} onPress={onAddExpense} testID="sidebar-add-expense">
        <Text style={styles.addButtonText}>Add transaction</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.ink06,
    paddingTop: 26,
    paddingHorizontal: 18,
    paddingBottom: 22,
    gap: 26,
  },
  wordmark: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.titleLg,
    color: colors.ink,
    paddingHorizontal: 10,
  },
  nav: { gap: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radii.chip,
  },
  rowActive: { backgroundColor: colors.surface },
  label: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.md },
  badge: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs,
    color: colors.ink42,
    backgroundColor: colors.ink06,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  feedsCard: {
    borderWidth: 1,
    borderColor: colors.ink06,
    backgroundColor: colors.surfaceSheet,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  feedsLabel: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.ink45,
  },
  feedsEmpty: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink45 },
  feedRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  feedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  feedName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink70 },
  feedAgo: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink38 },
  addButton: { backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  addButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.onDark },
});
