import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { AddTransactionSheet } from "./AddTransactionSheet";
import { CategorizeSheet } from "./CategorizeSheet";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, colors, radii, shadow, spacing, typography, type CategoryId } from "../theme/tokens";
import { deriveSource, formatMoney, groupByDay, uncategorized } from "../utils/derive";
import type { Transaction } from "../api/client";

type Filter = "all" | "needs";

export default function Activity() {
  const navigation = useNavigation<any>();
  const { transactions, loading, refetch } = useAppData();
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [addVisible, setAddVisible] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const uncat = useMemo(() => uncategorized(transactions), [transactions]);
  const visible = filter === "needs" ? uncat : transactions;
  const groups = useMemo(() => groupByDay(visible), [visible]);

  if (loading) {
    return <View style={styles.container} testID="activity-screen" />;
  }

  return (
    <View style={styles.container} testID="activity-screen">
      <FlatList
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data={groups}
        keyExtractor={(g) => g.label}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Transactions</Text>
              <Pressable style={styles.addButton} onPress={() => setAddVisible(true)} testID="add-transaction-button">
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            </View>
            <View style={styles.filterRow}>
              <Pressable
                onPress={() => setFilter("all")}
                style={[styles.pill, filter === "all" ? styles.pillActive : styles.pillInactive]}
                testID="filter-all"
              >
                <Text style={[styles.pillText, filter === "all" && styles.pillTextActive]}>All</Text>
              </Pressable>
              <Pressable
                onPress={() => setFilter("needs")}
                style={[styles.pill, filter === "needs" ? styles.pillActive : styles.pillInactive]}
                testID="filter-needs"
              >
                <Text style={[styles.pillText, filter === "needs" && styles.pillTextActive]}>Needs a category</Text>
                <View style={styles.pillBadge} testID="needs-count-badge">
                  <Text style={styles.pillBadgeText}>{uncat.length}</Text>
                </View>
              </Pressable>
            </View>

            {filter === "needs" && uncat.length > 0 && (
              <Pressable
                style={styles.qsBanner}
                onPress={() => navigation.navigate("QuickSort")}
                testID="quick-sort-banner"
              >
                <View style={styles.qsBadge}>
                  <Text style={styles.qsBadgeText}>{uncat.length}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.qsTitle}>Quick sort</Text>
                  <Text style={styles.qsSub}>Clear them all in one pass</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}

            {visible.length === 0 && (
              <View style={[styles.emptyCard, shadow.card]}>
                <View style={styles.emptyCircle} />
                <Text style={styles.emptyTitle}>All caught up</Text>
                <Text style={styles.emptyBody}>
                  Every transaction has a category. Your summary is accurate to the cent.
                </Text>
              </View>
            )}
          </>
        }
        renderItem={({ item: group }) => (
          <View style={styles.group}>
            <View style={styles.groupHeaderRow}>
              <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
              <Text style={styles.groupTotal}>{formatMoney(group.total)}</Text>
            </View>
            <View style={[styles.groupBody, shadow.card]}>
              {group.items.map((txn, i) => {
                const categorized = !!txn.category;
                return (
                  <Pressable
                    key={txn.id}
                    onPress={() => setSelected(txn)}
                    testID={`transaction-${txn.id}`}
                    style={[
                      styles.row,
                      i < group.items.length - 1 && styles.rowBorder,
                      !categorized && styles.rowUncategorized,
                    ]}
                  >
                    {categorized ? (
                      <View style={[styles.dot, { backgroundColor: categoryColor(txn.category as CategoryId) }]} />
                    ) : (
                      <View style={styles.dotDashed} />
                    )}
                    <View style={styles.merchantCol}>
                      <Text style={styles.merchant} numberOfLines={2}>
                        {txn.merchant_clean ?? txn.merchant_raw ?? "Unknown"}
                      </Text>
                      <Text style={categorized ? styles.subLabel : styles.subLabelWarn}>
                        {categorized
                          ? `${txn.category}${txn.subcategory ? " · " + txn.subcategory : ""}`
                          : "Tap to categorise"}
                      </Text>
                    </View>
                    <View style={styles.amountCol}>
                      <Text style={styles.amount}>{formatMoney(txn.amount)}</Text>
                      <Text style={styles.source}>{deriveSource(txn)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />

      <CategorizeSheet transaction={selected} onClose={() => setSelected(null)} />
      <AddTransactionSheet visible={addVisible} onClose={() => setAddVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.screenTop, paddingBottom: spacing.screenBottom },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, color: colors.ink },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  addButtonText: { color: colors.onDark, fontSize: 22, fontWeight: "300", marginTop: -2 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: spacing.xl },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
  },
  pillActive: { backgroundColor: colors.ink },
  pillInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink14 },
  pillText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
  pillTextActive: { color: colors.canvas },
  pillBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: colors.warnSolid, alignItems: "center", justifyContent: "center" },
  pillBadgeText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.xs, color: colors.surface },
  qsBanner: {
    marginBottom: spacing.xl,
    backgroundColor: colors.warnBg,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    borderRadius: radii.card - 2,
    padding: 15,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  qsBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.warnSolid, alignItems: "center", justifyContent: "center" },
  qsBadgeText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.surface },
  qsTitle: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.base5 },
  qsSub: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink52, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.ink40 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radii.hero, paddingVertical: 44, paddingHorizontal: 26, alignItems: "center" },
  emptyCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.successEmptyCircle, marginBottom: 16 },
  emptyTitle: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayLg, marginBottom: 8, color: colors.ink },
  emptyBody: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink52, textAlign: "center" },
  group: { marginBottom: 20 },
  groupHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
  groupLabel: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.sm, letterSpacing: 1, color: colors.ink42 },
  groupTotal: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.sm, color: colors.ink35 },
  groupBody: { backgroundColor: colors.surface, borderRadius: radii.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.ink06 },
  rowUncategorized: { backgroundColor: colors.warnRowBg },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotDashed: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.warnSolid, borderStyle: "dashed" },
  merchantCol: { flex: 1, flexShrink: 1, minWidth: 0 },
  merchant: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md5, color: colors.ink, flexShrink: 1 },
  subLabel: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink50, marginTop: 3 },
  subLabelWarn: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm5, color: colors.warnText, marginTop: 3 },
  amountCol: { alignItems: "flex-end", flexShrink: 0, marginLeft: 8 },
  amount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md5, color: colors.ink },
  source: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink35, marginTop: 3 },
});
