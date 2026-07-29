import { StyleSheet, Text, TextInput, View } from "react-native";

import { useIsMobileWeb } from "../hooks/useIsMobileWeb";
import { useAppData } from "../store/TransactionsProvider";
import { useSearch } from "../store/SearchProvider";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { initialsOf } from "../utils/derive";

function firstNameOf(name: string | null): string {
  if (!name) return "there";
  const parts = name.split(" ").filter(Boolean);
  return parts.slice(0, -1).join(" ") || name;
}

const TITLES: Record<string, string> = {
  Summary: "Summary",
  Activity: "Activity",
  Budgets: "Budgets & goals",
  Settings: "Settings",
};

interface PageHeaderProps {
  activeRoute: string;
}

export function PageHeader({ activeRoute }: PageHeaderProps) {
  const { user } = useAppData();
  const { search, setSearch } = useSearch();
  const isMobile = useIsMobileWeb();

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
  const title =
    activeRoute === "Home" ? `Good evening, ${firstNameOf(user?.name ?? null)}` : (TITLES[activeRoute] ?? activeRoute);

  const searchBox = activeRoute === "Activity" && (
    <View style={[styles.searchBox, isMobile && styles.searchBoxMobile]}>
      <View style={styles.searchDot} />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search merchants"
        style={styles.searchInput}
        testID="header-search"
      />
    </View>
  );

  // On mobile the search box doesn't fit alongside the title+avatar row (its desktop width is a
  // fixed 230px) -- it moves to its own full-width row below instead of being dropped, so search
  // stays reachable on narrow viewports.
  if (isMobile) {
    return (
      <View style={[styles.container, styles.containerMobile]} testID="page-header">
        <View style={styles.topRowMobile}>
          <View>
            <Text style={styles.date}>{dateLabel}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(user?.name ?? null)}</Text>
          </View>
        </View>
        {searchBox}
      </View>
    );
  }

  return (
    <View style={styles.container} testID="page-header">
      <View>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.right}>
        {searchBox}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(user?.name ?? null)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
    paddingTop: 30,
    paddingHorizontal: 34,
    paddingBottom: 20,
  },
  containerMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 14,
    paddingTop: 20,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 16,
  },
  topRowMobile: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  date: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1.4,
    color: colors.ink45,
    marginBottom: 10,
  },
  title: { fontFamily: typography.fontFamily.serif, fontSize: 34, color: colors.ink, lineHeight: 38 },
  right: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink06,
    borderRadius: radii.chip,
    paddingHorizontal: 13,
    paddingVertical: 9,
    width: 230,
  },
  searchBoxMobile: { width: "100%" },
  searchDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink38 },
  searchInput: {
    flex: 1,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.base5,
    color: colors.ink,
    padding: 0,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.successAvatarBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.base, color: colors.successAvatarText },
});
