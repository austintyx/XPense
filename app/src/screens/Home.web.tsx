import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { Transaction } from "../api/client";
import { CategorizeSheet } from "./CategorizeSheet";
import { Donut } from "../components/Donut";
import { ProgressBar } from "../components/ProgressBar";
import { useIsMobileWeb } from "../hooks/useIsMobileWeb";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, colors, radii, shadow, spacing, typography, type CategoryId } from "../theme/tokens";
import {
  categoryTotals,
  currentMonthTransactions,
  dailyTotalsForRange,
  deriveRecurring,
  formatMoney,
  isExpense,
  previousMonthTransactions,
  spendAmount,
  uncategorized,
  UNCATEGORIZED_LABEL,
} from "../utils/derive";

type HomeLayout = "focused" | "command";
const LAYOUT_LABELS: Record<HomeLayout, string> = { focused: "Focused", command: "Command" };
const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 37;
const SPARK_DAYS = 14;

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export default function Home() {
  const navigation = useNavigation<any>();
  const { transactions, budget, goal, loading } = useAppData();
  const [layout, setLayout] = useState<HomeLayout>("focused");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const isMobile = useIsMobileWeb();
  // Applies a row-only flex ratio -- omitted entirely on mobile so a stacked (column) card takes
  // its own natural full width instead of stretching by a ratio that only makes sense in a row.
  const rowFlex = (n: number) => (isMobile ? undefined : { flex: n });

  const now = useMemo(() => new Date(), []);
  const monthTxns = useMemo(() => currentMonthTransactions(transactions, now), [transactions, now]);
  const prevMonthTxns = useMemo(() => previousMonthTransactions(transactions, now), [transactions, now]);
  const spent = useMemo(
    () => monthTxns.filter(isExpense).reduce((sum, t) => sum + spendAmount(t), 0),
    [monthTxns],
  );
  const prevSpent = useMemo(
    () => prevMonthTxns.filter(isExpense).reduce((sum, t) => sum + spendAmount(t), 0),
    [prevMonthTxns],
  );
  const momDeltaPct = prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null;

  const sparkStart = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - (SPARK_DAYS - 1));
    return d;
  }, [now]);
  const spark = useMemo(() => dailyTotalsForRange(transactions, sparkStart, now), [transactions, sparkStart, now]);
  const sparkMax = Math.max(1, ...spark);
  const sparkAvg = spark.reduce((a, b) => a + b, 0) / spark.length;

  const totals = useMemo(() => categoryTotals(monthTxns), [monthTxns]);
  const uncategorizedTotal = useMemo(
    () => uncategorized(monthTxns).reduce((sum, t) => sum + spendAmount(t), 0),
    [monthTxns],
  );
  // Uncategorized spend is folded in as its own slice/row (rather than left out) so the donut's
  // wedges and the "Where it went" rows actually tally to `grand`.
  const sortedCats = useMemo(() => {
    const entries = Object.entries(totals) as [CategoryId, number][];
    if (uncategorizedTotal > 0) entries.push([UNCATEGORIZED_LABEL as CategoryId, uncategorizedTotal]);
    return entries.sort((a, b) => b[1] - a[1]);
  }, [totals, uncategorizedTotal]);
  const grand = sortedCats.reduce((sum, [, v]) => sum + v, 0);

  const reviewQueue = useMemo(() => uncategorized(transactions).slice(0, 4), [transactions]);
  const recentTx = useMemo(() => transactions.filter(isExpense).slice(0, 6), [transactions]);
  const recurring = useMemo(() => deriveRecurring(transactions).slice(0, 4), [transactions]);

  const daysRemaining = daysInMonth(now) - now.getDate() + 1;
  const safeToday = Math.max(0, (Number(budget?.monthly_target ?? 0) - spent) / daysRemaining);
  const pct = budget && Number(budget.monthly_target) > 0 ? spent / Number(budget.monthly_target) : 0;
  const goalPct = goal && Number(goal.target_amount) > 0 ? Number(goal.saved_amount) / Number(goal.target_amount) : 0;
  const goalPctClamped = Math.min(1, Math.max(0, goalPct));

  const biggestTxn = useMemo(
    () =>
      monthTxns
        .filter(isExpense)
        .reduce((max: Transaction | null, t) => (!max || spendAmount(t) > spendAmount(max) ? t : max), null),
    [monthTxns],
  );

  const insights = useMemo(() => {
    const items: { kicker: string; text: string }[] = [];
    if (sortedCats.length > 0 && grand > 0) {
      const [topCat, topTotal] = sortedCats[0]!;
      items.push({
        kicker: "TOP CATEGORY",
        text: `${topCat} is your biggest category at ${Math.round((topTotal / grand) * 100)}% of spend this month.`,
      });
    }
    if (momDeltaPct !== null) {
      const direction = momDeltaPct <= 0 ? "less" : "more";
      items.push({ kicker: "VS LAST MONTH", text: `You've spent ${Math.abs(Math.round(momDeltaPct))}% ${direction} than last month.` });
    }
    if (biggestTxn) {
      items.push({
        kicker: "BIGGEST TRANSACTION",
        text: `Your largest transaction this month was ${formatMoney(biggestTxn.amount)} at ${biggestTxn.merchant_clean ?? biggestTxn.merchant_raw ?? "Unknown"}.`,
      });
    }
    return items;
  }, [sortedCats, grand, momDeltaPct, biggestTxn]);

  if (loading || !budget || !goal) {
    return <View style={styles.container} testID="home-screen" />;
  }

  const kpis = [
    { label: "SPENT THIS MONTH", value: formatMoney(spent, false), sub: `of ${formatMoney(budget.monthly_target, false)} budget` },
    { label: "SAFE TO SPEND TODAY", value: formatMoney(safeToday, false), sub: `Keeps you on budget` },
    { label: "% OF BUDGET USED", value: `${Math.round(pct * 100)}%`, sub: `${formatMoney(Number(budget.monthly_target) - spent, false)} left` },
    { label: "DAYS LEFT", value: String(daysRemaining), sub: "in this month" },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      testID="home-screen"
    >
      <View style={styles.toolbar}>
        <Text style={styles.eyebrow}>LAYOUT</Text>
        <View style={styles.segmented}>
          {(["focused", "command"] as HomeLayout[]).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLayout(l)}
              style={[styles.segmentItem, layout === l && styles.segmentItemActive]}
              testID={`home-layout-${l}`}
            >
              <Text style={[styles.segmentText, layout === l && styles.segmentTextActive]}>{LAYOUT_LABELS[l]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {layout === "focused" ? (
        <View style={{ gap: 16 }}>
          <View style={[styles.row, isMobile && styles.rowStacked]} testID="home-hero-row">
            <View style={[styles.card, rowFlex(8), shadow.card]}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.eyebrow}>SPENT THIS MONTH</Text>
                  <View style={styles.amountRow}>
                    <Text style={styles.amount}>{formatMoney(spent)}</Text>
                    <Text style={styles.amountOf}>of {formatMoney(budget.monthly_target, false)} budget</Text>
                  </View>
                </View>
                {momDeltaPct !== null && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.eyebrow}>VS LAST MONTH</Text>
                    <Text style={[styles.deltaText, { color: momDeltaPct <= 0 ? colors.successText : colors.over }]}>
                      {momDeltaPct <= 0 ? "↓" : "↑"} {Math.abs(Math.round(momDeltaPct))}% · {formatMoney(Math.abs(spent - prevSpent), false)}{" "}
                      {momDeltaPct <= 0 ? "lower" : "higher"}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.progressWrap}>
                <ProgressBar pct={pct * 100} height={8} fillColor={pct > 0.9 ? colors.over : colors.success} testID="budget-progress" />
              </View>
              <View style={styles.footerRow}>
                <Text style={styles.footerLeft}>{Math.round(pct * 100)}% of budget used</Text>
                <Text style={styles.footerRight}>
                  {formatMoney(Number(budget.monthly_target) - spent, false)} left · {daysRemaining} days
                </Text>
              </View>
              <View style={styles.sparkSection}>
                <View style={styles.sparkHeader}>
                  <Text style={styles.eyebrow}>DAILY SPEND · {SPARK_DAYS} DAYS</Text>
                  <Text style={styles.sparkAvg}>avg {formatMoney(sparkAvg, false)}/day</Text>
                </View>
                <View style={styles.sparkRow}>
                  {spark.map((d, i) => (
                    <View
                      key={i}
                      style={[styles.sparkBar, { height: `${Math.max(4, (d / sparkMax) * 100)}%`, backgroundColor: colors.success }]}
                    />
                  ))}
                </View>
              </View>
            </View>

            <View style={{ ...rowFlex(4), gap: 16 }}>
              <View style={[styles.card, rowFlex(1), shadow.card]}>
                <Text style={styles.eyebrow}>SAFE TO SPEND TODAY</Text>
                <Text style={styles.safeAmount}>{formatMoney(safeToday)}</Text>
                <Text style={styles.safeCaption}>Keeps you on budget through the end of the month.</Text>
              </View>
              <View style={styles.goalCard}>
                <View style={styles.goalRingWrap}>
                  <Svg width={74} height={74} viewBox="0 0 88 88">
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
            </View>
          </View>

          <View style={[styles.row, isMobile && styles.rowStacked]} testID="home-secondary-row">
            <View style={[styles.card, rowFlex(5), shadow.card]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.eyebrow}>WHERE IT WENT</Text>
                <Text style={styles.linkText} onPress={() => navigation.navigate("Summary")}>
                  Full report →
                </Text>
              </View>
              <View style={styles.donutRow}>
                <Donut
                  segments={sortedCats.map(([cat, total]) => ({ id: cat, value: total, color: categoryColor(cat) }))}
                  size={128}
                  innerRadius={36}
                  outerRadius={58}
                />
                <View style={styles.donutList}>
                  {sortedCats.slice(0, 4).map(([cat, total]) => (
                    <View key={cat} style={styles.catLine}>
                      <View style={[styles.dot, { backgroundColor: categoryColor(cat) }]} />
                      <Text style={styles.catName}>{cat}</Text>
                      <Text style={styles.catAmount}>{formatMoney(total)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={[styles.card, styles.reviewCard, rowFlex(4)]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.reviewEyebrow}>NEEDS REVIEW</Text>
                <Text style={styles.reviewBadge}>{reviewQueue.length}</Text>
              </View>
              {reviewQueue.length === 0 ? (
                <View style={styles.reviewEmptyWrap} testID="home-review-empty">
                  <Text style={styles.reviewEmptyText}>All transactions categorised!</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.reviewCaption}>Not yet given a category.</Text>
                  <View style={{ gap: 9, flex: 1 }}>
                    {reviewQueue.map((t) => (
                      <Pressable key={t.id} style={styles.reviewRow} onPress={() => setSelected(t)} testID={`home-review-${t.id}`}>
                        <Text style={styles.reviewMerchant} numberOfLines={1}>
                          {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                        </Text>
                        <Text style={styles.reviewAmount}>{formatMoney(t.amount)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable style={styles.outlineButton} onPress={() => navigation.navigate("QuickSort")} testID="home-quick-sort-all">
                    <Text style={styles.outlineButtonText}>Quick sort all</Text>
                  </Pressable>
                </>
              )}
            </View>

            <View style={{ ...rowFlex(3), gap: 16 }}>
              {insights.map((ins, i) => (
                <View key={i} style={[styles.card, rowFlex(1), shadow.card]}>
                  <Text style={styles.eyebrow}>{ins.kicker}</Text>
                  <Text style={styles.insightText}>{ins.text}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.row, isMobile && styles.rowStacked]}>
            <View style={[styles.card, rowFlex(8), shadow.card]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.eyebrow}>RECENT TRANSACTIONS</Text>
                <Text style={styles.linkText} onPress={() => navigation.navigate("Activity")}>
                  See all →
                </Text>
              </View>
              {recentTx.map((t) => (
                <Pressable key={t.id} style={styles.txRow} onPress={() => setSelected(t)} testID={`home-recent-${t.id}`}>
                  <Text style={styles.txMerchant} numberOfLines={1}>
                    {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                  </Text>
                  <Text style={styles.txMeta}>{t.category ?? "Uncategorised"}</Text>
                  <Text style={styles.txAmount}>{formatMoney(t.amount)}</Text>
                </Pressable>
              ))}
            </View>

            <View style={[styles.card, rowFlex(4), shadow.card]}>
              <Text style={styles.eyebrow}>UPCOMING RECURRING</Text>
              <Text style={styles.reviewCaption}>Detected from your transactions.</Text>
              {recurring.length === 0 ? (
                <Text style={styles.emptyText}>Nothing recurring detected yet.</Text>
              ) : (
                recurring.map((r) => (
                  <View key={r.merchant} style={styles.recurringRow}>
                    <Text style={styles.txMerchant} numberOfLines={1}>
                      {r.merchant}
                    </Text>
                    <Text style={styles.txAmount}>{formatMoney(r.amount)}</Text>
                  </View>
                ))
              )}
              <Pressable style={styles.outlineButton} onPress={() => navigation.navigate("Budgets")} testID="home-manage-subscriptions">
                <Text style={styles.outlineButtonText}>Manage subscriptions</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <View style={[styles.row, isMobile && styles.rowStacked]}>
            {kpis.map((k) => (
              <View key={k.label} style={[styles.card, rowFlex(1), shadow.card]}>
                <Text style={styles.eyebrow}>{k.label}</Text>
                <Text style={styles.kpiValue}>{k.value}</Text>
                <Text style={styles.safeCaption}>{k.sub}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.row, isMobile && styles.rowStacked]}>
            <View style={[styles.card, rowFlex(7), shadow.card]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.eyebrow}>BUDGET PACE · {SPARK_DAYS} DAYS</Text>
                <Text style={styles.sparkAvg}>avg {formatMoney(sparkAvg, false)}/day</Text>
              </View>
              <View style={[styles.sparkRow, { height: 120, marginBottom: 18 }]}>
                {spark.map((d, i) => (
                  <View key={i} style={[styles.sparkBar, { height: `${Math.max(4, (d / sparkMax) * 100)}%`, backgroundColor: colors.success }]} />
                ))}
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: colors.ink06, paddingTop: 16 }}>
                <Text style={styles.eyebrow}>RECENT TRANSACTIONS</Text>
                {recentTx.map((t) => (
                  <Pressable key={t.id} style={styles.txRow} onPress={() => setSelected(t)} testID={`home-b-recent-${t.id}`}>
                    <Text style={styles.txMerchant} numberOfLines={1}>
                      {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                    </Text>
                    <Text style={styles.txMeta}>{t.category ?? "Uncategorised"}</Text>
                    <Text style={styles.txAmount}>{formatMoney(t.amount)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ ...rowFlex(5), gap: 16 }}>
              <View style={[styles.card, shadow.card]}>
                <Text style={styles.eyebrow}>SPEND BY CATEGORY</Text>
                <View style={{ gap: 13, marginTop: 12 }}>
                  {sortedCats.slice(0, 5).map(([cat, total]) => (
                    <View key={cat}>
                      <View style={styles.catLineB}>
                        <Text style={styles.catNameB}>{cat}</Text>
                        <Text style={styles.catAmountB}>{formatMoney(total)}</Text>
                      </View>
                      <View style={styles.trackB}>
                        <View
                          style={[styles.fillB, { width: `${grand > 0 ? (total / grand) * 100 : 0}%`, backgroundColor: categoryColor(cat) }]}
                        />
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.card, styles.reviewCard]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.reviewEyebrow}>NEEDS REVIEW</Text>
                  <Text style={styles.reviewBadge}>{reviewQueue.length}</Text>
                </View>
                {reviewQueue.length === 0 ? (
                  <View style={styles.reviewEmptyWrap} testID="home-b-review-empty">
                    <Text style={styles.reviewEmptyText}>All transactions categorised!</Text>
                  </View>
                ) : (
                  <View style={{ gap: 9 }}>
                    {reviewQueue.map((t) => (
                      <Pressable key={t.id} style={styles.reviewRow} onPress={() => setSelected(t)} testID={`home-b-review-${t.id}`}>
                        <Text style={styles.reviewMerchant} numberOfLines={1}>
                          {t.merchant_clean ?? t.merchant_raw ?? "Unknown"}
                        </Text>
                        <Text style={styles.reviewAmount}>{formatMoney(t.amount)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.goalCard}>
                <View style={styles.goalRingWrap}>
                  <Svg width={70} height={70} viewBox="0 0 88 88">
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
                    {formatMoney(goal.saved_amount, false)} of {formatMoney(goal.target_amount, false)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      )}

      <CategorizeSheet transaction={selected} onClose={() => setSelected(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 34, paddingBottom: 56, maxWidth: 1360, width: "100%" },
  contentMobile: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.screenBottom },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10, marginBottom: 16 },
  segmented: { flexDirection: "row", gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink06, borderRadius: radii.chip, padding: 4 },
  segmentItem: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: radii.pill },
  segmentItemActive: { backgroundColor: colors.ink },
  segmentText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55 },
  segmentTextActive: { color: colors.onDark, fontFamily: typography.fontFamily.sansMedium },
  row: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  rowStacked: { flexDirection: "column" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink06, borderRadius: radii.hero, padding: 22 },
  eyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.ink45 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 12 },
  amount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberXxl, color: colors.ink },
  amountOf: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink50 },
  deltaText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.lg, marginTop: 10 },
  progressWrap: { marginTop: 22, marginBottom: 10 },
  footerRow: { flexDirection: "row", justifyContent: "space-between" },
  footerLeft: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55 },
  footerRight: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.base, color: colors.ink },
  sparkSection: { borderTopWidth: 1, borderTopColor: colors.ink06, marginTop: 22, paddingTop: 18 },
  sparkHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sparkAvg: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink50 },
  sparkRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 64 },
  sparkBar: { flex: 1, borderRadius: 5, minHeight: 3 },
  safeAmount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberLg, color: colors.ink, marginTop: 12, marginBottom: 6 },
  safeCaption: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55, lineHeight: 20 },
  goalCard: { flex: 1, backgroundColor: colors.ink, borderRadius: radii.hero, padding: 22, flexDirection: "row", alignItems: "center", gap: 16 },
  goalRingWrap: { width: 74, height: 74 },
  goalRingLabel: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  goalRingText: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.onDark },
  goalEyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, letterSpacing: 1, textTransform: "uppercase", color: colors.onDark50, marginBottom: 6 },
  goalName: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.onDark, marginBottom: 4 },
  goalMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.onDark60 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  linkText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink50 },
  donutRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, flex: 1 },
  donutList: { width: 220, gap: 12 },
  catLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  catName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.md },
  catAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink70 },
  reviewCard: { backgroundColor: colors.warnRowBg, borderWidth: 1, borderColor: colors.warnBorder },
  reviewEyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.warnText },
  reviewBadge: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, fontWeight: "500", backgroundColor: colors.warnSolid, color: colors.ink, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  reviewCaption: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55, marginBottom: 14 },
  reviewEmptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  reviewEmptyText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink48, textAlign: "center" },
  reviewRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink06, borderRadius: 14, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  reviewMerchant: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5 },
  reviewAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5 },
  outlineButton: { marginTop: 14, borderWidth: 1, borderColor: colors.ink14, borderRadius: radii.chip, paddingVertical: 11, alignItems: "center" },
  outlineButtonText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base },
  insightText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, lineHeight: 21, marginTop: 9 },
  txRow: { flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.ink06 },
  txMerchant: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.md },
  txMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink50 },
  txAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md5, minWidth: 80, textAlign: "right" },
  recurringRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.ink06 },
  emptyText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink45, paddingVertical: 12 },
  kpiValue: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberMd, color: colors.ink, marginTop: 10, marginBottom: 4 },
  catLineB: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  catNameB: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5 },
  catAmountB: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink70 },
  trackB: { height: 6, borderRadius: 3, backgroundColor: colors.ink06, overflow: "hidden" },
  fillB: { height: 6, borderRadius: 3 },
});
