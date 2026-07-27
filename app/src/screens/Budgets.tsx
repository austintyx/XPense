import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { getCategoryBudgets, updateCategoryBudget, type CategoryBudget } from "../api/client";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { colors, radii, shadow, typography } from "../theme/tokens";
import { allCategories, categoryTotals, currentMonthTransactions, deriveRecurring, formatMoney } from "../utils/derive";

const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 28;

/** Suggested share of the monthly budget per built-in category, used to prefill the edit-all
 * form for categories without a saved limit yet. Adapted from WalletHub's recommended
 * budget-percentage guide (https://wallethub.com/edu/b/budget-percentages/145359), which gives
 * ranges as a share of total income (Housing 25-30%, Food 10-15%, Transportation 10-15%,
 * Utilities 5-10%, Medical 5-10%, Entertainment 5-10%, Personal Care 5-10%, Misc 5-10%). This app
 * only tracks spending (no housing/insurance/savings categories), so those ranges were rescaled
 * to sum to 100% across just the 8 tracked categories, roughly preserving their relative
 * emphasis (Food split into Food/Groceries; Personal Care/Misc folded into Shopping/Other). */
const SUGGESTED_CATEGORY_SHARE: Record<string, number> = {
  Groceries: 0.18,
  Transport: 0.15,
  Bills: 0.15,
  Food: 0.12,
  Shopping: 0.12,
  Entertainment: 0.1,
  Other: 0.1,
  Health: 0.08,
};

