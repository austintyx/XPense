import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useToast } from "../components/Toast";
import { colors, friendAvatarBg, friendAvatarText, radii, shadow, spacing, typography } from "../theme/tokens";

interface Friend {
  name: string;
  initials: string;
  hue: number;
  goal: string;
  spent: string;
  pct: number;
  status: string;
}

const FRIENDS: Friend[] = [
  { name: "Marcus Lee", initials: "ML", hue: 158, goal: "Emergency fund · S$5,000", spent: "S$1,120", pct: 0.42, status: "Under budget" },
  { name: "Priya Nair", initials: "PN", hue: 78, goal: "New laptop · S$2,400", spent: "S$2,090", pct: 0.91, status: "Close to limit" },
  { name: "Jun Hao", initials: "JH", hue: 300, goal: "Wedding fund · S$12,000", spent: "S$860", pct: 0.31, status: "Under budget" },
];

export default function Circle() {
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  const nudge = (name: string) => {
    setNudged((cur) => ({ ...cur, [name]: true }));
    showToast(`Nudged ${name.split(" ")[0]}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="circle-screen">
      <Text style={styles.backLink} onPress={() => navigation.goBack()} testID="circle-back">
        ‹ Settings
      </Text>
      <Text style={styles.title}>Circle</Text>
      <Text style={styles.privacy}>
        Three friends can see your monthly spend and goal progress. They cannot see individual transactions.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryEyebrow}>THIS MONTH, TOGETHER</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryNumber}>3 of 4</Text>
          <Text style={styles.summarySub}>under budget</Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {FRIENDS.map((f) => (
          <View key={f.name} style={[styles.friendCard, shadow.card]} testID={`friend-${f.initials}`}>
            <View style={styles.friendHeaderRow}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: friendAvatarBg(f.hue) },
                ]}
              >
                <Text style={[styles.avatarText, { color: friendAvatarText(f.hue) }]}>{f.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.friendName}>{f.name}</Text>
                <Text style={styles.friendGoal}>{f.goal}</Text>
              </View>
              <Text
                style={[styles.nudgeButton, nudged[f.name] && styles.nudgeButtonSent]}
                onPress={() => nudge(f.name)}
                testID={`nudge-${f.initials}`}
              >
                {nudged[f.name] ? "Sent" : "Nudge"}
              </Text>
            </View>
            <View style={styles.friendTrack}>
              <View
                style={[
                  styles.friendBar,
                  { width: `${f.pct * 100}%`, backgroundColor: f.pct > 0.85 ? colors.over : colors.success },
                ]}
              />
            </View>
            <View style={styles.friendFooterRow}>
              <Text style={styles.friendFooterText}>{f.spent} spent</Text>
              <Text style={styles.friendFooterText}>{f.status}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>Invite someone</Text>
        <Text style={styles.inviteSub}>They see totals and goals. Never merchants.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.screenTop, paddingBottom: 40 },
  backLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink55, marginBottom: 18 },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, marginBottom: 6, color: colors.ink },
  privacy: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink55, marginBottom: 22, maxWidth: 290 },
  summaryCard: { backgroundColor: colors.ink, borderRadius: radii.card + 2, padding: 20, marginBottom: 16 },
  summaryEyebrow: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.sm,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.onDark50,
    marginBottom: 12,
  },
  summaryRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  summaryNumber: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberMd, color: colors.onDark },
  summarySub: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.onDark60 },
  friendCard: { backgroundColor: colors.surface, borderRadius: radii.card, padding: 16 },
  friendHeaderRow: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 13 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.base5 },
  friendName: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.lg, color: colors.ink },
  friendGoal: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink50, marginTop: 3 },
  nudgeButton: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.sm5,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 13,
    overflow: "hidden",
  },
  nudgeButtonSent: { color: colors.ink40, backgroundColor: colors.ink04 },
  friendTrack: { height: 7, borderRadius: 4, backgroundColor: colors.track, overflow: "hidden" },
  friendBar: { height: 7, borderRadius: 4 },
  friendFooterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  friendFooterText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink50 },
  inviteCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.ink20,
    borderStyle: "dashed",
    borderRadius: radii.card,
    padding: 20,
    alignItems: "center",
  },
  inviteTitle: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, marginBottom: 4, color: colors.ink },
  inviteSub: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink50 },
});
