import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { ProgressBar } from "../components/ProgressBar";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, colors, radii, shadow, spacing, typography, type CategoryId } from "../theme/tokens";
import {
  currentMonthTransactions,
  formatMoney,
  initialsOf,
  todayRangeTransactions,
  todaySpend,
  topCategories,
  uncategorized,
  weekRangeTransactions,
  weekSpend,
} from "../utils/derive";

type Period = "today" | "week" | "month";

const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 37;

function firstNameOf(name: string | null): string {
  if (!name) return "there";
  const parts = name.split(" ").filter(Boolean);
  return parts.slice(0, -1).join(" ") || name;
}

export default function Home() {
  const navigation = useNavigation<any>();
  const { transactions, summary, budget, goal, user, loading, refetch } = useAppData();
  const [period, setPeriod] = useState<Period>("month");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const uncat = useMemo(() => uncategorized(transactions), [transactions]);
  const periodTransactions = useMemo(() => {
    if (period === "today") return todayRangeTransactions(transactions);
    if (period === "week") return weekRangeTransactions(transactions);
    return currentMonthTransactions(transactions);
  }, [transactions, period]);
  // "Where it went" always reflects the current month regardless of the Today/Week/Month toggle
  // above (which only controls the hero "Spent this X" card) -- so it doesn't need `period`.
  const monthTransactions = useMemo(() => currentMonthTransactions(transactions), [transactions]);
  const top4 = useMemo(() => topCategories(monthTransactions, 4), [monthTransactions]);
  const maxTop = top4[0]?.total ?? 1;

  const todayLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  if (loading || !budget || !goal) {
    return <View style={[styles.container, styles.center]} testID="home-screen" />;
  }

  const periodData = (() => {
    if (period === "today") {
      return {
        label: "Spent today",
        amount: todaySpend(transactions),
        target: Number(budget.daily_target),
        budgetLabel: `${formatMoney(budget.daily_target, false)} daily`,
      };
    }
    if (period === "week") {
      return {
        label: "Spent this week",
        amount: weekSpend(transactions),
        target: Number(budget.weekly_target),
        budgetLabel: `${formatMoney(budget.weekly_target, false)} weekly`,
      };
    }
    return {
      label: "Spent this month",
      amount: Number(summary?.total ?? 0),
      target: Number(budget.monthly_target),
      budgetLabel: `${formatMoney(budget.monthly_target, false)} monthly`,
    };
  })();

  const pct = periodData.target > 0 ? periodData.amount / periodData.target : 0;
  const goalPct = Number(goal.target_amount) > 0 ? Number(goal.saved_amount) / Number(goal.target_amount) : 0;
  const goalPctClamped = Math.min(1, Math.max(0, goalPct));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      testID="home-screen"
    >
      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.eyebrow}>{todayLabel}</Text>
          <Text style={styles.greeting}>
            Good evening,{"\n"}
            {firstNameOf(user?.name ?? null)}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(user?.name ?? null)}</Text>
        </View>
      </View>

      <View style={[styles.card, styles.heroCard, shadow.hero]}>
        <View style={styles.segmented}>
          {(["today", "week", "month"] as Period[]).map((p) => (
            <Text
              key={p}
              onPress={() => setPeriod(p)}
              testID={`period-${p}`}
              style={[styles.segmentItem, period === p && styles.segmentItemActive]}
            >
              {p === "today" ? "Today" : p === "week" ? "Week" : "Month"}
            </Text>
          ))}
        </View>
        <Text style={styles.eyebrow}>{periodData.label.toUpperCase()}</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amount} testID="period-amount">{formatMoney(periodData.amount)}</Text>
          <Text style={styles.amountOf}>of {periodData.budgetLabel}</Text>
        </View>
        <View style={styles.progressWrap}>
          <ProgressBar pct={pct * 100} fillColor={pct > 0.9 ? colors.over : colors.success} testID="budget-progress" />
        </View>
        <View style={styles.footerRow}>
          <Text style={styles.footerLeft}>{Math.round(pct * 100)}% of budget used</Text>
          <Text style={styles.footerRight}>{formatMoney(periodData.target - periodData.amount, false)} left</Text>
        </View>
      </View>

      {uncat.length > 0 && (
        <Pressable
          style={[styles.card, styles.needsCard]}
          onPress={() => navigation.navigate("QuickSort")}
          testID="needs-category-card"
        >
          <View style={styles.needsBadge}>
            <Text style={styles.needsBadgeText}>{uncat.length}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.needsTitle}>Need a category</Text>
            <Text style={styles.needsSub}>Quick sort them — one card at a time.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <View style={[styles.card, styles.goalCard]}>
        <View style={styles.goalRingWrap}>
          <Svg width={88} height={88} viewBox="0 0 88 88">
            <Circle cx={44} cy={44} r={37} fill="none" stroke={colors.onDark15} strokeWidth={9} />
            <Circle
              cx={44}
              cy={44}
              r={37}
              fill="none"
              stroke={colors.successRing}
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${goalPctClamped * GOAL_RING_CIRCUMFERENCE} ${GOAL_RING_CIRCUMFERENCE}`}
              transform="rotate(-90 44 44)"
            />
          </Svg>
          <View style={styles.goalRingLabel}>
            <Text style={styles.goalRingText}>{Math.round(goalPctClamped * 100)}%</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.goalEyebrow}>SAVINGS GOAL</Text>
          <Text style={styles.goalName}>{goal.name}</Text>
          <Text style={styles.goalMeta}>
            {formatMoney(goal.saved_amount, false)} of {formatMoney(goal.target_amount, false)} · on track
          </Text>
        </View>
      </View>

      <Text style={[styles.eyebrow, styles.whereItWent]}>WHERE IT WENT</Text>
      <View style={styles.topCatsList}>
        {top4.map((c) => (
          <View key={c.category} style={styles.topCatRow}>
            <View style={[styles.dot, { backgroundColor: categoryColor(c.category as CategoryId) }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.topCatLine}>
                <Text style={styles.topCatName}>{c.category}</Text>
                <Text style={styles.topCatAmount}>{formatMoney(c.total)}</Text>
              </View>
              <View style={styles.topCatTrack}>
                <View
                  style={[
                    styles.topCatBar,
                    { width: `${(c.total / maxTop) * 100}%`, backgroundColor: categoryColor(c.category as CategoryId) },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.screenTop, paddingBottom: spacing.screenBottom },
  greetingRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.xxl },
  eyebrow: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.sm,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 9,
  },
  greeting: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.titleLg, lineHeight: 31, color: colors.ink },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.successAvatarBg,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.successAvatarText },
  card: { backgroundColor: colors.surface, borderRadius: radii.hero, ...shadow.card },
  heroCard: { padding: 22, paddingBottom: 20 },
  segmented: { flexDirection: "row", backgroundColor: colors.ink07, borderRadius: 11, padding: 3, marginBottom: 20 },
  segmentItem: {
    flex: 1,
    textAlign: "center",
    paddingVertical: 8,
    borderRadius: radii.pill,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.base,
    color: colors.ink55,
    overflow: "hidden",
  },
  segmentItemActive: {
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: typography.fontFamily.sansMedium,
  },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  amount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberXxl, color: colors.ink },
  amountOf: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink45 },
  progressWrap: { marginTop: 18, marginBottom: 12 },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  footerLeft: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55 },
  footerRight: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.base, color: colors.successText },
  needsCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.warnBg,
    borderWidth: 1,
    borderColor: colors.warnBorder,
    borderRadius: radii.card,
    padding: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  needsBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.warnSolid, alignItems: "center", justifyContent: "center" },
  needsBadgeText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.surface },
  needsTitle: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md },
  needsSub: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink52, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.ink40 },
  goalCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.ink,
    borderRadius: radii.hero,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  goalRingWrap: { width: 88, height: 88 },
  goalRingLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  goalRingText: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayLg, color: colors.onDark },
  goalEyebrow: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.sm,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.onDark50,
    marginBottom: 8,
  },
  goalName: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayMd, color: colors.onDark, marginBottom: 6 },
  goalMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.onDark60 },
  whereItWent: { marginTop: spacing.xxl, marginBottom: 0 },
  topCatsList: { marginTop: spacing.lg, gap: 12 },
  topCatRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  topCatLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  topCatName: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink },
  topCatAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink70 },
  topCatTrack: { height: 5, borderRadius: 3, backgroundColor: colors.ink06, overflow: "hidden" },
  topCatBar: { height: 5, borderRadius: 3 },
});
