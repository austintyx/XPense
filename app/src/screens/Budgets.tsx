import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { getCategoryBudgets, updateCategoryBudget, type CategoryBudget } from "../api/client";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { colors, radii, shadow, typography } from "../theme/tokens";
import { allCategories, categoryTotals, currentMonthTransactions, deriveRecurring, formatMoney } from "../utils/derive";

const GOAL_RING_CIRCUMFERENCE = 2 * Math.PI * 28;

export default function Budgets() {
  const { transactions, budget, goal, customCategories, loading } = useAppData();
  const { showToast } = useToast();
  const [limits, setLimits] = useState<CategoryBudget[]>([]);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState("");

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

  const startEdit = (category: string) => {
    const existing = limits.find((l) => l.category === category);
    setLimitDraft(existing ? existing.monthly_limit : "");
    setEditingCategory(category);
  };

  const saveLimit = async () => {
    if (!editingCategory || !limitDraft.trim()) return;
    try {
      const updated = await updateCategoryBudget(editingCategory, limitDraft.trim());
      setLimits((prev) => [...prev.filter((l) => l.category !== editingCategory), updated]);
      showToast(`${editingCategory} limit set to ${formatMoney(updated.monthly_limit, false)}`);
    } catch {
      showToast("Couldn't save that limit");
    }
    setEditingCategory(null);
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
            <Text style={styles.headerMeta}>
              {formatMoney(monthTxns.reduce((s, t) => (t.type === "expense" ? s + Number(t.amount) : s), 0), false)} of{" "}
              {formatMoney(budget.monthly_target, false)}
            </Text>
          </View>
          <View style={{ gap: 18 }}>
            {relevantCategories.length === 0 && (
              <Text style={styles.emptyText}>No spending yet this month.</Text>
            )}
            {relevantCategories.map((cat) => {
              const spent = totals[cat] ?? 0;
              const limitRow = limits.find((l) => l.category === cat);
              const limitValue = limitRow ? Number(limitRow.monthly_limit) : null;
              const pct = limitValue && limitValue > 0 ? Math.min(1, spent / limitValue) : 0;
              const isEditing = editingCategory === cat;

              return (
                <View key={cat}>
                  <View style={styles.budgetLine}>
                    <Text style={styles.catName}>{cat}</Text>
                    <Text style={styles.catAmount}>
                      {limitValue !== null ? `${formatMoney(spent, false)} of ${formatMoney(limitValue, false)}` : formatMoney(spent, false)}
                    </Text>
                  </View>
                  {limitValue !== null ? (
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? colors.over : colors.success }]} />
                    </View>
                  ) : (
                    <Text style={styles.setLimitLink} onPress={() => startEdit(cat)} testID={`set-limit-${cat}`}>
                      Set a limit
                    </Text>
                  )}
                  {limitValue !== null && !isEditing && (
                    <Text style={styles.editLink} onPress={() => startEdit(cat)} testID={`edit-limit-${cat}`}>
                      Edit limit
                    </Text>
                  )}
                  {isEditing && (
                    <View style={styles.editRow}>
                      <TextInput
                        value={limitDraft}
                        onChangeText={setLimitDraft}
                        keyboardType="decimal-pad"
                        placeholder="Monthly limit"
                        style={styles.editInput}
                        testID={`limit-input-${cat}`}
                      />
                      <Pressable style={styles.saveButton} onPress={saveLimit} testID={`save-limit-${cat}`}>
                        <Text style={styles.saveButtonText}>Save</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
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
  eyebrow: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs5, letterSpacing: 1.4, textTransform: "uppercase", color: colors.ink45 },
  headerMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50 },
  budgetLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  catName: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md },
  catAmount: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink70 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.ink06, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  setLimitLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.successText },
  editLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.xs5, color: colors.ink42, marginTop: 4 },
  editRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  editInput: { flex: 1, borderWidth: 1, borderColor: colors.ink14, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base },
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
