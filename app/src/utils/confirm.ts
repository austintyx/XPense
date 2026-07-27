import { Alert, Platform } from "react-native";

interface ConfirmDestructiveOptions {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

// react-native-web has no real multi-button Alert.alert implementation, so the web branch falls
// back to window.confirm -- which only supports one message and OK/Cancel, collapsing the
// destructive/cancel styling into "same function, different chrome."
export function confirmDestructive({ title, message, confirmLabel, onConfirm }: ConfirmDestructiveOptions): void {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