export default function Budgets() {
  const { transactions, budget, goal, customCategories, loading } = useAppData();
  const { showToast } = useToast();
  const [limits, setLimits] = useState<CategoryBudget[]>([]);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    getCategoryBudgets()
      .then(setLimits)
      .catch(() => showToast("Couldn't load category budgets"))
      .finally(() => setLimitsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthTxns = useMemo(() => currentMonthTransactions(transactions), [transactions]);
  const totals = useMemo(() => categoryTotals(monthTxns), [monthTxns]);
  const categories = useMemo(() => allCategories(customCategories), [customCategories]);
  const relevantCategories = categories.filter(
    (cat) => (totals[cat] ?? 0) > 0 || limits.some((l) => l.category === cat),
  );
  const recurring = useMemo(() => deriveRecurring(transactions).slice(0, 5), [transactions]);
  const monthlySubTotal = recurring.reduce((sum, r) => sum + r.amount, 0);

  const startEditAll = () => {
    const next: Record<string, string> = {};
    for (const cat of categories) {
      const existing = limits.find((l) => l.category === cat);
      if (existing) {
        next[cat] = existing.monthly_limit;
      } else {
        const share = SUGGESTED_CATEGORY_SHARE[cat];
        next[cat] = share ? String(Math.round(Number(budget?.monthly_target ?? 0) * share)) : "";
      }
    }
    setDrafts(next);
    setEditMode(true);
  };

  const cancelEditAll = () => setEditMode(false);

  const saveAllLimits = async () => {
    const changed = categories.filter((cat) => {
      const draft = (drafts[cat] ?? "").trim();
      if (!draft) return false;
      const existing = limits.find((l) => l.category === cat);
      return !existing || existing.monthly_limit !== draft;
    });
    if (changed.length === 0) {
      setEditMode(false);
      return;
    }
    try {
      const updated = await Promise.all(changed.map((cat) => updateCategoryBudget(cat, drafts[cat].trim())));
      setLimits((prev) => [...prev.filter((l) => !changed.includes(l.category)), ...updated]);
      showToast(`Updated ${changed.length} ${changed.length === 1 ? "limit" : "limits"}`);
    } catch {
      showToast("Couldn't save some limits");
    }
    setEditMode(false);
  };

  const goalPct = goal && Number(goal.target_amount) > 0 ? Number(goal.saved_amount) / Number(goal.target_amount) : 0;
  const goalPctClamped = Math.min(1, Math.max(0, goalPct));

  if (loading || limitsLoading || !budget || !goal) {
    return <View style={styles.container} testID="budgets-screen" />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="budgets-screen">
      <View style={styles.row}>
        <View style={[styles.card, { flex: 7 }, shadow.card]}>
          <View style={styles.headerRow}>
            <Text style={styles.eyebrow}>MONTHLY BUDGETS</Text>
            <View style={styles.headerRight}>
              <Text style={styles.headerMeta}>
                {formatMoney(monthTxns.reduce((s, t) => (t.type === "expense" ? s + Number(t.amount) : s), 0), false)} of{" "}
                {formatMoney(budget.monthly_target, false)}
              </Text>
              {!editMode && (
                <Pressable style={styles.editAllButton} onPress={startEditAll} testID="edit-all-limits">
                  <Text style={styles.editAllButtonText}>Edit</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View style={{ gap: 18 }}>
            {editMode
              ? categories.map((cat) => (
                  <View key={cat}>
                    <View style={styles.budgetLine}>
                      <Text style={styles.catName}>{cat}</Text>
                      <Text style={styles.catAmount}>{formatMoney(totals[cat] ?? 0, false)} spent</Text>
                    </View>
                    <TextInput
                      value={drafts[cat] ?? ""}
                      onChangeText={(v) => setDrafts((prev) => ({ ...prev, [cat]: v }))}
                      keyboardType="decimal-pad"
                      placeholder="No limit"
                      style={styles.editInput}
                      testID={`limit-input-${cat}`}
                    />
                  </View>
                ))
              : (
                  <>
                    {relevantCategories.length === 0 && (
                      <Text style={styles.emptyText}>No spending yet this month.</Text>
                    )}
                    {relevantCategories.map((cat) => {
                      const spent = totals[cat] ?? 0;
                      const limitRow = limits.find((l) => l.category === cat);
                      const limitValue = limitRow ? Number(limitRow.monthly_limit) : null;
                      const pct = limitValue && limitValue > 0 ? Math.min(1, spent / limitValue) : 0;

                      return (
                        <View key={cat}>
                          <View style={styles.budgetLine}>
                            <Text style={styles.catName}>{cat}</Text>
                            <Text style={styles.catAmount}>
                              {limitValue !== null
                                ? `${formatMoney(spent, false)} of ${formatMoney(limitValue, false)}`
                                : formatMoney(spent, false)}
                            </Text>
                          </View>
                          {limitValue !== null ? (
                            <View style={styles.track}>
                              <View
                                style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? colors.over : colors.success }]}
                              />
                            </View>
                          ) : (
                            <Text style={styles.noLimitText}>No limit set</Text>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
            {editMode && (
              <View style={styles.editAllActions}>
                <Pressable style={styles.outlineButtonSmall} onPress={cancelEditAll} testID="cancel-edit-all">
                  <Text style={styles.outlineButtonSmallText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={saveAllLimits} testID="save-all-limits">
                  <Text style={styles.saveButtonText}>Save all</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={{ flex: 5, gap: 16 }}>
          <View style={styles.goalCard}>
            <View style={styles.goalRingWrap}>
              <Svg width={56} height={56} viewBox="0 0 56 56">
                <Circle cx={28} cy={28} r={22} fill="none" stroke={colors.onDark15} strokeWidth={7} />
                <Circle
                  cx={28}
                  cy={28}
                  r={22}
                  fill="none"
                  stroke={colors.successRing}
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeDasharray={`${goalPctClamped * GOAL_RING_CIRCUMFERENCE} ${GOAL_RING_CIRCUMFERENCE}`}
                  transform="rotate(-90 28 28)"
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

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.eyebrow}>SUBSCRIPTIONS</Text>
            <Text style={styles.subCaption}>
              {formatMoney(monthlySubTotal, false)} a month across {recurring.length} {recurring.length === 1 ? "service" : "services"}
            </Text>
            {recurring.length === 0 ? (
              <Text style={styles.emptyText}>Nothing recurring detected yet.</Text>
            ) : (
              recurring.map((r) => (
                <View key={r.merchant} style={styles.subRow}>
                  <Text style={styles.subName} numberOfLines={1}>
                    {r.merchant}
                  </Text>
                  <Text style={styles.subAmount}>{formatMoney(r.amount)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 34, paddingBottom: 56, maxWidth: 1360, width: "100%" },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ink06, borderRadius: radii.hero, padding: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  eyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.ink45 },
  headerMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50 },
  editAllButton: { borderWidth: 1, borderColor: colors.ink14, borderRadius: radii.chip, paddingVertical: 6, paddingHorizontal: 14 },
  editAllButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm5, color: colors.ink },
  budgetLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  catName: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md },
  catAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink70 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.ink06, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  noLimitText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink38 },
  editInput: { marginTop: 8, borderWidth: 1, borderColor: colors.ink14, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base },
  editAllActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  outlineButtonSmall: { borderWidth: 1, borderColor: colors.ink14, borderRadius: radii.chip, paddingVertical: 8, paddingHorizontal: 16, justifyContent: "center" },
  outlineButtonSmallText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm5, color: colors.ink },
  saveButton: { backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16, justifyContent: "center" },
  saveButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm5, color: colors.onDark },
  emptyText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink45 },
  goalCard: { backgroundColor: colors.ink, borderRadius: radii.hero, padding: 24, flexDirection: "row", alignItems: "center", gap: 16 },
  goalRingWrap: { width: 56, height: 56 },
  goalRingLabel: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  goalRingText: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.sm5, color: colors.onDark },
  goalEyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, letterSpacing: 1, textTransform: "uppercase", color: colors.onDark50, marginBottom: 6 },
  goalName: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.onDark, marginBottom: 4 },
  goalMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.onDark60 },
  subCaption: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink55, marginTop: 4, marginBottom: 4 },
  subRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.ink06 },
  subName: { flex: 1, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5 },
  subAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5 },
});
