import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "../theme/tokens";

const SHEET_EASING = Easing.bezier(0.22, 1, 0.36, 1);

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  testID?: string;
}

export function BottomSheet({ visible, onClose, children, testID }: BottomSheetProps) {
  const translateY = useRef(new Animated.Value(400)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(400);
      scrimOpacity.setValue(0);
      Animated.timing(scrimOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        easing: SHEET_EASING,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY, scrimOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} testID={testID}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]} />
        </Pressable>
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    maxHeight: "82%",
    backgroundColor: colors.surfaceSheet,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 12,
    paddingHorizontal: spacing.xxl,
    paddingBottom: 34,
    // On a wide browser window a full-bleed sheet spans the entire viewport -- cap and center it
    // instead. Native keeps the plain edge-to-edge left:0/right:0 sheet.
    ...(Platform.OS === "web"
      ? { left: undefined, right: undefined, maxWidth: 480, width: "100%" as const, alignSelf: "center" as const }
      : { left: 0, right: 0 }),
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink16,
    alignSelf: "center",
    marginBottom: spacing.xl,
  },
});
