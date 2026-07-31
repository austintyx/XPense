import { DMSans_400Regular, DMSans_500Medium, useFonts as useDMSansFonts } from "@expo-google-fonts/dm-sans";
import { InstrumentSerif_400Regular, useFonts as useInstrumentSerifFonts } from "@expo-google-fonts/instrument-serif";
import { JetBrainsMono_400Regular, useFonts as useJetBrainsMonoFonts } from "@expo-google-fonts/jetbrains-mono";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RootNavigator } from "./src/navigation/RootNavigator";
import Login from "./src/screens/Login";
import { ToastProvider } from "./src/components/Toast";
import { AuthProvider, useAuth } from "./src/store/AuthProvider";
import { TransactionsProvider, useAppData } from "./src/store/TransactionsProvider";
import { colors, radii, spacing, typography } from "./src/theme/tokens";

function SessionErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={sessionErrorStyles.container} testID="session-error">
      <Text style={sessionErrorStyles.title}>Couldn't reach the server</Text>
      <Text style={sessionErrorStyles.body}>
        This can happen right after the app has been idle for a while. Your account is still
        connected -- just try again.
      </Text>
      <Pressable style={sessionErrorStyles.button} onPress={onRetry} testID="session-error-retry">
        <Text style={sessionErrorStyles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const sessionErrorStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", padding: spacing.screenH },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayLg, color: colors.ink, marginBottom: 10, textAlign: "center" },
  body: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink55, textAlign: "center", marginBottom: spacing.xxl },
  button: { backgroundColor: colors.ink, borderRadius: radii.card - 2, paddingVertical: 15, paddingHorizontal: 34, minHeight: 52, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.lg, color: colors.onDark },
});

function ConnectingScreen({ testID }: { testID: string }) {
  return (
    <View style={connectingStyles.container} testID={testID}>
      <ActivityIndicator color={colors.ink} size="large" />
      <Text style={connectingStyles.text}>Connecting…</Text>
    </View>
  );
}

const connectingStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", gap: 14 },
  text: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink55 },
});

function AuthenticatedApp() {
  const { loading } = useAppData();

  if (loading) {
    return <ConnectingScreen testID="app-loading" />;
  }

  return (
    <NavigationContainer>
      <RootNavigator />
      <StatusBar style="dark" />
    </NavigationContainer>
  );
}

function AppContent() {
  const { ready, userId, sessionError, retryAuth } = useAuth();

  if (!ready) {
    return <ConnectingScreen testID="auth-loading" />;
  }

  if (sessionError) {
    return <SessionErrorScreen onRetry={retryAuth} />;
  }

  if (userId === null) {
    return <Login />;
  }

  return (
    <TransactionsProvider>
      <AuthenticatedApp />
    </TransactionsProvider>
  );
}

export default function App() {
  const [dmSansLoaded] = useDMSansFonts({ DMSans_400Regular, DMSans_500Medium });
  const [instrumentSerifLoaded] = useInstrumentSerifFonts({ InstrumentSerif_400Regular });
  const [jetBrainsMonoLoaded] = useJetBrainsMonoFonts({ JetBrainsMono_400Regular });

  if (!dmSansLoaded || !instrumentSerifLoaded || !jetBrainsMonoLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} testID="fonts-loading" />;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
