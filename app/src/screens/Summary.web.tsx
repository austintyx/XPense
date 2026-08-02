import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Donut } from "../components/Donut";
import { useIsMobileWeb } from "../hooks/useIsMobileWeb";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, categoryColorBar, colors, radii, shadow, spacing, typography, type CategoryId } from "../theme/tokens";
import { oklchToHex } from "../theme/oklch";
import {
  calendarDailyTotals,
  calendarWeekTransactions,
  calendarWeeks,
  categoryTotals,
  categoryTransactions,
  countriesInTransactions,
  effectiveCountry,
  currentMonthTransactions,
  dailyTotalsForRange,
  dayLabel,
  endOfWeek,
  expenseTotal,
  firstWeekdayOfMonth,
  formatMoney,
  groupByDay,
  isExpense,
  isSameLocalDay,
  isSameMonth,
  startOfWeek,
  subcategoryTotals,
  uncategorized,
  UNCATEGORIZED_LABEL,
  yearRangeTransactions,
} from "../utils/derive";
import type { Transaction } from "../api/client";

type SumPeriod = "day" | "week" | "month" | "year";
type SumView = "chart" | "calendar";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const TREND_MONTHS = 6;
const PERIOD_LABELS: Record<SumPeriod, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };

function monthTotal(transactions: Transaction[], year: number, month: number): number {
  return transactions
    .filter((t) => {
      if (!isExpense(t)) return false;
      const d = new Date(t.txn_at);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, t) => sum + Number(t.amount), 0);
}

function dayTransactions(transactions: Transaction[], date: Date): Transaction[] {
  return transactions.filter((t) => isExpense(t) && isSameLocalDay(new Date(t.txn_at), date));
}

