import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryChip } from "../components/CategoryChip";
import { DateField } from "../components/DateField";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColorChip, colors, typography } from "../theme/tokens";
import { allCategories, formatMoney, mergedSubcategories } from "../utils/derive";

interface AddTransactionSheetProps {
  visible: boolean;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

export function AddTransactionSheet({ visible, onClose }: AddTransactionSheetProps) {
  const { addTransaction, user, customCategories, customSubcategories } = useAppData();
  const { showToast } = useToast();
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(new Date());
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);

  const categories = useMemo(() => allCategories(customCategories), [customCategories]);
  const subcategories = category ? mergedSubcategories(category, customSubcategories) : [];

  const reset = () => {
    setType("expense");
    setAmount("");
    setMerchant("");
    setDate(new Date());
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
    const now = new Date();
    const txnAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    await addTransaction({
      user_id: user?.id ?? 1,
      amount,
      type,
      direction: type === "income" ? "credit" : "debit",
      merchant_raw: merchant,
      merchant_clean: merchant,
      category,
      subcategory: subcategories.length > 0 ? subcategory : null,
      txn_at: txnAt.toISOString(),
    });
    showToast(`Added ${formatMoney(amount)} · ${merchant}`);
    reset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} testID="add-transaction-sheet">
      <Text style={styles.title}>Add a transaction</Text>

      <View style={styles.typeRow}>
        {TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => setType(opt.value)}
            style={[styles.typeOption, type === opt.value && styles.typeOptionActive]}
            testID={`draft-type-${opt.value}`}
          >
            <Text style={[styles.typeOptionText, type === opt.value && styles.typeOptionTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

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

      <Text style={styles.label}>Date</Text>
      <View style={styles.dateBox}>
        <DateField testID="draft-date" value={date} maximumDate={new Date()} onChange={setDate} />
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
        {categories.map((c) => (
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

      {subcategories.length > 0 && (
        <View style={[styles.chipsRow, styles.subChipsRow]}>
          {subcategories.map((sub) => (
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
  typeRow: { flexDirection: "row", gap: 9, marginBottom: 18 },
  typeOption: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  typeOptionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  typeOptionText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.ink },
  typeOptionTextActive: { color: colors.onDark },
  dateBox: {
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
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
