import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryChip } from "../components/CategoryChip";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, colors, radii, shadow, spacing, typography } from "../theme/tokens";
import { allCategories, deriveSource, formatDateTime, formatMoney, mergedSubcategories, uncategorized } from "../utils/derive";

const REASON_HINT = "We couldn't confidently match this merchant — pick a category to help us learn.";

export default function QuickSort() {
  const navigation = useNavigation<any>();
  const { transactions, categorize, customCategories, customSubcategories } = useAppData();
  const { showToast } = useToast();
  const [skipped, setSkipped] = useState<number[]>([]);
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const [sortedCount, setSortedCount] = useState(0);

  const categories = useMemo(() => allCategories(customCategories), [customCategories]);

  const queue = useMemo(
    () => uncategorized(transactions).filter((t) => !skipped.includes(t.id)),
    [transactions, skipped],
  );
  const current = queue[0] ?? null;
  const isDone = current === null;

  const close = () => navigation.goBack();

  const chooseCategory = async (category: string) => {
    if (mergedSubcategories(category, customSubcategories).length > 0) {
      setPickedCategory(category);
      return;
    }
    if (!current) return;
    await categorize(current.id, category, null);
    setSortedCount((n) => n + 1);
    showToast(`${current.merchant_clean ?? current.merchant_raw} → ${category}`);
  };

  const chooseSubcategory = async (subcategory: string) => {
    if (!current || !pickedCategory) return;
    await categorize(current.id, pickedCategory, subcategory);
    setSortedCount((n) => n + 1);
    showToast(`${current.merchant_clean ?? current.merchant_raw} → ${pickedCategory} · ${subcategory}`);
    setPickedCategory(null);
  };

  const skip = () => {
    if (!current) return;
    setSkipped((s) => s.concat(current.id));
    setPickedCategory(null);
  };

  return (
    <View style={styles.container} testID="quicksort-screen">
      <View style={styles.topRow}>
        <Text style={styles.doneLink} onPress={close} testID="quicksort-done-link">
          Done
        </Text>
        <Text style={styles.counter}>
          {queue.length > 0 ? `${sortedCount + 1} of ${sortedCount + queue.length}` : `${sortedCount} sorted`}
        </Text>
      </View>
      <Text style={styles.title}>Quick sort</Text>
      <Text style={styles.subtitle}>A few we couldn't read confidently.</Text>

      <View style={styles.stack}>
        {isDone ? (
          <View style={[styles.doneCard, shadow.card]}>
            <View style={styles.doneCircle} />
            <Text style={styles.doneTitle}>{sortedCount > 0 ? "All sorted" : "Nothing to sort"}</Text>
            <Text style={styles.doneBody}>
              {sortedCount > 0
                ? `You filed ${sortedCount} ${sortedCount === 1 ? "transaction" : "transactions"}. Your summary is accurate again.`
                : "Everything already has a category. Come back when something new lands."}
            </Text>
            <Pressable style={styles.doneButton} onPress={close} testID="quicksort-back-to-spending">
              <Text style={styles.doneButtonText}>Back to spending</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.dummyCardFar} />
            <View style={styles.dummyCardNear} />
            <View style={[styles.frontCard, shadow.quickSortCard]} testID="quicksort-card">
              <Text style={styles.cardSource}>{deriveSource(current!).toUpperCase()}</Text>
              <Text style={styles.cardMerchant}>{current!.merchant_clean ?? current!.merchant_raw ?? "Unknown"}</Text>
              <Text style={styles.cardWhen}>{formatDateTime(current!.txn_at)}</Text>
              <Text style={styles.cardAmount}>{formatMoney(current!.amount)}</Text>
              <Text style={styles.cardHint}>{REASON_HINT}</Text>
            </View>
          </>
        )}
      </View>

      {!isDone && (
        <>
          <Text style={styles.stepLabel}>{pickedCategory ? `Which kind of ${pickedCategory.toLowerCase()}?` : "Tap a category"}</Text>
          <View style={styles.chipsRow}>
            {pickedCategory
              ? mergedSubcategories(pickedCategory, customSubcategories).map((sub) => (
                  <CategoryChip key={sub} label={sub} onPress={() => chooseSubcategory(sub)} testID={`qs-sub-${sub}`} />
                ))
              : categories.map((cat) => (
                  <CategoryChip
                    key={cat}
                    label={cat}
                    leftBorderColor={categoryColor(cat)}
                    onPress={() => chooseCategory(cat)}
                    testID={`qs-cat-${cat}`}
                  />
                ))}
          </View>
          <View style={styles.footerLinks}>
            {pickedCategory && (
              <Text style={styles.footerLink} onPress={() => setPickedCategory(null)} testID="qs-back-to-categories">
                ‹ Categories
              </Text>
            )}
            <Text style={styles.footerLink} onPress={skip} testID="qs-skip">
              Skip for now
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingTop: spacing.screenTop,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 30,
    ...(Platform.OS === "web" ? { maxWidth: 460, width: "100%" as const, alignSelf: "center" as const } : null),
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  doneLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink55 },
  counter: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.sm, color: colors.ink42 },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.title, marginBottom: 6, color: colors.ink },
  subtitle: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50, marginBottom: 24 },
  stack: { height: 290, position: "relative" },
  dummyCardFar: { position: "absolute", top: 8, left: 7, right: 7, height: 262, backgroundColor: colors.surface, borderRadius: 25, opacity: 0.7 },
  dummyCardNear: { position: "absolute", top: 16, left: 14, right: 14, height: 250, backgroundColor: colors.surface, borderRadius: 24, opacity: 0.4 },
  frontCard: { position: "absolute", top: 0, left: 0, right: 0, height: 274, backgroundColor: colors.surface, borderRadius: radii.quickSort, padding: 24 },
  cardSource: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 14,
  },
  cardMerchant: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, marginBottom: 6, color: colors.ink },
  cardWhen: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50, marginBottom: 20 },
  cardAmount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberXl, color: colors.ink },
  cardHint: { marginTop: "auto", fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink42 },
  doneCard: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderRadius: radii.quickSort, alignItems: "center", justifyContent: "center", padding: 30 },
  doneCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.successDoneCircle, marginBottom: 16 },
  doneTitle: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayXl, marginBottom: 8, color: colors.ink },
  doneBody: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink52, textAlign: "center", maxWidth: 230 },
  doneButton: { marginTop: 20, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  doneButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.onDark },
  stepLabel: {
    marginTop: 24,
    marginBottom: 12,
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.ink42,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  footerLinks: { flexDirection: "row", justifyContent: "center", gap: 22, marginTop: 20 },
  footerLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink45 },
});
