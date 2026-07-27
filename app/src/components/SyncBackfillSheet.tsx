import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "./BottomSheet";
import { DateField } from "./DateField";
import type { Provider } from "../api/client";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { toDateString } from "../utils/dateSerialization";

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Gmail",
  microsoft: "Outlook",
};

const DEFAULT_DAYS_BACK = 90;

function defaultSinceDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - DEFAULT_DAYS_BACK);
  return date;
}

interface SyncBackfillSheetProps {
  visible: boolean;
  provider: Provider;
  onSync: (since: string) => Promise<void>;
  onSkip: () => void;
}

export function SyncBackfillSheet({ visible, provider, onSync, onSkip }: SyncBackfillSheetProps) {
  const [date, setDate] = useState<Date>(defaultSinceDate);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync(toDateString(date));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onSkip} testID="sync-backfill-sheet">
      <Text style={styles.title}>Sync past transactions?</Text>
      <Text style={styles.subtitle}>
        Pull in older bank alerts from {PROVIDER_LABELS[provider]}, going back to a date you choose.
      </Text>
      <View style={styles.pickerWrap}>
        <DateField testID="sync-backfill-date-picker" value={date} maximumDate={new Date()} onChange={setDate} />
      </View>
      <View style={styles.actionsRow}>
        <Pressable onPress={onSkip} disabled={syncing} style={styles.skipButton} testID="sync-backfill-skip">
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
        <Pressable onPress={handleSync} disabled={syncing} style={styles.syncButton} testID="sync-backfill-sync">
          {syncing ? <ActivityIndicator color={colors.onDark} /> : <Text style={styles.syncText}>Sync</Text>}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayXl, color: colors.ink, marginBottom: 8 },
  subtitle: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink55, marginBottom: 18 },
  pickerWrap: { marginBottom: 20 },
  actionsRow: { flexDirection: "row", gap: 10 },
  skipButton: {
    flex: 1,
    borderRadius: radii.card - 2,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink14,
  },
  skipText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.ink },
  syncButton: {
    flex: 1,
    borderRadius: radii.card - 2,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    minHeight: 52,
  },
  syncText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.onDark },
});
