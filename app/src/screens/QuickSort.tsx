import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { CategoryChip } from "../components/CategoryChip";
import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { categoryColor, colors, radii, shadow, spacing, typography } from "../theme/tokens";
import {
  allCategories,
  convertedAmountLabel,
  deriveSource,
  formatDateTime,
  formatMoney,
  mergedSubcategories,
  uncategorized,
} from "../utils/derive";
import type { Transaction } from "../api/client";

const REASON_HINT = "We couldn't confidently match this merchant — pick a category to help us learn.";
const EXIT_DURATION = 260;
const EXIT_TRANSLATE_X = 480;
const EXIT_EASING = Easing.out(Easing.ease);

interface CardContentProps {
  txn: Transaction;
  editing?: boolean;
  editValue?: string;
  onStartEdit?: () => void;
  onChangeEdit?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
}

function CardContent({ txn, editing, editValue, onStartEdit, onChangeEdit, onSaveEdit, onCancelEdit }: CardContentProps) {
  return (
    <>
      <Text style={styles.cardSource}>{deriveSource(txn).toUpperCase()}</Text>
      {editing ? (
        <View style={styles.editMerchantRow}>
          <TextInput
            value={editValue}
            onChangeText={onChangeEdit}
            style={styles.editMerchantInput}
            autoFocus
            testID="qs-edit-merchant"
          />
          <Text style={styles.editMerchantAction} onPress={onSaveEdit} testID="qs-edit-save">
            Save
          </Text>
          <Text style={[styles.editMerchantAction, styles.editMerchantCancel]} onPress={onCancelEdit} testID="qs-edit-cancel">
            Cancel
          </Text>
        </View>
      ) : (
        <View style={styles.merchantRow}>
          <Text style={styles.cardMerchant} numberOfLines={1}>
            {txn.merchant_clean ?? txn.merchant_raw ?? "Unknown"}
          </Text>
          {onStartEdit && (
            <Text style={styles.editLink} onPress={onStartEdit} testID="qs-edit-merchant-link">
              Edit
            </Text>
          )}
        </View>
      )}
      <Text style={styles.cardWhen}>{formatDateTime(txn.txn_at)}</Text>
      <Text style={styles.cardAmount}>{formatMoney(txn.amount, true, txn.currency)}</Text>
      {convertedAmountLabel(txn) && <Text style={styles.cardConverted}>{convertedAmountLabel(txn)}</Text>}
      <Text style={styles.cardHint}>{REASON_HINT}</Text>
    </>
  );
}

