import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryChip } from "../components/CategoryChip";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { CATEGORIES, categoryColorChip, colors, subcategoriesFor, typography, type CategoryId } from "../theme/tokens";
import { deriveSource, formatMoney } from "../utils/derive";
import type { Transaction } from "../api/client";

interface CategorizeSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export function CategorizeSheet({ transaction, onClose }: CategorizeSheetProps) {
  const { categorize } = useAppData();
  const { showToast } = useToast();
  const [pickedCategory, setPickedCategory] = useState<CategoryId | null>(null);

  useEffect(() => {
    if (transaction) {
      setPickedCategory((transaction.category as CategoryId | null) ?? null);
    }
  }, [transaction]);

  if (!transaction) {
    return (
      <BottomSheet visible={false} onClose={onClose} testID="categorize-sheet">
        {null}
      </BottomSheet>
    );
  }

  const subcategories = pickedCategory ? subcategoriesFor(pickedCategory) : null;
  const isSubcategoryStep = subcategories !== null;

  const chooseCategory = async (category: CategoryId) => {
    if (subcategoriesFor(category)) {
      setPickedCategory(category);
      return;
    }
    await categorize(transaction.id, category, null);
    showToast(`Filed under ${category}`);
    onClose();
  };

  const chooseSubcategory = async (subcategory: string) => {
    if (!pickedCategory) return;
    await categorize(transaction.id, pickedCategory, subcategory);
    showToast(`Filed under ${pickedCategory} · ${subcategory}`);
    onClose();
  };

  return (
    <BottomSheet visible={transaction !== null} onClose={onClose} testID="categorize-sheet">
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{transaction.merchant_clean ?? transaction.merchant_raw ?? "Unknown"}</Text>
        <Text style={styles.headerText}>{formatMoney(transaction.amount)}</Text>
      </View>
      <Text style={styles.meta}>
        {new Date(transaction.txn_at).toLocaleDateString()} · read from {deriveSource(transaction)}
      </Text>
      <Text style={styles.stepLabel}>
        {isSubcategoryStep ? `Which kind of ${pickedCategory!.toLowerCase()}?` : "Pick a category"}
      </Text>
      <View style={styles.chipsRow}>
        {isSubcategoryStep
          ? subcategories!.map((sub) => (
              <CategoryChip key={sub} label={sub} active={false} onPress={() => chooseSubcategory(sub)} testID={`sub-chip-${sub}`} />
            ))
          : CATEGORIES.map((category) => (
              <CategoryChip
                key={category}
                label={category}
                active={pickedCategory === category}
                activeColor={categoryColorChip(category)}
                onPress={() => chooseCategory(category)}
                testID={`cat-chip-${category}`}
              />
            ))}
      </View>
      {isSubcategoryStep && (
        <Text style={styles.backLink} onPress={() => setPickedCategory(null)} testID="back-to-categories">
          ‹ Back to categories
        </Text>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  headerText: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayXl, color: colors.ink },
  meta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink50, marginBottom: 18 },
  stepLabel: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 11,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  backLink: { marginTop: 16, fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50 },
});
