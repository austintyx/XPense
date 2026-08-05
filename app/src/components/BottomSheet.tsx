import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

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
          {/* maxHeight on `sheet` above only caps the box's own size -- RN doesn't clip or scroll
              overflowing children on its own, so without this ScrollView, tall content (e.g. every
              chip row expanded at once) pushes the trailing save button off-screen with no way to
              reach it. flex: 1 lets this properly become scrollable once `sheet` hits its cap;
              short content still sizes naturally, unchanged from before. */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
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
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    backgroundColor: colors.surfaceSheet,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    // Clips the ScrollView's content to the rounded top corners while scrolling -- without this,
    // content can visually bleed past them mid-scroll.
    overflow: "hidden",
    paddingTop: 12,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink16,
    alignSelf: "center",
    marginBottom: spacing.xl,
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 34,
  },
});
