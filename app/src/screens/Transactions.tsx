import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getTransactions, updateTransactionCategory, type Transaction } from "../api/client";
import { CATEGORIES } from "../constants/categories";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const timePart = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

function formatCategory(category: string | null, subcategory: string | null): string {
  if (!category) return "Uncategorized";
  return subcategory ? `${category} (${subcategory})` : category;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTransactions(await getTransactions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const selectCategory = useCallback(async (category: string) => {
    if (!pickerFor) return;
    const updated = await updateTransactionCategory(pickerFor.id, category);
    setTransactions((current) => current.map((txn) => (txn.id === updated.id ? updated : txn)));
    setPickerFor(null);
  }, [pickerFor]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="transactions-screen">
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No expenses yet</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setPickerFor(item)} testID={`transaction-${item.id}`}>
            <View style={styles.rowMain}>
              <Text style={styles.merchant}>{item.merchant_clean ?? item.merchant_raw ?? "Unknown"}</Text>
              <Text style={styles.meta}>
                {formatDateTime(item.txn_at)} · {formatCategory(item.category, item.subcategory)}
              </Text>
            </View>
            <Text style={styles.amount}>
              {item.currency} {item.amount}
            </Text>
          </Pressable>
        )}
      />

      <Modal visible={pickerFor !== null} transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerFor(null)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Categorize</Text>
            {CATEGORIES.map((category) => (
              <Pressable key={category} style={styles.modalOption} onPress={() => selectCategory(category)}>
                <Text style={styles.modalOptionText}>{category}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "red", padding: 16 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  rowMain: { flex: 1 },
  merchant: { fontSize: 16, fontWeight: "500" },
  meta: { color: "#777", marginTop: 2 },
  amount: { fontSize: 16, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  modalOption: { paddingVertical: 12 },
  modalOptionText: { fontSize: 16 },
});
