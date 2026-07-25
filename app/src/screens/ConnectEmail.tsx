import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, StyleSheet, Text, View } from "react-native";

import { buildAuthUrl, getLinkedAccounts, type EmailAccount, type Provider } from "../api/client";

WebBrowser.maybeCompleteAuthSession();

const PROVIDERS: Provider[] = ["google", "microsoft"];

const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Connect Gmail",
  microsoft: "Connect Outlook",
};

export default function ConnectEmail() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setAccounts(await getLinkedAccounts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load linked accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = useCallback(
    async (provider: Provider) => {
      setConnecting(provider);
      try {
        const redirectUri = AuthSession.makeRedirectUri();
        const authUrl = buildAuthUrl(provider, redirectUri);
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
        if (result.type === "success") {
          await refresh();
        }
      } finally {
        setConnecting(null);
      }
    },
    [refresh],
  );

  return (
    <View style={styles.container} testID="connect-email-screen">
      <Text style={styles.title}>Connect Email</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        PROVIDERS.map((provider) => {
          const linkedAccount = accounts.find((account) => account.provider === provider);
          return (
            <View key={provider} style={styles.row}>
              <Button
                title={PROVIDER_LABELS[provider]}
                onPress={() => connect(provider)}
                disabled={connecting !== null}
              />
              <Text style={styles.status}>
                {linkedAccount ? `Connected as ${linkedAccount.provider_email}` : "Not connected"}
              </Text>
            </View>
          );
        })
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 24,
  },
  row: {
    marginBottom: 20,
  },
  status: {
    color: "#555",
    marginTop: 6,
  },
  error: {
    color: "red",
    marginTop: 16,
  },
});
