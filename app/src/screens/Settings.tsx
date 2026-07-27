import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { CURRENT_USER_ID, buildAuthUrl, syncTransactions, type Provider } from "../api/client";
import { SyncBackfillSheet } from "../components/SyncBackfillSheet";
import { useToast } from "../components/Toast";
import { useAuth } from "../store/AuthProvider";
import { useAppData } from "../store/TransactionsProvider";
import { colors, radii, shadow, spacing, typography } from "../theme/tokens";
import { confirmDestructive } from "../utils/confirm";
import { currentMonthTransactions, formatMoney, initialsOf } from "../utils/derive";

WebBrowser.maybeCompleteAuthSession();

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Connect Gmail",
  microsoft: "Connect Outlook",
};

export default function Settings() {
  const navigation = useNavigation<any>();
  const {
    user,
    accounts,
    budget,
    goal,
    transactions,
    updateName,
    updateBudget,
    updateGoal,
    refetch,
    removeAccount,
    loading,
  } = useAppData();
  const { showToast } = useToast();
  const { logout } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [backfillProvider, setBackfillProvider] = useState<Provider | null>(null);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalNameDraft, setGoalNameDraft] = useState("");
  const [goalTargetDraft, setGoalTargetDraft] = useState("");
  const [goalSavedDraft, setGoalSavedDraft] = useState("");

  const [prefs, setPrefs] = useState({ auto: true, digest: true, roundup: false, alerts: true });

  const monthTransactions = useMemo(() => currentMonthTransactions(transactions), [transactions]);

  const connect = async (provider: Provider) => {
    setConnecting(provider);
    try {
      const redirectUri = AuthSession.makeRedirectUri();
      // Linking an additional mailbox to the already-logged-in user -- unlike Login.tsx's
      // connect flow, this must pass the current user_id explicitly (buildAuthUrl no longer
      // defaults it), otherwise the backend would treat this as a fresh login/signup instead.
      const authUrl = buildAuthUrl(provider, redirectUri, CURRENT_USER_ID);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === "success") {
        await refetch();
        const params = new URLSearchParams(result.url.split("?")[1] ?? "");
        if (params.get("is_new_account") === "true") {
          setBackfillProvider(provider);
        }
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleBackfillSync = async (since: string) => {
    try {
      await syncTransactions(CURRENT_USER_ID, since);
    } catch {
      showToast("Couldn't sync past transactions");
    }
    setBackfillProvider(null);
    await refetch();
  };

  const handleBackfillSkip = () => {
    setBackfillProvider(null);
  };

  const confirmSignOut = () => {
    confirmDestructive({
      title: "Sign out?",
      message: "You'll need to reconnect an account to use the app again.",
      confirmLabel: "Sign out",
      onConfirm: () => logout(),
    });
  };

  const confirmRemoveAccount = (accountId: number, email: string) => {
    confirmDestructive({
      title: "Unlink account?",
      message: `Unlink ${email}? Your past transactions from this account will stay.`,
      confirmLabel: "Unlink",
      onConfirm: async () => {
        await removeAccount(accountId);
        showToast(`Unlinked ${email}`);
      },
    });
  };

  const saveName = async () => {
    if (!nameDraft.trim()) return;
    await updateName(nameDraft.trim());
    setEditingName(false);
    showToast("Name updated");
  };

  const saveBudget = async () => {
    if (!budgetDraft.trim()) return;
    await updateBudget(budgetDraft.trim());
    setEditingBudget(false);
    showToast("Budget updated");
  };

  const saveGoal = async () => {
    if (!goalNameDraft.trim() || !goalTargetDraft.trim() || !goalSavedDraft.trim()) return;
    await updateGoal({ name: goalNameDraft.trim(), target_amount: goalTargetDraft.trim(), saved_amount: goalSavedDraft.trim() });
    setEditingGoal(false);
    showToast("Goal updated");
  };

  if (loading || !budget || !goal) {
    return <View style={styles.container} testID="settings-screen" />;
  }

  const linkedProviders = new Set(accounts.map((a) => a.provider));
  const unlinkedProviders = (["google", "microsoft"] as Provider[]).filter((p) => !linkedProviders.has(p));

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="settings-screen">
        <Text style={styles.title}>Settings</Text>

        <View style={styles.columns}>
          <View style={styles.column}>
              <View style={[styles.card, styles.profileCard, shadow.card]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsOf(user?.name ?? null)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fullName}>{user?.name ?? user?.email ?? ""}</Text>
                  <Text style={styles.metaText}>
                    Member since {user?.created_at ? new Date(user.created_at).getFullYear() : ""} · SGD
                  </Text>
                </View>
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => {
                    setNameDraft(user?.name ?? "");
                    setEditingName(!editingName);
                  }}
                  testID="edit-name-toggle"
                >
                  <Text style={styles.outlineButtonText}>{editingName ? "Close" : "Edit"}</Text>
                </Pressable>
              </View>

              {editingName && (
                <View style={[styles.card, styles.editPanel, shadow.card]}>
                  <Text style={styles.label}>Display name</Text>
                  <TextInput value={nameDraft} onChangeText={setNameDraft} style={styles.input} testID="name-input" />
                  <Pressable style={styles.saveButton} onPress={saveName} testID="save-name">
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.groupLabel}>WHERE TRANSACTIONS COME FROM</Text>
              <View style={[styles.card, styles.group, shadow.card]}>
                {accounts.map((account) => {
                  const count = monthTransactions.filter((t) => t.provider === account.provider).length;
                  return (
                    <View key={account.id} style={styles.sourceRow}>
                      <View style={styles.statusDotActive} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sourceLabel} numberOfLines={1}>
                          {account.provider_email}
                        </Text>
                        <Text style={styles.sourceMeta}>Receipt emails · {count} found this month</Text>
                      </View>
                      <Text
                        style={styles.linkText}
                        onPress={() => connect(account.provider)}
                        testID={`change-${account.provider}`}
                      >
                        Change
                      </Text>
                      <Text
                        style={styles.removeLinkText}
                        onPress={() => confirmRemoveAccount(account.id, account.provider_email)}
                        testID={`remove-${account.id}`}
                      >
                        Remove
                      </Text>
                    </View>
                  );
                })}
                {unlinkedProviders.map((provider) => (
                  <Text
                    key={provider}
                    style={styles.addSourceRow}
                    onPress={() => connect(provider)}
                    testID={`connect-${provider}`}
                  >
                    + {connecting === provider ? "Connecting…" : PROVIDER_LABELS[provider]}
                  </Text>
                ))}
              </View>
          </View>
          <View style={styles.column}>
              <Text style={styles.groupLabel}>BUDGET & GOALS</Text>
              <View style={[styles.card, styles.group, shadow.card]}>
                <View style={styles.sourceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceLabel}>Monthly budget</Text>
                    <Text style={styles.sourceMeta}>{formatMoney(budget.monthly_target, false)} / month</Text>
                  </View>
                  <Text
                    style={styles.linkText}
                    onPress={() => {
                      setBudgetDraft(budget.monthly_target);
                      setEditingBudget(!editingBudget);
                    }}
                    testID="edit-budget-toggle"
                  >
                    {editingBudget ? "Close" : "Edit"}
                  </Text>
                </View>
                <View style={[styles.sourceRow, styles.sourceRowLast]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceLabel}>Savings goal</Text>
                    <Text style={styles.sourceMeta}>
                      {goal.name} · {formatMoney(goal.saved_amount, false)} of {formatMoney(goal.target_amount, false)}
                    </Text>
                  </View>
                  <Text
                    style={styles.linkText}
                    onPress={() => {
                      setGoalNameDraft(goal.name);
                      setGoalTargetDraft(goal.target_amount);
                      setGoalSavedDraft(goal.saved_amount);
                      setEditingGoal(!editingGoal);
                    }}
                    testID="edit-goal-toggle"
                  >
                    {editingGoal ? "Close" : "Edit"}
                  </Text>
                </View>
              </View>

              {Platform.OS === "web" && (
                <Text
                  style={styles.manageBudgetsLink}
                  onPress={() => navigation.navigate("Budgets")}
                  testID="manage-budgets-link"
                >
                  Manage budgets →
                </Text>
              )}

              {editingBudget && (
                <View style={[styles.card, styles.editPanel, shadow.card]}>
                  <Text style={styles.label}>Monthly budget</Text>
                  <TextInput
                    value={budgetDraft}
                    onChangeText={setBudgetDraft}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    testID="budget-input"
                  />
                  <Pressable style={styles.saveButton} onPress={saveBudget} testID="save-budget">
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                </View>
              )}

              {editingGoal && (
                <View style={[styles.card, styles.editPanel, shadow.card]}>
                  <Text style={styles.label}>Goal name</Text>
                  <TextInput value={goalNameDraft} onChangeText={setGoalNameDraft} style={styles.input} testID="goal-name-input" />
                  <Text style={styles.label}>Target amount</Text>
                  <TextInput
                    value={goalTargetDraft}
                    onChangeText={setGoalTargetDraft}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    testID="goal-target-input"
                  />
                  <Text style={styles.label}>Saved so far</Text>
                  <TextInput
                    value={goalSavedDraft}
                    onChangeText={setGoalSavedDraft}
                    keyboardType="decimal-pad"
                    style={styles.input}
                    testID="goal-saved-input"
                  />
                  <Pressable style={styles.saveButton} onPress={saveGoal} testID="save-goal">
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.groupLabel}>PREFERENCES</Text>
              <View style={[styles.card, styles.group, shadow.card]}>
                {(
                  [
                    { key: "auto", label: "Categorise automatically", meta: "Silently. You can always correct it." },
                    { key: "digest", label: "Sunday digest", meta: "One summary, no daily nagging" },
                    { key: "roundup", label: "Round up to savings", meta: `Spare change into the ${goal.name} fund` },
                    { key: "alerts", label: "Alert at 80% of budget", meta: "A heads-up, not an alarm" },
                  ] as const
                ).map((p, i, arr) => (
                  <View key={p.key} style={[styles.sourceRow, i === arr.length - 1 && styles.sourceRowLast]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sourceLabel}>{p.label}</Text>
                      <Text style={styles.sourceMeta}>{p.meta}</Text>
                    </View>
                    <Switch
                      value={prefs[p.key]}
                      onValueChange={(v) => setPrefs((cur) => ({ ...cur, [p.key]: v }))}
                      testID={`pref-${p.key}`}
                    />
                  </View>
                ))}
              </View>

              <Pressable
                style={styles.manageCategoriesCard}
                onPress={() => navigation.navigate("ManageCategories")}
                testID="manage-categories-entry"
              >
                <View style={styles.manageCategoriesDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.circleTitle}>Manage categories</Text>
                  <Text style={styles.circleSub}>Add or edit spending categories</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              <Pressable style={styles.circleCard} onPress={() => navigation.navigate("Circle")} testID="circle-entry">
                <View style={styles.circleAvatars}>
                  <View style={[styles.circleAvatar, { backgroundColor: colors.successAvatarBg }]} />
                  <View style={[styles.circleAvatar, styles.circleAvatarOverlap, { backgroundColor: colors.warnBg }]} />
                  <View style={[styles.circleAvatar, styles.circleAvatarOverlap, { backgroundColor: colors.successTintCard }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.circleTitle}>Spend with friends</Text>
                  <Text style={styles.circleSub}>Share goals, keep each other honest</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              <Text style={styles.signOut} onPress={confirmSignOut} testID="sign-out">
                Sign out
              </Text>
          </View>
        </View>
      </ScrollView>
      <SyncBackfillSheet
        visible={backfillProvider !== null}
        provider={backfillProvider ?? "google"}
        onSync={handleBackfillSync}
        onSkip={handleBackfillSkip}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.screenTop,
    paddingBottom: spacing.screenBottom,
    ...(Platform.OS === "web" ? { maxWidth: 1100, width: "100%" as const, alignSelf: "center" as const } : null),
  },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, marginBottom: 20, color: colors.ink },
  columns: Platform.OS === "web" ? { flexDirection: "row", gap: 16, alignItems: "flex-start" } : {},
  column: Platform.OS === "web" ? { flex: 1 } : {},
  manageBudgetsLink: { marginTop: 10, fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.successText },
  card: { backgroundColor: colors.surface, borderRadius: radii.hero },
  profileCard: { padding: 20, flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.successAvatarBg, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.displaySm, color: colors.successAvatarText },
  fullName: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displaySm, color: colors.ink },
  metaText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink50, marginTop: 3 },
  outlineButton: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.ink14 },
  outlineButtonText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
  editPanel: { marginTop: 10, padding: 16 },
  label: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 11,
    padding: 11,
    paddingHorizontal: 13,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.lg,
    color: colors.ink,
    backgroundColor: colors.surfaceSheet,
    marginBottom: 10,
  },
  saveButton: { backgroundColor: colors.ink, borderRadius: 11, paddingVertical: 11, alignItems: "center" },
  saveButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.onDark },
  groupLabel: {
    marginTop: spacing.xxl,
    marginBottom: 10,
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.sm,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
  },
  group: { overflow: "hidden" },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink06,
  },
  sourceRowLast: { borderBottomWidth: 0 },
  statusDotActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  sourceLabel: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md5, color: colors.ink },
  sourceMeta: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm, color: colors.ink48, marginTop: 2 },
  linkText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.successText },
  removeLinkText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.warnText, marginLeft: 14 },
  addSourceRow: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.md5,
    color: colors.successText,
  },
  manageCategoriesCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: radii.card,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  manageCategoriesDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink08 },
  circleCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.successTintCard,
    borderWidth: 1,
    borderColor: colors.successAvatarBg,
    borderRadius: radii.card,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  circleAvatars: { flexDirection: "row" },
  circleAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.successTintCard },
  circleAvatarOverlap: { marginLeft: -12 },
  circleTitle: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md },
  circleSub: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink55, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.ink40 },
  signOut: {
    marginTop: spacing.xl,
    textAlign: "center",
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.sm,
    color: colors.ink40,
    paddingBottom: 8,
  },
});
