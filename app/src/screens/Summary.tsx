import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart } from "react-native-chart-kit";

import { getSummary, type Summary as SummaryData } from "../api/client";

const chartConfig = {
  backgroundColor: "#ffffff",
  backgroundGradientFrom: "#ffffff",
  backgroundGradientTo: "#ffffff",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(60, 60, 60, ${opacity})`,
};

export default function Summary() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await getSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const categories = summary?.categories ?? [];
  const chartWidth = Dimensions.get("window").width - 32;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      testID="summary-screen"
    >
      {error && <Text style={styles.error}>{error}</Text>}
      {summary && (
        <>
          <Text style={styles.title}>{summary.month}</Text>
          <Text style={styles.total}>Total: {summary.total}</Text>

          {categories.length === 0 ? (
            <Text style={styles.empty}>No expenses this month</Text>
          ) : (
            <BarChart
              data={{
                labels: categories.map((c) => c.category ?? "Other"),
                datasets: [{ data: categories.map((c) => Number(c.total)) }],
              }}
              width={chartWidth}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero
              chartConfig={chartConfig}
              style={styles.chart}
            />
          )}

          {categories.map((c) => (
            <View key={c.category ?? "other"} style={styles.row}>
              <Text style={styles.category}>{c.category ?? "Uncategorized"}</Text>
              <Text style={styles.categoryTotal}>{c.total}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "red", marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "600" },
  total: { fontSize: 16, color: "#555", marginBottom: 16 },
  empty: { color: "#888", marginTop: 24 },
  chart: { marginVertical: 8, borderRadius: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  category: { fontSize: 16 },
  categoryTotal: { fontSize: 16, fontWeight: "500" },
});
