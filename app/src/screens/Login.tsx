import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiError, buildAuthUrl, loginWithPassword, registerAccount, syncTransactions, type Provider } from "../api/client";
import { SyncBackfillSheet } from "../components/SyncBackfillSheet";
import { useToast } from "../components/Toast";
import { useAuth } from "../store/AuthProvider";
import { colors, radii, spacing, typography } from "../theme/tokens";

WebBrowser.maybeCompleteAuthSession();

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Continue with Gmail",
  microsoft: "Continue with Outlook",
};

type FormMode = "signin" | "register";

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [backfillPrompt, setBackfillPrompt] = useState<{ userId: number; provider: Provider } | null>(null);

  const [mode, setMode] = useState<FormMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmitForm = email.trim().length > 0 && password.length > 0;

  const submitForm = async () => {
    if (!canSubmitForm) return;
    setSubmitting(true);
    try {
      const user =
        mode === "signin"
          ? await loginWithPassword(email.trim(), password)
          : await registerAccount(email.trim(), password, name.trim() || undefined);
      await login(user.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong -- try again");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "register" : "signin"));
  };

  const connect = async (provider: Provider) => {
    setConnecting(provider);
    try {
      const redirectUri = AuthSession.makeRedirectUri();
      const authUrl = buildAuthUrl(provider, redirectUri);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type !== "success") {
        // The user backed out of the consent screen, or the backend errored before ever
        // issuing a redirect -- either way there's no result.url to parse. This is the only
        // screen in the app right now, so a silent no-op here would strand the user with no
        // way forward; show them something and let them try again.
        showToast("Connection cancelled");
        return;
      }

      const params = new URLSearchParams(result.url.split("?")[1] ?? "");
      const userId = params.get("user_id");
      if (!userId) {
        showToast("Something went wrong connecting your account");
        return;
      }

      if (params.get("is_new_account") === "true") {
        // Don't log in yet -- offer the backfill sheet first, which itself calls login() once
        // the person picks Sync or Skip.
        setBackfillPrompt({ userId: Number(userId), provider });
        return;
      }
      await login(Number(userId));
    } finally {
      setConnecting(null);
    }
  };

  const handleSync = async (since: string) => {
    if (!backfillPrompt) return;
    try {
      await syncTransactions(backfillPrompt.userId, since);
    } catch {
      // The account itself already connected successfully -- a best-effort backfill failing
      // must never strand an already-connected user on this screen.
      showToast("Couldn't sync past transactions, but your account is connected");
    }
    const { userId } = backfillPrompt;
    setBackfillPrompt(null);
    await login(userId);
  };

  const handleSkip = async () => {
    if (!backfillPrompt) return;
    const { userId } = backfillPrompt;
    setBackfillPrompt(null);
    await login(userId);
  };

  return (
    <View style={styles.container} testID="login-screen">
      <View style={styles.content}>
        <Text style={styles.title}>XPense</Text>
        <Text style={styles.subtitle}>
          {mode === "signin" ? "Sign in to your account." : "Create an account -- you can connect an email for automatic tracking anytime after."}
        </Text>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            testID="login-email"
          />
          {mode === "register" && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name (optional)"
              style={styles.input}
              testID="login-name"
            />
          )}
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            testID="login-password"
          />
          <Pressable
            style={[styles.connectButton, !canSubmitForm && styles.connectButtonDisabled]}
            onPress={submitForm}
            disabled={!canSubmitForm || submitting}
            testID="login-submit"
          >
            {submitting ? (
              <ActivityIndicator color={colors.onDark} />
            ) : (
              <Text style={styles.connectButtonText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
            )}
          </Pressable>
          <Text style={styles.toggleLink} onPress={toggleMode} testID="login-toggle-mode">
            {mode === "signin" ? "Create an account" : "Sign in instead"}
          </Text>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.buttons}>
          {(["google", "microsoft"] as Provider[]).map((provider) => (
            <Pressable
              key={provider}
              style={styles.connectButton}
              onPress={() => connect(provider)}
              disabled={connecting !== null}
              testID={`login-connect-${provider}`}
            >
              {connecting === provider ? (
                <ActivityIndicator color={colors.onDark} />
              ) : (
                <Text style={styles.connectButtonText}>{PROVIDER_LABELS[provider]}</Text>
              )}
            </Pressable>
          ))}
        </View>
      </View>
      <SyncBackfillSheet
        visible={backfillPrompt !== null}
        provider={backfillPrompt?.provider ?? "google"}
        onSync={handleSync}
        onSkip={handleSkip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, justifyContent: "center" },
  content: {
    paddingHorizontal: spacing.screenH,
    ...(Platform.OS === "web" ? { maxWidth: 420, width: "100%" as const, alignSelf: "center" as const } : null),
  },
  title: {
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.heading,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.base5,
    color: colors.ink55,
    textAlign: "center",
    marginBottom: spacing.xxl,
  },
  form: { gap: 10, marginBottom: spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: radii.card - 2,
    paddingVertical: 13,
    paddingHorizontal: 15,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.base5,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  toggleLink: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.sm5,
    color: colors.ink55,
    textAlign: "center",
    marginTop: 2,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.ink14 },
  dividerText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink45 },
  buttons: { gap: 12 },
  connectButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.card - 2,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  connectButtonDisabled: { backgroundColor: colors.ink16 },
  connectButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.onDark },
});
