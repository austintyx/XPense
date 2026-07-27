import { StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../theme/tokens";

// Placeholder -- real per-category budgets, savings goal, and subscriptions content lands in a
// follow-up commit (this file exists now just so MainTabs.web.tsx has a 5th screen to register).
export default function Budgets() {
  return (
    <View style={styles.container} testID="budgets-screen">
      <Text style={styles.text}>Budgets — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink50 },
});
