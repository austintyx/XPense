import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useToast } from "../components/Toast";
import { useAppData } from "../store/TransactionsProvider";
import { CATEGORIES, categoryColor, colors, radii, shadow, spacing, typography } from "../theme/tokens";
import { mergedSubcategories } from "../utils/derive";

export default function ManageCategories() {
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const {
    customCategories,
    customSubcategories,
    addCategory,
    removeCategory,
    addSubcategory,
    removeSubcategory,
  } = useAppData();

  const [newCategoryName, setNewCategoryName] = useState("");
  const [subDrafts, setSubDrafts] = useState<Record<string, string>>({});

  const allCategoryRows = useMemo(
    () => [
      ...CATEGORIES.map((name) => ({ name, custom: false, id: null as number | null })),
      ...customCategories.map((c) => ({ name: c.name, custom: true, id: c.id })),
    ],
    [customCategories],
  );

  const saveCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await addCategory(name);
      setNewCategoryName("");
      showToast(`Added ${name}`);
    } catch {
      showToast("Couldn't add that category");
    }
  };

  const saveSubcategory = async (category: string) => {
    const name = (subDrafts[category] ?? "").trim();
    if (!name) return;
    try {
      await addSubcategory(category, name);
      setSubDrafts((cur) => ({ ...cur, [category]: "" }));
      showToast(`Added ${name} under ${category}`);
    } catch {
      showToast("Couldn't add that subcategory");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="manage-categories-screen">
      <Text style={styles.backLink} onPress={() => navigation.goBack()} testID="manage-categories-back">
        ‹ Settings
      </Text>
      <Text style={styles.title}>Manage categories</Text>
      <Text style={styles.subtitle}>Add your own categories and subcategories, or remove ones you've added.</Text>

      <View style={[styles.card, styles.addCard, shadow.card]}>
        <Text style={styles.label}>Add a category</Text>
        <View style={styles.addRow}>
          <TextInput
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            placeholder="e.g. Pets"
            style={styles.input}
            testID="new-category-input"
          />
          <Pressable style={styles.addButton} onPress={saveCategory} testID="add-category-button">
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {allCategoryRows.map(({ name, custom, id }) => {
          const subcategories = mergedSubcategories(name, customSubcategories);
          const customSubForName = customSubcategories.filter((s) => s.category === name);
          const customSubIds = new Map(customSubForName.map((s) => [s.name, s.id]));

          return (
            <View key={name} style={[styles.card, styles.categoryCard, shadow.card]} testID={`category-card-${name}`}>
              <View style={styles.categoryHeaderRow}>
                <View style={[styles.dot, { backgroundColor: categoryColor(name) }]} />
                <Text style={styles.categoryName}>{name}</Text>
                {custom && id !== null && (
                  <Text
                    style={styles.removeLink}
                    onPress={async () => {
                      await removeCategory(id);
                      showToast(`Removed ${name}`);
                    }}
                    testID={`remove-category-${id}`}
                  >
                    Remove
                  </Text>
                )}
              </View>

              {subcategories.length > 0 && (
                <View style={styles.chipsRow}>
                  {subcategories.map((sub) => {
                    const subId = customSubIds.get(sub);
                    const isCustom = subId !== undefined;
                    return (
                      <Pressable
                        key={sub}
                        style={styles.subChip}
                        disabled={!isCustom}
                        onPress={async () => {
                          if (subId === undefined) return;
                          await removeSubcategory(subId);
                          showToast(`Removed ${sub}`);
                        }}
                        testID={isCustom ? `remove-subcategory-${subId}` : `subcategory-${name}-${sub}`}
                      >
                        <Text style={styles.subChipText}>
                          {sub}
                          {isCustom ? " ×" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.addRow}>
                <TextInput
                  value={subDrafts[name] ?? ""}
                  onChangeText={(text) => setSubDrafts((cur) => ({ ...cur, [name]: text }))}
                  placeholder="Add a subcategory"
                  style={[styles.input, styles.subInput]}
                  testID={`new-subcategory-input-${name}`}
                />
                <Pressable
                  style={styles.addButtonSmall}
                  onPress={() => saveSubcategory(name)}
                  testID={`add-subcategory-button-${name}`}
                >
                  <Text style={styles.addButtonText}>Add</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: spacing.screenH, paddingTop: spacing.screenTop, paddingBottom: 40 },
  backLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.md, color: colors.ink55, marginBottom: 18 },
  title: { fontFamily: typography.fontFamily.serif, fontSize: typography.size.heading, marginBottom: 6, color: colors.ink },
  subtitle: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.base5, color: colors.ink55, marginBottom: 20, maxWidth: 300 },
  card: { backgroundColor: colors.surface, borderRadius: radii.card, padding: 16 },
  addCard: { marginBottom: 16 },
  label: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.xs5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.ink42,
    marginBottom: 8,
  },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.ink14,
    borderRadius: 11,
    padding: 11,
    paddingHorizontal: 13,
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.size.md,
    color: colors.ink,
    backgroundColor: colors.surfaceSheet,
  },
  subInput: { fontSize: typography.size.base },
  addButton: { backgroundColor: colors.ink, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 16 },
  addButtonSmall: { backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  addButtonText: { fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.sm5, color: colors.onDark },
  categoryCard: { gap: 12 },
  categoryHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  categoryName: { flex: 1, fontFamily: typography.fontFamily.sansMedium, fontSize: typography.size.md5, color: colors.ink },
  removeLink: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.warnText },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.ink14,
    backgroundColor: colors.surfaceSheet,
  },
  subChipText: { fontFamily: typography.fontFamily.sans, fontSize: typography.size.sm5, color: colors.ink },
});
