import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryChip } from "../components/CategoryChip";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { CATEGORIES, FOOD_SUBCATEGORIES, categoryColorChip, colors, typography, type CategoryId } from "../theme/tokens";
import { formatMoney } from "../utils/derive";

interface AddTransactionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddTransactionSheet({ visible, onClose }: AddTransactionSheetProps) {
  const { addTransaction, user } = useAppData();
  const { showToast } = useToast();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);

  const reset = () => {
    setAmount("");
    setMerchant("");
    setCategory(null);
    setSubcategory(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSave = amount.trim().length > 0 && merchant.trim().length > 0 && category !== null;

  const save = async () => {
    if (!canSave || !category) return;
    await addTransaction({
      user_id: user?.id ?? 1,
      amount,
      merchant_raw: merchant,
      merchant_clean: merchant,
      category,
      subcategory: category === "Food" ? subcategory : null,
      txn_at: new Date().toISOString(),
    });
    showToast(`Added ${formatMoney(amount)} · ${merchant}`);
    reset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} testID="add-transaction-sheet">
      <Text style={styles.title}>Add a transaction</Text>

      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountBox}>
        <Text style={styles.currencyPrefix}>S$</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          style={styles.amountInput}
          testID="draft-amount"
        />
      </View>

      <Text style={styles.label}>Merchant</Text>
      <TextInput
        value={merchant}
        onChangeText={setMerchant}
        placeholder="Where did it go?"
        style={styles.textInput}
        testID="draft-merchant"
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipsRow}>
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={category === c}
            activeColor={categoryColorChip(c)}
            onPress={() => {
              setCategory(c);
              setSubcategory(null);
            }}
            testID={`draft-cat-${c}`}
          />
        ))}
      </View>

      {category === "Food" && (
        <View style={[styles.chipsRow, styles.subChipsRow]}>
          {FOOD_SUBCATEGORIES.map((sub) => (
            <CategoryChip
              key={sub}
              label={sub}
              size="small"
              active={subcategory === sub}
              onPress={() => setSubcategory(sub)}
              testID={`draft-sub-${sub}`}
            />
          ))}
        </View>
      )}

      <Pressable
        onPress={save}
        disabled={!canSave}
        style={[styles.saveButton, canSave ? styles.saveButtonEnabled : styles.saveButtonDisabled]}
        testID="save-draft"
      >
        <Text style={[styles.saveButtonText, canSave ? styles.saveButtonTextEnabled : styles.saveButtonTextDisabled]}>
          Add transaction
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayXl, marginBottom: 18, color: colors.ink },
  label: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 8,
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
  amountInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontFamily: typography.fontFamily.sans, fontSize: typography.size.xl, color: colors.ink },
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
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 8 },
  subChipsRow: { marginTop: 10, gap: 8 },
  saveButton: { marginTop: 20, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  saveButtonEnabled: { backgroundColor: colors.ink },
  saveButtonDisabled: { backgroundColor: colors.ink16 },
  saveButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg },
  saveButtonTextEnabled: { color: colors.onDark },
  saveButtonTextDisabled: { color: colors.ink35 },
});
