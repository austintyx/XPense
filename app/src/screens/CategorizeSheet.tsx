import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryChip } from "../components/CategoryChip";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColorChip, colors, typography } from "../theme/tokens";
import { confirmDestructive } from "../utils/confirm";
import { allCategories, deriveSource, formatDateTime, formatMoney, mergedSubcategories } from "../utils/derive";
import type { Transaction } from "../api/client";

interface CategorizeSheetProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export function CategorizeSheet({ transaction, onClose }: CategorizeSheetProps) {
  const { categorize, editTransaction, removeTransaction, customCategories, customSubcategories } = useAppData();
  const { showToast } = useToast();
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editMerchant, setEditMerchant] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const categories = useMemo(
    () => allCategories(customCategories, transaction?.direction ?? "debit"),
    [customCategories, transaction?.direction],
  );

  useEffect(() => {
    if (transaction) {
      setPickedCategory(transaction.category ?? null);
      setEditing(false);
    }
  }, [transaction]);

  if (!transaction) {
    return (
      <BottomSheet visible={false} onClose={onClose} testID="categorize-sheet">
        {null}
      </BottomSheet>
    );
  }

  const subcategories = pickedCategory ? mergedSubcategories(pickedCategory, customSubcategories) : [];
  const isSubcategoryStep = subcategories.length > 0;

  const chooseCategory = async (category: string) => {
    if (mergedSubcategories(category, customSubcategories).length > 0) {
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

  const startEdit = () => {
    setEditMerchant(transaction.merchant_clean ?? transaction.merchant_raw ?? "");
    setEditAmount(String(transaction.amount));
    setEditing(true);
  };

  const canSaveEdit = editMerchant.trim().length > 0 && editAmount.trim().length > 0;

  const saveEdit = async () => {
    if (!canSaveEdit) return;
    await editTransaction(transaction.id, editMerchant.trim(), editAmount.trim());
    showToast("Transaction updated");
    setEditing(false);
  };

  const confirmDelete = () => {
    const label = transaction.merchant_clean ?? transaction.merchant_raw ?? "this transaction";
    confirmDestructive({
      title: "Delete transaction?",
      message: `Delete ${label}? This can't be undone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        await removeTransaction(transaction.id);
        showToast("Transaction deleted");
        onClose();
      },
    });
  };

  return (
    <BottomSheet visible={transaction !== null} onClose={onClose} testID="categorize-sheet">
      {editing ? (
        <View style={styles.editForm}>
          <Text style={styles.label}>Merchant</Text>
          <TextInput
            value={editMerchant}
            onChangeText={setEditMerchant}
            style={styles.textInput}
            testID="edit-merchant"
          />
          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountBox}>
            <Text style={styles.currencyPrefix}>S$</Text>
            <TextInput
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              testID="edit-amount"
            />
          </View>
          <View style={styles.editActionsRow}>
            <Pressable onPress={() => setEditing(false)} style={styles.editCancelButton} testID="edit-cancel">
              <Text style={styles.editCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={saveEdit}
              disabled={!canSaveEdit}
              style={[styles.editSaveButton, canSaveEdit ? styles.editSaveButtonEnabled : styles.editSaveButtonDisabled]}
              testID="edit-save"
            >
              <Text
                style={[
                  styles.editSaveText,
                  canSaveEdit ? styles.editSaveTextEnabled : styles.editSaveTextDisabled,
                ]}
              >
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.headerRow}>
          <Text style={[styles.headerText, styles.merchantText]} numberOfLines={2}>
            {transaction.merchant_clean ?? transaction.merchant_raw ?? "Unknown"}
          </Text>
          <Text style={[styles.headerText, styles.amountText]}>{formatMoney(transaction.amount)}</Text>
        </View>
      )}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {formatDateTime(transaction.txn_at)} · read from {deriveSource(transaction)}
        </Text>
        {!editing && (
          <Text style={styles.editLink} onPress={startEdit} testID="edit-transaction">
            Edit
          </Text>
        )}
      </View>
      <Text style={styles.stepLabel}>
        {isSubcategoryStep ? `Which kind of ${pickedCategory!.toLowerCase()}?` : "Pick a category"}
      </Text>
      <View style={styles.chipsRow}>
        {isSubcategoryStep
          ? subcategories.map((sub) => (
              <CategoryChip key={sub} label={sub} active={false} onPress={() => chooseSubcategory(sub)} testID={`sub-chip-${sub}`} />
            ))
          : categories.map((category) => (
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
      <Text style={styles.deleteLink} onPress={confirmDelete} testID="delete-transaction">
        Delete transaction
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  headerText: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayXl, color: colors.ink },
  merchantText: { flex: 1, flexShrink: 1, minWidth: 0 },
  amountText: { flexShrink: 0, marginLeft: 10 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  meta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink50 },
  editLink: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm, color: colors.ink },
  editForm: { marginBottom: 4 },
  label: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 12,
    padding: 12,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.lg,
    color: colors.ink,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 12,
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  currencyPrefix: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.lg, color: colors.ink45 },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.xl,
    color: colors.ink,
  },
  editActionsRow: { flexDirection: "row", gap: 10 },
  editCancelButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.ink14,
  },
  editCancelText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.ink },
  editSaveButton: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  editSaveButtonEnabled: { backgroundColor: colors.ink },
  editSaveButtonDisabled: { backgroundColor: colors.ink16 },
  editSaveText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg },
  editSaveTextEnabled: { color: colors.onDark },
  editSaveTextDisabled: { color: colors.ink35 },
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
  deleteLink: {
    marginTop: 20,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.base,
    color: colors.warnText,
    textAlign: "center",
  },
});
