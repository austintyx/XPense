import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Donut } from "../components/Donut";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, categoryColorBar, colors, radii, shadow, spacing, typography, type CategoryId } from "../theme/tokens";
import { oklchToHex } from "../theme/oklch";
import {
  calendarDailyTotals,
  calendarWeekTransactions,
  calendarWeeks,
  categoryTotals,
  categoryTransactions,
  currentMonthTransactions,
  dayLabel,
  endOfWeek,
  firstWeekdayOfMonth,
  formatMoney,
  isExpense,
  isSameMonth,
  startOfWeek,
  subcategoryTotals,
  yearRangeTransactions,
} from "../utils/derive";

type SumPeriod = "week" | "month" | "year";
type SumView = "chart" | "calendar";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Summary() {
  const { transactions, summary, loading, refetch } = useAppData();
  const [sumPeriod, setSumPeriod] = useState<SumPeriod>("month");
  const [sumView, setSumView] = useState<SumView>("chart");
  const [openCat, setOpenCat] = useState<CategoryId | null>(null);
  const now = useMemo(() => new Date(), []);
  const [viewAnchor, setViewAnchor] = useState<Date>(now);
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(now);
  const [selectedDay, setSelectedDay] = useState<number>(now.getDate());
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const selectSumPeriod = (p: SumPeriod) => {
    setSumPeriod(p);
    setViewAnchor(new Date());
  };

  const pageViewAnchor = (direction: 1 | -1) => {
    setViewAnchor((prev) => {
      const next = new Date(prev);
      if (sumPeriod === "week") next.setDate(next.getDate() + direction * 7);
      else if (sumPeriod === "year") next.setFullYear(next.getFullYear() + direction);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const pageCalendarAnchor = (direction: 1 | -1) => {
    setCalendarAnchor((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
    setSelectedDay(1);
  };

  const periodTransactions = useMemo(() => {
    if (sumPeriod === "week") return calendarWeekTransactions(transactions, viewAnchor);
    if (sumPeriod === "year") return yearRangeTransactions(transactions, viewAnchor);
    return currentMonthTransactions(transactions, viewAnchor);
  }, [transactions, sumPeriod, viewAnchor]);

  const totals = useMemo(() => categoryTotals(periodTransactions), [periodTransactions]);
  const isCurrentRealMonth = sumPeriod === "month" && isSameMonth(viewAnchor, now);
  const grand =
    isCurrentRealMonth && summary ? Number(summary.total) : Object.values(totals).reduce((a, b) => a + b, 0);
  const sortedCats = useMemo(
    () => Object.entries(totals).sort((a, b) => b[1] - a[1]) as [CategoryId, number][],
    [totals],
  );

  const periodLabel = useMemo(() => {
    if (sumPeriod === "year") return String(viewAnchor.getFullYear());
    if (sumPeriod === "week") {
      const start = startOfWeek(viewAnchor);
      const end = endOfWeek(viewAnchor);
      const startStr = start.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      const endStr = end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      return `${startStr} – ${endStr}`;
    }
    return viewAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [sumPeriod, viewAnchor]);

  const calendarMonthName = calendarAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const dailyAmounts = useMemo(
    () => calendarDailyTotals(transactions, calendarAnchor.getFullYear(), calendarAnchor.getMonth()),
    [transactions, calendarAnchor],
  );
  const maxDay = Math.max(1, ...dailyAmounts);
  const leadingBlanks = firstWeekdayOfMonth(calendarAnchor.getFullYear(), calendarAnchor.getMonth());
  const weeks = useMemo(() => calendarWeeks(leadingBlanks, dailyAmounts), [leadingBlanks, dailyAmounts]);
  const dayAmt = dailyAmounts[selectedDay - 1] ?? 0;
  const dayItems = useMemo(
    () =>
      transactions.filter((t) => {
        if (!isExpense(t)) return false;
        const d = new Date(t.txn_at);
        return (
          d.getFullYear() === calendarAnchor.getFullYear() &&
          d.getMonth() === calendarAnchor.getMonth() &&
          d.getDate() === selectedDay
        );
      }),
    [transactions, calendarAnchor, selectedDay],
  );

  if (loading) {
    return <View style={styles.container} testID="summary-screen" />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      testID="summary-screen"
    >
      <Text style={styles.title}>Summary</Text>
      <View style={styles.pillsRow}>
        {(["week", "month", "year"] as SumPeriod[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => selectSumPeriod(p)}
            style={[styles.pill, sumPeriod === p ? styles.pillActive : styles.pillInactive]}
            testID={`sum-period-${p}`}
          >
            <Text style={[styles.pillText, sumPeriod === p && styles.pillTextActive]}>
              {p[0]!.toUpperCase() + p.slice(1)}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setSumView(sumView === "chart" ? "calendar" : "chart")}
          style={styles.toggleButton}
          testID="toggle-view"
        >
          <Text style={styles.toggleButtonText}>{sumView === "chart" ? "Calendar view" : "Chart view"}</Text>
        </Pressable>
      </View>

      {sumView === "chart" ? (
        <>
          <View style={styles.navRow}>
            <Pressable onPress={() => pageViewAnchor(-1)} style={styles.navChevron} testID="chart-prev">
              <Text style={styles.navChevronText}>‹</Text>
            </Pressable>
            <Text style={styles.navLabel}>{periodLabel}</Text>
            <Pressable onPress={() => pageViewAnchor(1)} style={styles.navChevron} testID="chart-next">
              <Text style={styles.navChevronText}>›</Text>
            </Pressable>
          </View>
          <View style={[styles.card, styles.donutCard, shadow.card]}>
            <View style={styles.donutWrap}>
              <Donut
                segments={sortedCats.map(([cat, total]) => ({ id: cat, value: total, color: categoryColor(cat) }))}
                selectedId={openCat}
                onSelect={(id) => setOpenCat(openCat === id ? null : (id as CategoryId))}
              />
              <View style={styles.donutCenter} pointerEvents="none">
                <Text style={styles.donutEyebrow}>{periodLabel.toUpperCase()}</Text>
                <Text style={styles.donutAmount}>{formatMoney(grand, false)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.catRows}>
            {sortedCats.map(([cat, total]) => {
              const expanded = openCat === cat;
              const subs =
                cat === "Food" || cat === "Transport" ? subcategoryTotals(periodTransactions, cat) : [];
              const maxSub = Math.max(1, ...subs.map(([, v]) => v));
              const catTxns = expanded ? categoryTransactions(periodTransactions, cat) : [];
              return (
                <View key={cat} style={[styles.catRowCard, shadow.card]}>
                  <Pressable
                    style={styles.catRowHeader}
                    onPress={() => setOpenCat(expanded ? null : cat)}
                    testID={`cat-row-${cat}`}
                  >
                    <View style={[styles.dot, { backgroundColor: categoryColor(cat) }]} />
                    <Text style={styles.catName}>{cat}</Text>
                    <Text style={styles.catPct}>{Math.round((total / grand) * 100)}%</Text>
                    <Text style={styles.catAmount}>{formatMoney(total)}</Text>
                    <Text style={styles.chevron}>{expanded ? "⌃" : "⌄"}</Text>
                  </Pressable>
                  {expanded && subs.length > 0 && (
                    <View style={styles.subList}>
                      {subs.map(([name, value]) => (
                        <View key={name} style={styles.subRow}>
                          <Text style={styles.subName}>{name}</Text>
                          <View style={styles.subBarTrack}>
                            <View
                              style={[
                                styles.subBar,
                                { width: `${(value / maxSub) * 100}%`, backgroundColor: categoryColorBar(cat) },
                              ]}
                            />
                          </View>
                          <Text style={styles.subAmount}>{formatMoney(value)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {expanded && (
                    <View style={styles.catTxList} testID={`cat-tx-list-${cat}`}>
                      {catTxns.map((t) => (
                        <View key={t.id} style={styles.catTxRow}>
                          <View style={[styles.catTxDot, { backgroundColor: categoryColor(cat) }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.catTxName} numberOfLines={1}>
                              {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                            </Text>
                            <Text style={styles.catTxMeta}>{dayLabel(t.txn_at, now)}</Text>
                          </View>
                          <Text style={styles.catTxAmount}>{formatMoney(t.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <View style={[styles.card, styles.calendarCard, shadow.card]}>
            <View style={styles.calendarHeaderRow}>
              <View style={styles.calNavGroup}>
                <Pressable onPress={() => pageCalendarAnchor(-1)} style={styles.navChevron} testID="cal-prev">
                  <Text style={styles.navChevronText}>‹</Text>
                </Pressable>
                <Text style={styles.calTitle}>{calendarMonthName}</Text>
                <Pressable onPress={() => pageCalendarAnchor(1)} style={styles.navChevron} testID="cal-next">
                  <Text style={styles.navChevronText}>›</Text>
                </Pressable>
              </View>
              <Text style={styles.calCaption}>darker = more spent</Text>
            </View>
            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((w, i) => (
                <Text key={i} style={styles.weekdayLabel}>
                  {w}
                </Text>
              ))}
            </View>
            <View style={styles.calGrid}>
              {weeks.map((week, weekIdx) => (
                <View key={weekIdx} style={styles.calWeekRow}>
                  {week.map((day, dayIdx) => {
                    if (day === -1) {
                      return <View key={dayIdx} style={styles.calCell} />;
                    }
                    const amt = dailyAmounts[day - 1] ?? 0;
                    const k = amt / maxDay;
                    const selected = selectedDay === day;
                    const bg = amt > 0 ? oklchToHex(0.95 - k * 0.3, 0.02 + k * 0.07, 158) : colors.ink04;
                    const textColor = k > 0.62 ? colors.onDark : colors.ink70;
                    return (
                      <Pressable
                        key={dayIdx}
                        onPress={() => setSelectedDay(day)}
                        style={[styles.calCell, { backgroundColor: bg }, selected && styles.calCellSelected]}
                        testID={`cal-day-${day}`}
                      >
                        <Text style={[styles.calCellText, { color: textColor }]}>{day}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, styles.dayDetailCard, shadow.card]}>
            <View style={styles.dayDetailHeader}>
              <Text style={styles.dayTitle}>
                {dayAmt
                  ? `${selectedDay} ${calendarMonthName}`
                  : `${selectedDay} ${calendarMonthName} — nothing spent`}
              </Text>
              <Text style={styles.dayTotal} testID="day-total">{formatMoney(dayAmt)}</Text>
            </View>
            <View style={{ gap: 9 }}>
              {dayItems.map((t) => (
                <View key={t.id} style={styles.dayItemRow}>
                  <View
                    style={[
                      styles.smallDot,
                      { backgroundColor: t.category ? categoryColor(t.category as CategoryId) : colors.ink38 },
                    ]}
                  />
                  <Text style={styles.dayItemName} numberOfLines={1}>
                    {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                  </Text>
                  <Text style={styles.dayItemAmount}>{formatMoney(t.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.screenTop, paddingBottom: spacing.screenBottom },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, marginBottom: 18, color: colors.ink },
  pillsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill },
  pillActive: { backgroundColor: colors.ink },
  pillInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink14 },
  pillText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
  pillTextActive: { color: colors.canvas },
  toggleButton: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.ink14, backgroundColor: colors.surface },
  toggleButtonText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 },
  navChevron: { paddingHorizontal: 6, paddingVertical: 4 },
  navChevronText: { fontSize: 20, color: colors.ink, lineHeight: 22 },
  navLabel: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.ink, minWidth: 150, textAlign: "center" },
  calNavGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radii.hero },
  donutCard: { paddingVertical: 24, paddingHorizontal: 22, alignItems: "center" },
  donutWrap: { width: 196, height: 196, alignItems: "center", justifyContent: "center" },
  donutCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  donutEyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1, color: colors.ink42, marginBottom: 7 },
  donutAmount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberSm, color: colors.ink },
  catRows: { marginTop: 14, gap: 8 },
  catRowCard: { backgroundColor: colors.surface, borderRadius: radii.card, padding: 14, paddingHorizontal: 16 },
  catRowHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  catName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.md5, color: colors.ink },
  catPct: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink42 },
  catAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md5, minWidth: 74, textAlign: "right", color: colors.ink },
  chevron: { fontSize: 15, color: colors.ink35, marginLeft: 4 },
  subList: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.ink07, gap: 9 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 26 },
  subName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink70 },
  subBarTrack: { width: 84, height: 4, borderRadius: 2, backgroundColor: colors.ink06, overflow: "hidden" },
  subBar: { height: 4, borderRadius: 2 },
  subAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, minWidth: 64, textAlign: "right", color: colors.ink70 },
  catTxList: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.ink07, gap: 10 },
  catTxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  catTxDot: { width: 8, height: 8, borderRadius: 4 },
  catTxName: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink },
  catTxMeta: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink42, marginTop: 2 },
  catTxAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink },
  calendarCard: { padding: 20, paddingHorizontal: 18 },
  calendarHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 },
  calTitle: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.ink },
  calCaption: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink42 },
  weekdayRow: { flexDirection: "row", marginBottom: 8 },
  weekdayLabel: { flex: 1, textAlign: "center", fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink35 },
  calGrid: { gap: 5 },
  calWeekRow: { flexDirection: "row", gap: 5 },
  calCell: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  calCellSelected: { borderWidth: 2, borderColor: colors.ink },
  calCellText: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.base },
  dayDetailCard: { marginTop: 14, padding: 18 },
  dayDetailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  dayTitle: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink },
  dayTotal: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayMd, color: colors.ink },
  dayItemRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  dayItemName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink70 },
  dayItemAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink },
});
