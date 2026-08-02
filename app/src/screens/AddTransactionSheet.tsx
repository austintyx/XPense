import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryChip } from "../components/CategoryChip";
import { DateField } from "../components/DateField";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColorChip, colors, typography } from "../theme/tokens";
import { allCategories, countryForCurrency, CURRENCY_COUNTRY, formatMoney, mergedSubcategories } from "../utils/derive";

const CURRENCIES = Object.keys(CURRENCY_COUNTRY);

interface AddTransactionSheetProps {
  visible: boolean;
  onClose: () => void;
}

const DIRECTION_OPTIONS = [
  { value: "debit", label: "Expense" },
  { value: "credit", label: "Income" },
] as const;

export function AddTransactionSheet({ visible, onClose }: AddTransactionSheetProps) {
  const { addTransaction, user, customCategories, customSubcategories } = useAppData();
  const { showToast } = useToast();
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(new Date());
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState("SGD");
  const [currencyExpanded, setCurrencyExpanded] = useState(false);
  const [country, setCountry] = useState("");

  const categories = useMemo(() => allCategories(customCategories, direction), [customCategories, direction]);
  const subcategories = category ? mergedSubcategories(category, customSubcategories) : [];

  const reset = () => {
    setDirection("debit");
    setAmount("");
    setMerchant("");
    setDate(new Date());
    setCategory(null);
    setSubcategory(null);
    setCurrency("SGD");
    setCurrencyExpanded(false);
    setCountry("");
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
      currency,
      direction,
      merchant_raw: merchant,
      merchant_clean: merchant,
      category,
      subcategory: subcategories.length > 0 ? subcategory : null,
      txn_at: txnAt.toISOString(),
      country: category === "Travel" ? country.trim() || null : null,
    });
    showToast(`Added ${formatMoney(amount)} · ${merchant}`);
    reset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} testID="add-transaction-sheet">
      <Text style={styles.title}>Add a transaction</Text>

      <View style={styles.typeRow}>
        {DIRECTION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => {
              // The category lists differ by direction -- a category picked under the old
              // direction may not exist in the new one, so don't carry it over.
              setDirection(opt.value);
              setCategory(null);
              setSubcategory(null);
              setCountry("");
            }}
            style={[styles.typeOption, direction === opt.value && styles.typeOptionActive]}
            testID={`draft-type-${opt.value}`}
          >
            <Text style={[styles.typeOptionText, direction === opt.value && styles.typeOptionTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountBox}>
        <Pressable
          onPress={() => setCurrencyExpanded((v) => !v)}
          style={styles.currencyToggle}
          testID="draft-currency-toggle"
        >
          <Text style={styles.currencyPrefix}>{currency === "SGD" ? "S$" : currency}</Text>
        </Pressable>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          style={styles.amountInput}
          testID="draft-amount"
        />
      </View>

      {currencyExpanded && (
        <View style={[styles.chipsRow, styles.subChipsRow]}>
          {CURRENCIES.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              size="small"
              active={currency === c}
              onPress={() => {
                setCurrency(c);
                setCurrencyExpanded(false);
                // Overseas spend gets its own Travel category with its own subcategory list --
                // a category picked under SGD may not fit anymore, so default (not force) into
                // Travel, mirroring the direction toggle's exact reset pattern below.
                if (c !== "SGD") {
                  setCategory("Travel");
                  setCountry((prev) => prev || countryForCurrency(c));
                } else if (category === "Travel") {
                  setCategory(null);
                }
                setSubcategory(null);
              }}
              testID={`draft-currency-${c}`}
            />
          ))}
        </View>
      )}

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
              if (c === "Travel") {
                setCountry((prev) => prev || countryForCurrency(currency));
              }
            }}
            testID={`draft-cat-${c}`}
          />
        ))}
      </View>

      {category === "Travel" && (
        <>
          <Text style={styles.label}>Country</Text>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder="e.g. Japan"
            style={styles.textInput}
            testID="draft-country"
          />
        </>
      )}

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
  currencyToggle: { paddingVertical: 4 },
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