export default function QuickSort() {
  const navigation = useNavigation<any>();
  const { transactions, categorize, editTransaction, customCategories, customSubcategories } = useAppData();
  const { showToast } = useToast();
  const [skipped, setSkipped] = useState<number[]>([]);
  // Pushed to immediately on pick, before categorize()'s network round-trip resolves -- lets the
  // queue advance to the next card the instant the user taps, same technique as `skipped`.
  const [sortedIds, setSortedIds] = useState<number[]>([]);
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const [sortedCount, setSortedCount] = useState(0);
  const [exiting, setExiting] = useState<Transaction | null>(null);
  const exitAnim = useRef(new Animated.Value(0)).current;
  const [editingMerchant, setEditingMerchant] = useState(false);
  const [editMerchantValue, setEditMerchantValue] = useState("");

  const categories = useMemo(() => allCategories(customCategories), [customCategories]);

  const queue = useMemo(
    () => uncategorized(transactions).filter((t) => !skipped.includes(t.id) && !sortedIds.includes(t.id)),
    [transactions, skipped, sortedIds],
  );
  const current = queue[0] ?? null;
  const isDone = current === null;

  // A new card taking the front position should never inherit the previous card's edit state.
  useEffect(() => {
    setEditingMerchant(false);
  }, [current?.id]);

  const close = () => navigation.goBack();

  const startEditMerchant = () => {
    if (!current) return;
    setEditMerchantValue(current.merchant_clean ?? current.merchant_raw ?? "");
    setEditingMerchant(true);
  };

  const cancelEditMerchant = () => setEditingMerchant(false);

  const saveEditMerchant = async () => {
    if (!current || !editMerchantValue.trim()) return;
    await editTransaction(current.id, editMerchantValue.trim(), current.amount);
    setEditingMerchant(false);
  };

  // Shared by chooseCategory (no-subcategory branch) and chooseSubcategory: snapshots the card
  // being left, advances the queue optimistically, and slides the snapshot out on top of the
  // (already-advanced) next card -- Tinder-style. The success toast/sortedCount still wait for
  // categorize() to actually persist, so a failed save doesn't show a misleading success toast.
  const advance = (category: string, subcategory: string | null) => {
    if (!current) return;
    const leaving = current;

    setSortedIds((ids) => ids.concat(leaving.id));
    setPickedCategory(null);
    setExiting(leaving);
    exitAnim.setValue(0);
    Animated.timing(exitAnim, {
      toValue: 1,
      duration: EXIT_DURATION,
      easing: EXIT_EASING,
      useNativeDriver: true,
    }).start(() => setExiting(null));

    (async () => {
      await categorize(leaving.id, category, subcategory);
      setSortedCount((n) => n + 1);
      showToast(`${leaving.merchant_clean ?? leaving.merchant_raw} → ${category}${subcategory ? " · " + subcategory : ""}`);
    })();
  };

  const chooseCategory = (category: string) => {
    if (mergedSubcategories(category, customSubcategories).length > 0) {
      setPickedCategory(category);
      return;
    }
    advance(category, null);
  };

  const chooseSubcategory = (subcategory: string) => {
    if (!pickedCategory) return;
    advance(pickedCategory, subcategory);
  };

  const skip = () => {
    if (!current) return;
    setSkipped((s) => s.concat(current.id));
    setPickedCategory(null);
  };

  return (
    <View style={styles.container} testID="quicksort-screen">
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.doneLink} onPress={close} testID="quicksort-done-link">
            Done
          </Text>
          <Text style={styles.counter}>
            {queue.length > 0 ? `${sortedCount + 1} of ${sortedCount + queue.length}` : `${sortedCount} sorted`}
          </Text>
        </View>
        <Text style={styles.title}>Quick sort</Text>
        <Text style={styles.subtitle}>A few we couldn't read confidently.</Text>

        <View style={styles.stack}>
          {isDone ? (
            <View style={[styles.doneCard, shadow.card]}>
              <View style={styles.doneCircle} />
              <Text style={styles.doneTitle}>{sortedCount > 0 ? "All sorted" : "Nothing to sort"}</Text>
              <Text style={styles.doneBody}>
                {sortedCount > 0
                  ? `You filed ${sortedCount} ${sortedCount === 1 ? "transaction" : "transactions"}. Your summary is accurate again.`
                  : "Everything already has a category. Come back when something new lands."}
              </Text>
              <Pressable style={styles.doneButton} onPress={close} testID="quicksort-back-to-spending">
                <Text style={styles.doneButtonText}>Back to spending</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.dummyCardFar} />
              <View style={styles.dummyCardNear} />
              <View style={[styles.frontCard, shadow.quickSortCard]} testID="quicksort-card">
                <CardContent
                  txn={current!}
                  editing={editingMerchant}
                  editValue={editMerchantValue}
                  onStartEdit={startEditMerchant}
                  onChangeEdit={setEditMerchantValue}
                  onSaveEdit={saveEditMerchant}
                  onCancelEdit={cancelEditMerchant}
                />
              </View>
            </>
          )}

          {/* Snapshot of the just-picked card, animating away on top of the (already-advanced)
              content above -- Tinder-style reveal of the next transaction/done-state underneath. */}
          {exiting && (
            <Animated.View
              style={[
                styles.frontCard,
                shadow.quickSortCard,
                {
                  transform: [
                    { translateX: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [0, EXIT_TRANSLATE_X] }) },
                    { rotate: exitAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "10deg"] }) },
                  ],
                  opacity: exitAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                },
              ]}
              testID="quicksort-card-exiting"
            >
              <CardContent txn={exiting} />
            </Animated.View>
          )}
        </View>

        {!isDone && (
          <>
            <Text style={styles.stepLabel}>{pickedCategory ? `Which kind of ${pickedCategory.toLowerCase()}?` : "Tap a category"}</Text>
            <View style={styles.chipsRow}>
              {pickedCategory
                ? mergedSubcategories(pickedCategory, customSubcategories).map((sub) => (
                    <CategoryChip key={sub} label={sub} onPress={() => chooseSubcategory(sub)} testID={`qs-sub-${sub}`} />
                  ))
                : categories.map((cat) => (
                    <CategoryChip
                      key={cat}
                      label={cat}
                      leftBorderColor={categoryColor(cat)}
                      onPress={() => chooseCategory(cat)}
                      testID={`qs-cat-${cat}`}
                    />
                  ))}
            </View>
            <View style={styles.footerLinks}>
              {pickedCategory && (
                <Text style={styles.footerLink} onPress={() => setPickedCategory(null)} testID="qs-back-to-categories">
                  ‹ Categories
                </Text>
              )}
              <Text style={styles.footerLink} onPress={skip} testID="qs-skip">
                Skip for now
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed and opaque so this screen fully covers whatever's behind it -- on web,
  // react-navigation keeps the presenting screen mounted underneath a transparentModal route, so
  // this can't just be the padded/capped column itself (see `content`) or that mounted screen
  // shows through the gutters on either side of it.
  container: { flex: 1, backgroundColor: colors.canvas },
  content: {
    flex: 1,
    paddingTop: spacing.screenTop,
    paddingHorizontal: spacing.screenH,
    paddingBottom: 30,
    ...(Platform.OS === "web" ? { maxWidth: 460, width: "100%" as const, alignSelf: "center" as const } : null),
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  doneLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink55 },
  counter: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.sm, color: colors.ink42 },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.title, marginBottom: 6, color: colors.ink },
  subtitle: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50, marginBottom: 24 },
  stack: { height: 290, position: "relative" },
  dummyCardFar: { position: "absolute", top: 8, left: 7, right: 7, height: 262, backgroundColor: colors.surface, borderRadius: 25, opacity: 0.7 },
  dummyCardNear: { position: "absolute", top: 16, left: 14, right: 14, height: 250, backgroundColor: colors.surface, borderRadius: 24, opacity: 0.4 },
  frontCard: { position: "absolute", top: 0, left: 0, right: 0, height: 274, backgroundColor: colors.surface, borderRadius: radii.quickSort, padding: 24 },
  cardSource: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 14,
  },
  merchantRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  cardMerchant: { flexShrink: 1, fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, color: colors.ink },
  editLink: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm, color: colors.ink55 },
  editMerchantRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  editMerchantInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontFamily: typography.fontFamily.serif,
    fontSize: typography.size.heading,
    color: colors.ink,
  },
  editMerchantAction: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm, color: colors.ink },
  editMerchantCancel: { color: colors.ink45 },
  cardWhen: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink50, marginBottom: 20 },
  cardAmount: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.numberXl, color: colors.ink },
  cardConverted: { fontFamily: typography.fontFamily.mono, fontSize: typography.size.xs, color: colors.ink35, marginTop: 3 },
  cardHint: { marginTop: "auto", fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink42 },
  doneCard: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderRadius: radii.quickSort, alignItems: "center", justifyContent: "center", padding: 30 },
  doneCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.successDoneCircle, marginBottom: 16 },
  doneTitle: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.displayXl, marginBottom: 8, color: colors.ink },
  doneBody: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink52, textAlign: "center", maxWidth: 230 },
  doneButton: { marginTop: 20, backgroundColor: colors.ink, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  doneButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md, color: colors.onDark },
  stepLabel: {
    marginTop: 24,
    marginBottom: 12,
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.ink42,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  footerLinks: { flexDirection: "row", justifyContent: "center", gap: 22, marginTop: 20 },
  footerLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base, color: colors.ink45 },
});