export default function Summary() {
  const { transactions, summary, loading } = useAppData();
  const [sumPeriod, setSumPeriod] = useState<SumPeriod>("month");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [sumView, setSumView] = useState<SumView>("chart");
  const [openCat, setOpenCat] = useState<CategoryId | null>(null);
  const now = useMemo(() => new Date(), []);
  const [viewAnchor, setViewAnchor] = useState<Date>(now);
  const isMobile = useIsMobileWeb();
  // Applies a row-only flex ratio -- omitted entirely on mobile so a stacked (column) card takes
  // its own natural full width instead of stretching by a ratio that only makes sense in a row.
  const rowFlex = (n: number) => (isMobile ? undefined : { flex: n });

  // Pill clicks zoom in/out around wherever `viewAnchor` currently is (from drilling or paging)
  // rather than resetting to today -- e.g. drilled into a week in March, clicking "Month" shows
  // March, not the current real-world month.
  const selectSumPeriod = (p: SumPeriod) => setSumPeriod(p);

  const pageViewAnchor = (direction: 1 | -1) => {
    setViewAnchor((prev) => {
      const next = new Date(prev);
      if (sumPeriod === "day") next.setDate(next.getDate() + direction);
      else if (sumPeriod === "week") next.setDate(next.getDate() + direction * 7);
      else if (sumPeriod === "year") next.setFullYear(next.getFullYear() + direction);
      else next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  // Only shown once there's actually more than one country present -- avoids cluttering the UI
  // for a user who's never had a non-SGD transaction. Derived from the full unfiltered set so the
  // pill list itself doesn't shrink once a filter is active.
  const countriesPresent = useMemo(() => countriesInTransactions(transactions), [transactions]);
  const visibleTransactions = useMemo(
    () =>
      countryFilter === "all" ? transactions : transactions.filter((t) => effectiveCountry(t) === countryFilter),
    [transactions, countryFilter],
  );

  const periodTransactions = useMemo(() => {
    if (sumPeriod === "day") return dayTransactions(visibleTransactions, viewAnchor);
    if (sumPeriod === "week") return calendarWeekTransactions(visibleTransactions, viewAnchor);
    if (sumPeriod === "year") return yearRangeTransactions(visibleTransactions, viewAnchor);
    return currentMonthTransactions(visibleTransactions, viewAnchor);
  }, [visibleTransactions, sumPeriod, viewAnchor]);

  const totals = useMemo(() => categoryTotals(periodTransactions), [periodTransactions]);
  const uncategorizedTotal = useMemo(
    () => uncategorized(periodTransactions).reduce((sum, t) => sum + Number(t.amount), 0),
    [periodTransactions],
  );
  const isCurrentRealMonth = sumPeriod === "month" && isSameMonth(viewAnchor, now);
  // The backend's /summary total is never filtered by anything client-side, so this shortcut must
  // only apply when no country filter is active -- otherwise the headline total would silently
  // ignore the filter.
  const grand =
    isCurrentRealMonth && summary && countryFilter === "all" ? Number(summary.total) : expenseTotal(periodTransactions);
  // Uncategorized spend is folded in as its own slice/row (rather than left out) so the chart's
  // wedges and the category rows' percentages actually tally to `grand`.
  const sortedCats = useMemo(() => {
    const entries = Object.entries(totals) as [CategoryId, number][];
    if (uncategorizedTotal > 0) entries.push([UNCATEGORIZED_LABEL as CategoryId, uncategorizedTotal]);
    return entries.sort((a, b) => b[1] - a[1]);
  }, [totals, uncategorizedTotal]);

  const periodLabel = useMemo(() => {
    if (sumPeriod === "day") return viewAnchor.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
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

  const trend = useMemo(() => {
    const months: { label: string; total: number }[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleDateString(undefined, { month: "short" }),
        total: monthTotal(visibleTransactions, d.getFullYear(), d.getMonth()),
      });
    }
    return months;
  }, [visibleTransactions, now]);
  const trendMax = Math.max(1, ...trend.map((m) => m.total));

  const movers = useMemo(() => {
    const thisMonth = categoryTotals(currentMonthTransactions(visibleTransactions, now));
    const prevAnchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = categoryTotals(
      visibleTransactions.filter((t) => {
        if (!isExpense(t)) return false;
        const d = new Date(t.txn_at);
        return d.getFullYear() === prevAnchor.getFullYear() && d.getMonth() === prevAnchor.getMonth();
      }),
    );
    const categories = new Set([...Object.keys(thisMonth), ...Object.keys(lastMonth)]);
    return Array.from(categories)
      .map((cat) => ({ category: cat as CategoryId, delta: (thisMonth[cat] ?? 0) - (lastMonth[cat] ?? 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
  }, [visibleTransactions, now]);

  // Month grid (unchanged shape from before -- weeks of 7 cells, blanks padded).
  const dailyAmounts = useMemo(
    () => calendarDailyTotals(visibleTransactions, viewAnchor.getFullYear(), viewAnchor.getMonth()),
    [visibleTransactions, viewAnchor],
  );
  const maxDay = Math.max(1, ...dailyAmounts);
  const leadingBlanks = firstWeekdayOfMonth(viewAnchor.getFullYear(), viewAnchor.getMonth());
  const weeks = useMemo(() => calendarWeeks(leadingBlanks, dailyAmounts), [leadingBlanks, dailyAmounts]);

  // Week grid: a single row of 7 days for the week containing viewAnchor.
  const weekStart = useMemo(() => startOfWeek(viewAnchor), [viewAnchor]);
  const weekEnd = useMemo(() => endOfWeek(viewAnchor), [viewAnchor]);
  const weekDailyAmounts = useMemo(
    () => dailyTotalsForRange(visibleTransactions, weekStart, weekEnd),
    [visibleTransactions, weekStart, weekEnd],
  );
  const maxWeekDay = Math.max(1, ...weekDailyAmounts);

  // Year grid: 12 month tiles for viewAnchor's year.
  const yearMonths = useMemo(() => {
    const year = viewAnchor.getFullYear();
    return Array.from({ length: 12 }, (_, month) => ({
      month,
      label: new Date(year, month, 1).toLocaleDateString(undefined, { month: "short" }),
      total: monthTotal(visibleTransactions, year, month),
    }));
  }, [visibleTransactions, viewAnchor]);
  const maxYearMonth = Math.max(1, ...yearMonths.map((m) => m.total));

  // Right panel: every transaction in the active period, grouped by day so week/month/year
  // (which can have many rows) still read cleanly -- day period degenerates to one group.
  const periodGroups = useMemo(() => groupByDay(periodTransactions, now), [periodTransactions, now]);

  if (loading) {
    return <View style={styles.container} testID="summary-screen" />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      testID="summary-screen"
    >
      <View style={styles.pillsRow}>
        {(["day", "week", "month", "year"] as SumPeriod[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => selectSumPeriod(p)}
            style={[styles.pill, sumPeriod === p ? styles.pillActive : styles.pillInactive]}
            testID={`sum-period-${p}`}
          >
            <Text style={[styles.pillText, sumPeriod === p && styles.pillTextActive]}>{PERIOD_LABELS[p]}</Text>
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

      {countriesPresent.length > 1 && (
        <View style={styles.pillsRow} testID="country-filter-row">
          <Pressable
            onPress={() => setCountryFilter("all")}
            style={[styles.pill, countryFilter === "all" ? styles.pillActive : styles.pillInactive]}
            testID="sum-country-all"
          >
            <Text style={[styles.pillText, countryFilter === "all" && styles.pillTextActive]}>All countries</Text>
          </Pressable>
          {countriesPresent.map((country) => (
            <Pressable
              key={country}
              onPress={() => setCountryFilter(country)}
              style={[styles.pill, countryFilter === country ? styles.pillActive : styles.pillInactive]}
              testID={`sum-country-${country}`}
            >
              <Text style={[styles.pillText, countryFilter === country && styles.pillTextActive]}>{country}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {sumView === "chart" ? (
        <View style={[styles.row, isMobile && styles.rowStacked]} testID="summary-chart-row">
          <View style={[styles.card, rowFlex(7), shadow.card]}>
            <View style={styles.navRow}>
              <Pressable onPress={() => pageViewAnchor(-1)} style={styles.navChevron} testID="chart-prev">
                <Text style={styles.navChevronText}>‹</Text>
              </Pressable>
              <Text style={styles.navLabel}>{periodLabel}</Text>
              <Pressable onPress={() => pageViewAnchor(1)} style={styles.navChevron} testID="chart-next">
                <Text style={styles.navChevronText}>›</Text>
              </Pressable>
            </View>
            <View style={styles.donutRow}>
              <View style={styles.donutWrap}>
                <Donut
                  segments={sortedCats.map(([cat, total]) => ({ id: cat, value: total, color: categoryColor(cat) }))}
                  size={186}
                  innerRadius={52}
                  outerRadius={82}
                  selectedId={openCat}
                  onSelect={(id) => setOpenCat(openCat === id ? null : (id as CategoryId))}
                />
                <View style={styles.donutCenter} pointerEvents="none">
                  <Text style={styles.donutEyebrow}>TOTAL</Text>
                  <Text style={styles.donutAmount} testID="donut-total">{formatMoney(grand, false)}</Text>
                </View>
              </View>
              <View style={styles.catRows}>
                {sortedCats.map(([cat, total]) => {
                  const expanded = openCat === cat;
                  const subs =
                    cat === "Food" || cat === "Transport" || cat === "Travel"
                      ? subcategoryTotals(periodTransactions, cat)
                      : [];
                  const maxSub = Math.max(1, ...subs.map(([, v]) => v));
                  const catTxns = expanded ? categoryTransactions(periodTransactions, cat) : [];
                  return (
                    <View key={cat}>
                      <Pressable style={styles.catRowHeader} onPress={() => setOpenCat(expanded ? null : cat)} testID={`cat-row-${cat}`}>
                        <View style={[styles.dot, { backgroundColor: categoryColor(cat) }]} />
                        <Text style={styles.catName}>{cat}</Text>
                        <Text style={styles.catPct}>{grand > 0 ? Math.round((total / grand) * 100) : 0}%</Text>
                        <Text style={styles.catAmount}>{formatMoney(total)}</Text>
                      </Pressable>
                      {expanded && subs.length > 0 && (
                        <View style={styles.subList}>
                          {subs.map(([name, value]) => (
                            <View key={name} style={styles.subRow}>
                              <Text style={styles.subName}>{name}</Text>
                              <View style={styles.subBarTrack}>
                                <View style={[styles.subBar, { width: `${(value / maxSub) * 100}%`, backgroundColor: categoryColorBar(cat) }]} />
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
            </View>
          </View>

          <View style={{ ...rowFlex(5), gap: 16 }}>
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.eyebrow}>SIX MONTH TREND</Text>
              <View style={styles.trendRow}>
                {trend.map((m) => (
                  <View key={m.label} style={styles.trendCol}>
                    <Text style={styles.trendAmount}>{formatMoney(m.total, false)}</Text>
                    <View style={[styles.trendBar, { height: `${Math.max(4, (m.total / trendMax) * 100)}%` }]} />
                    <Text style={styles.trendLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.eyebrow}>BIGGEST MOVERS</Text>
              <View style={{ gap: 4, marginTop: 8 }}>
                {movers.length === 0 ? (
                  <Text style={styles.emptyText}>Not enough history yet.</Text>
                ) : (
                  movers.map((m) => (
                    <View key={m.category} style={styles.moverRow}>
                      <View style={[styles.dot, { backgroundColor: categoryColor(m.category) }]} />
                      <Text style={styles.catName}>{m.category}</Text>
                      <Text style={[styles.moverDelta, { color: m.delta <= 0 ? colors.successText : colors.over }]}>
                        {m.delta <= 0 ? "↓" : "↑"} {formatMoney(Math.abs(m.delta), false)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.row, isMobile && styles.rowStacked]} testID="summary-calendar-row">
          <View style={[styles.card, styles.calendarCard, rowFlex(7), shadow.card]}>
            <View style={styles.calendarHeaderRow}>
              <View style={styles.calNavGroup}>
                <Pressable onPress={() => pageViewAnchor(-1)} style={styles.navChevron} testID="cal-prev">
                  <Text style={styles.navChevronText}>‹</Text>
                </Pressable>
                <Text style={styles.calTitle}>{periodLabel}</Text>
                <Pressable onPress={() => pageViewAnchor(1)} style={styles.navChevron} testID="cal-next">
                  <Text style={styles.navChevronText}>›</Text>
                </Pressable>
              </View>
              {sumPeriod !== "day" && <Text style={styles.calCaption}>darker = more spent</Text>}
            </View>

            {sumPeriod === "day" && (
              <View style={styles.dayOnlyNotice}>
                <Text style={styles.dayOnlyText}>Showing every transaction from {periodLabel}.</Text>
              </View>
            )}

            {sumPeriod === "week" && (
              <>
                <View style={styles.weekdayRow}>
                  {WEEKDAY_LABELS.map((w, i) => (
                    <Text key={i} style={styles.weekdayLabel}>
                      {w}
                    </Text>
                  ))}
                </View>
                <View style={styles.calWeekRow}>
                  {weekDailyAmounts.map((amt, i) => {
                    const date = new Date(weekStart);
                    date.setDate(weekStart.getDate() + i);
                    const k = amt / maxWeekDay;
                    const bg = amt > 0 ? oklchToHex(0.95 - k * 0.3, 0.02 + k * 0.07, 158) : colors.ink04;
                    const textColor = k > 0.62 ? colors.onDark : colors.ink70;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => {
                          setSumPeriod("day");
                          setViewAnchor(date);
                        }}
                        style={[styles.calCellTall, { backgroundColor: bg }]}
                        testID={`cal-week-day-${i}`}
                      >
                        <Text style={[styles.calCellText, { color: textColor }]}>{date.getDate()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {sumPeriod === "month" && (
              <>
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
                        if (day === -1) return <View key={dayIdx} style={styles.calCell} />;
                        const amt = dailyAmounts[day - 1] ?? 0;
                        const k = amt / maxDay;
                        const date = new Date(viewAnchor.getFullYear(), viewAnchor.getMonth(), day);
                        const bg = amt > 0 ? oklchToHex(0.95 - k * 0.3, 0.02 + k * 0.07, 158) : colors.ink04;
                        const textColor = k > 0.62 ? colors.onDark : colors.ink70;
                        return (
                          <Pressable
                            key={dayIdx}
                            onPress={() => {
                              // Any day cell drills into the week containing it -- there's no
                              // separate week-row control, the day cell doubles as one.
                              setSumPeriod("week");
                              setViewAnchor(date);
                            }}
                            style={[styles.calCell, { backgroundColor: bg }]}
                            testID={`cal-day-${day}`}
                          >
                            <Text style={[styles.calCellText, { color: textColor }]}>{day}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </>
            )}

            {sumPeriod === "year" && (
              <View style={styles.yearGrid}>
                {yearMonths.map((m) => {
                  const k = m.total / maxYearMonth;
                  const bg = m.total > 0 ? oklchToHex(0.95 - k * 0.3, 0.02 + k * 0.07, 158) : colors.ink04;
                  const textColor = k > 0.62 ? colors.onDark : colors.ink70;
                  return (
                    <Pressable
                      key={m.month}
                      onPress={() => {
                        setSumPeriod("month");
                        setViewAnchor(new Date(viewAnchor.getFullYear(), m.month, 1));
                      }}
                      style={[styles.yearTile, { backgroundColor: bg }]}
                      testID={`cal-month-${m.month}`}
                    >
                      <Text style={[styles.yearTileLabel, { color: textColor }]}>{m.label}</Text>
                      <Text style={[styles.yearTileAmount, { color: textColor }]}>{formatMoney(m.total, false)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.periodTotalRow}>
              <Text style={styles.periodTotalLabel}>Total for {PERIOD_LABELS[sumPeriod].toLowerCase()}</Text>
              <Text style={styles.periodTotalAmount} testID="period-total">{formatMoney(grand)}</Text>
            </View>
          </View>

          <View style={[styles.card, styles.txListCard, rowFlex(5), shadow.card]}>
            <View style={styles.dayDetailHeader}>
              <Text style={styles.eyebrow}>TRANSACTIONS</Text>
              <Text style={styles.dayTotal} testID="period-transactions-total">{formatMoney(grand)}</Text>
            </View>
            {periodGroups.length === 0 ? (
              <Text style={styles.emptyText}>Nothing spent this {sumPeriod}.</Text>
            ) : (
              <ScrollView style={styles.txListScroll}>
                {periodGroups.map((group) => (
                  <View key={group.label} style={styles.txGroup}>
                    <View style={styles.txGroupHeaderRow}>
                      <Text style={styles.txGroupLabel}>{group.label.toUpperCase()}</Text>
                      <Text style={styles.txGroupTotal}>{formatMoney(group.total, false)}</Text>
                    </View>
                    {group.items.map((t) => (
                      <View key={t.id} style={styles.dayItemRow}>
                        <View style={[styles.smallDot, { backgroundColor: t.category ? categoryColor(t.category as CategoryId) : colors.ink38 }]} />
                        <Text style={styles.dayItemName} numberOfLines={1}>
                          {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                        </Text>
                        <Text style={styles.dayItemAmount}>{formatMoney(t.amount)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 34, paddingBottom: 56, maxWidth: 1360, width: "100%" },
  contentMobile: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.screenBottom },
  pillsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radii.pill },
  pillActive: { backgroundColor: colors.ink },
  pillInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink14 },
  pillText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
  pillTextActive: { color: colors.canvas },
  toggleButton: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.ink14, backgroundColor: colors.surface },
  toggleButtonText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  rowStacked: { flexDirection: "column" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink06, borderRadius: radii.hero, padding: 24 },
  eyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.ink45 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  navChevron: { paddingHorizontal: 6, paddingVertical: 4 },
  navChevronText: { fontSize: 20, color: colors.ink, lineHeight: 22 },
  navLabel: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.ink },
  calNavGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 32, flexWrap: "wrap" },
  donutWrap: { width: 186, height: 186, alignItems: "center", justifyContent: "center" },
  donutCenter: { position: "absolute", alignItems: "center", justifyContent: "center" },
  donutEyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1, color: colors.ink45, marginBottom: 6 },
  donutAmount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberSm, color: colors.ink },
  catRows: { flex: 1, minWidth: 190, gap: 11 },
  catRowHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  catName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5 },
  catPct: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink42 },
  catAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, textAlign: "right" },
  subList: { marginTop: 10, paddingTop: 10, paddingLeft: 20, borderTopWidth: 1, borderTopColor: colors.ink07, gap: 9 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  subName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink70 },
  subBarTrack: { width: 84, height: 4, borderRadius: 2, backgroundColor: colors.ink06, overflow: "hidden" },
  subBar: { height: 4, borderRadius: 2 },
  subAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, minWidth: 64, textAlign: "right", color: colors.ink70 },
  catTxList: { marginTop: 10, paddingTop: 10, paddingLeft: 20, borderTopWidth: 1, borderTopColor: colors.ink07, gap: 10 },
  catTxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  catTxDot: { width: 8, height: 8, borderRadius: 4 },
  catTxName: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink },
  catTxMeta: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink42, marginTop: 2 },
  catTxAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink },
  trendRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 150, marginTop: 18 },
  trendCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 8 },
  trendAmount: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink45 },
  trendBar: { width: "100%", borderRadius: 6, backgroundColor: colors.success, minHeight: 3 },
  trendLabel: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink50 },
  moverRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.ink06 },
  moverDelta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base },
  emptyText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink45 },
  calendarCard: { padding: 20 },
  calendarHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 },
  calTitle: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.ink },
  calCaption: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink42 },
  weekdayRow: { flexDirection: "row", marginBottom: 8 },
  weekdayLabel: { flex: 1, textAlign: "center", fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink35 },
  calGrid: { gap: 5 },
  calWeekRow: { flexDirection: "row", gap: 5 },
  calCell: { flex: 1, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  calCellTall: { flex: 1, height: 84, alignItems: "center", justifyContent: "center", borderRadius: 11 },
  calCellText: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.base },
  dayOnlyNotice: { paddingVertical: 8 },
  dayOnlyText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55 },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  yearTile: { width: "31%", borderRadius: 12, paddingVertical: 16, alignItems: "center", gap: 4 },
  yearTileLabel: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5 },
  yearTileAmount: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs },
  periodTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.ink06 },
  periodTotalLabel: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.ink45 },
  periodTotalAmount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayMd, color: colors.ink },
  txListCard: { maxHeight: 560 },
  txListScroll: { flexGrow: 0 },
  txGroup: { marginBottom: 16 },
  txGroupHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  txGroupLabel: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, letterSpacing: 1, color: colors.ink42 },
  txGroupTotal: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink35 },
  dayDetailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 },
  dayTotal: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayMd, color: colors.ink },
  dayItemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  smallDot: { width: 8, height: 8, borderRadius: 4 },
  dayItemName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink70 },
  dayItemAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink },
});
