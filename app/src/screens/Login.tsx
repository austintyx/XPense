import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { buildAuthUrl, type Provider } from "../api/client";
import { useToast } from "../components/Toast";
import { useAuth } from "../store/AuthProvider";
import { colors, radii, spacing, typography } from "../theme/tokens";

WebBrowser.maybeCompleteAuthSession();

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Continue with Gmail",
  microsoft: "Continue with Outlook",
};

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const [connecting, setConnecting] = useState<Provider | null>(null);

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

      const queryString = result.url.split("?")[1] ?? "";
      const userId = new URLSearchParams(queryString).get("user_id");
      if (!userId) {
        showToast("Something went wrong connecting your account");
        return;
      }
      await login(Number(userId));
    } finally {
      setConnecting(null);
    }
  };

  return (
    <View style={styles.container} testID="login-screen">
      <View style={styles.content}>
        <Text style={styles.title}>XPense</Text>
        <Text style={styles.subtitle}>
          Connect your email and we'll turn your bank alerts into a spending picture automatically.
        </Text>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, justifyContent: "center" },
  content: { paddingHorizontal: spacing.screenH },
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
  buttons: { gap: 12 },
  connectButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.card - 2,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  connectButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.onDark },
});
