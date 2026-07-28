import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { CategoryChip } from "../components/CategoryChip";
import { DateField } from "../components/DateField";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { colors, typography } from "../theme/tokens";
import type { Frequency } from "../api/client";

interface AddSubscriptionSheetProps {
  visible: boolean;
  onClose: () => void;
}

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export function AddSubscriptionSheet({ visible, onClose }: AddSubscriptionSheetProps) {
  const { addSubscription } = useAppData();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextDue, setNextDue] = useState(new Date());

  const reset = () => {
    setName("");
    setAmount("");
    setFrequency("monthly");
    setNextDue(new Date());
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSave = name.trim().length > 0 && amount.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    await addSubscription(name.trim(), amount.trim(), frequency, nextDue.toISOString());
    showToast(`Added ${name.trim()}`);
    reset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} testID="add-subscription-sheet">
      <Text style={styles.title}>Add a subscription</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Netflix"
        style={styles.textInput}
        testID="sub-name"
      />

      <Text style={styles.label}>Amount</Text>
      <View style={styles.amountBox}>
        <Text style={styles.currencyPrefix}>S$</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          style={styles.amountInput}
          testID="sub-amount"
        />
      </View>

      <Text style={styles.label}>Repeats</Text>
      <View style={styles.chipsRow}>
        {FREQUENCY_OPTIONS.map((opt) => (
          <CategoryChip
            key={opt.value}
            label={opt.label}
            active={frequency === opt.value}
            onPress={() => setFrequency(opt.value)}
            testID={`sub-freq-${opt.value}`}
          />
        ))}
      </View>

      <Text style={styles.label}>Next due</Text>
      <View style={styles.dateBox}>
        <DateField testID="sub-next-due" value={nextDue} onChange={setNextDue} />
      </View>

      <Pressable
        onPress={save}
        disabled={!canSave}
        style={[styles.saveButton, canSave ? styles.saveButtonEnabled : styles.saveButtonDisabled]}
        testID="save-subscription"
      >
        <Text style={[styles.saveButtonText, canSave ? styles.saveButtonTextEnabled : styles.saveButtonTextDisabled]}>
          Add subscription
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
  amountInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontFamily: typography.fontFamily.sans, fontSize: typography.size.xl, color: colors.ink },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 14 },
  dateBox: {
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  saveButton: { marginTop: 6, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  saveButtonEnabled: { backgroundColor: colors.ink },
  saveButtonDisabled: { backgroundColor: colors.ink16 },
  saveButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg },
  saveButtonTextEnabled: { color: colors.onDark },
  saveButtonTextDisabled: { color: colors.ink35 },
});
