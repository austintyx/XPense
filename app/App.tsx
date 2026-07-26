import { DMSans_400Regular, DMSans_500Medium, useFonts as useDMSansFonts } from "@expo-google-fonts/dm-sans";
import { InstrumentSerif_400Regular, useFonts as useInstrumentSerifFonts } from "@expo-google-fonts/instrument-serif";
import { JetBrainsMono_400Regular, useFonts as useJetBrainsMonoFonts } from "@expo-google-fonts/jetbrains-mono";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RootNavigator } from "./src/navigation/RootNavigator";
import { ToastProvider } from "./src/components/Toast";
import { TransactionsProvider } from "./src/store/TransactionsProvider";
import { colors } from "./src/theme/tokens";

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
        <TransactionsProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="dark" />
          </NavigationContainer>
        </TransactionsProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
