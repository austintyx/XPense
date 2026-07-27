import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "../theme/tokens";

const DIALOG_EASING = Easing.out(Easing.ease);

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
}

// Web gets a centered dialog instead of native's slide-up sheet -- same props contract as
// BottomSheet.tsx, so CategorizeSheet/AddTransactionSheet/SyncBackfillSheet need no changes to
// pick this up automatically on web builds.
export function BottomSheet({ visible, onClose, children, testID }: BottomSheetProps) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(6)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      cardOpacity.setValue(0);
      cardTranslateY.setValue(6);
      scrimOpacity.setValue(0);
      Animated.timing(scrimOpacity, { toValue: 1, duration: 200, easing: DIALOG_EASING, useNativeDriver: true }).start();
      Animated.timing(cardOpacity, { toValue: 1, duration: 250, easing: DIALOG_EASING, useNativeDriver: true }).start();
      Animated.timing(cardTranslateY, { toValue: 0, duration: 250, easing: DIALOG_EASING, useNativeDriver: true }).start();
    }
  }, [visible, cardOpacity, cardTranslateY, scrimOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay} testID={testID}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]} />
        </Pressable>
        {/* Rendered after the scrim Pressable, so taps inside the card don't bubble to it and
            close the dialog -- same sibling-order trick the native slide-up sheet already relies on. */}
        <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrim: { backgroundColor: colors.scrim },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "86%",
    backgroundColor: colors.surfaceSheet,
    borderRadius: radii.sheet,
    padding: spacing.xxl,
    marginHorizontal: spacing.xxl,
    shadowColor: "#1B1A17",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 12,
  },
});
