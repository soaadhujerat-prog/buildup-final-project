import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { PROFESSION_CATEGORIES, PROFESSIONS_BY_CATEGORY } from '../data/professions';
import Sheet from './Sheet';

const CATEGORIES = PROFESSION_CATEGORIES.filter((c) => c !== 'כל המקצועות');

const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, ' ');

interface Props {
  visible: boolean;
  onClose: () => void;
  professionCategory: string;
  /** Single-select mode (filters). Ignored when `multiple`. */
  profession?: string;
  /** Single-select mode (filters). Ignored when `multiple`. */
  onChange?: (professionCategory: string, profession: string) => void;
  /** Filter sheets allow "כל המקצועות ב<תחום>" (profession = ''). A job post
   *  must name a specific trade, so PostJobScreen passes `false` to drop that
   *  row — the user then always leaves with a concrete profession, and the
   *  "category chosen but profession empty" half-state can't happen. */
  allowAllInCategory?: boolean;
  /** Multi-select mode (worker registration / post job): tapping a trade
   *  toggles it and keeps the sheet open; an "אישור (N)" button commits. */
  multiple?: boolean;
  /** Multi-select mode: the trades already chosen (all within one category). */
  selectedProfessions?: string[];
  /** Multi-select mode: called on "אישור" with the final category + trades. */
  onChangeMultiple?: (professionCategory: string, professions: string[]) => void;
}

type Step = 'category' | 'profession';

const ALL_IN_CATEGORY = '__ALL__';

/** Two-step hierarchical picker: תחום מקצועי → מקצוע ספציפי.
 *  Uses only PROFESSION_CATEGORIES / PROFESSIONS_BY_CATEGORY — the shared
 *  profession taxonomy (data/professions.ts), never invented values. */
const ProfessionSelectorModal: React.FC<Props> = ({
  visible,
  onClose,
  professionCategory,
  profession = '',
  onChange,
  allowAllInCategory = true,
  multiple = false,
  selectedProfessions,
  onChangeMultiple,
}) => {
  const [step, setStep] = useState<Step>('category');
  const [localCategory, setLocalCategory] = useState('');
  const [query, setQuery] = useState('');
  // Multi-select working set — only meaningful when `multiple`.
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setLocalCategory(professionCategory);
      setStep(professionCategory ? 'profession' : 'category');
      setQuery('');
      if (multiple) setSelected(selectedProfessions ?? []);
    }
    // selectedProfessions is a fresh array each render — depend on its content,
    // not identity, so re-opening seeds correctly without re-seeding mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, professionCategory, multiple, (selectedProfessions ?? []).join('|')]);

  const filteredCategories = useMemo(() => {
    const q = normalize(query);
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => normalize(c).includes(q));
  }, [query]);

  const professionsInCategory = PROFESSIONS_BY_CATEGORY[localCategory] || [];
  const filteredProfessions = useMemo(() => {
    const q = normalize(query);
    if (!q) return professionsInCategory;
    return professionsInCategory.filter((p) => normalize(p).includes(q));
  }, [query, professionsInCategory]);

  const selectCategory = (cat: string) => {
    setLocalCategory(cat);
    setStep('profession');
    setQuery('');
    if (multiple) {
      // Keep only picks that belong to the newly chosen category — a job /
      // worker profile stays within one category (same rule as the inline
      // chip pickers elsewhere).
      const list = PROFESSIONS_BY_CATEGORY[cat] ?? [];
      setSelected((prev) => prev.filter((p) => list.includes(p)));
    }
  };

  const selectProfession = (prof: string) => {
    if (multiple) {
      setSelected((prev) =>
        prev.includes(prof)
          ? prev.filter((p) => p !== prof)
          : [...prev, prof]
      );
      return; // stays open
    }
    onChange?.(localCategory, prof === ALL_IN_CATEGORY ? '' : prof);
    onClose();
  };

  const confirmMultiple = () => {
    onChangeMultiple?.(localCategory, selected);
    onClose();
  };

  const goBack = () => {
    setStep('category');
    setQuery('');
  };

  const clearAll = () => {
    if (multiple) {
      setSelected([]);
      return; // stays open — the user can re-pick or press "אישור"
    }
    onChange?.('', '');
    onClose();
  };

  const title = step === 'category' ? 'תחום מקצועי' : 'מקצוע ספציפי';

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard maxHeightRatio={0.88}>
      <View style={styles.header}>
            {step === 'profession' ? (
              <TouchableOpacity
                onPress={goBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="חזרה"
              >
                <Ionicons name="chevron-forward" size={22} color={Colors.text} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="סגור"
              >
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            )}
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity
              onPress={clearAll}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.clearText}>נקה</Text>
            </TouchableOpacity>
          </View>

          {step === 'profession' && (
            <Text style={styles.breadcrumb}>{localCategory}</Text>
          )}

          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={step === 'category' ? 'חיפוש תחום מקצועי...' : 'חיפוש מקצוע...'}
              placeholderTextColor={Colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="נקה חיפוש"
              >
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {step === 'category' ? (
            <FlatList
              data={filteredCategories}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyText}>לא נמצאו תחומים תואמים</Text>}
              renderItem={({ item }) => {
                const selected = item === professionCategory;
                return (
                  <TouchableOpacity
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => selectCategory(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowText, selected && styles.rowTextSelected]}>
                      {item}
                    </Text>
                    <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              }}
            />
          ) : (
            <>
              <FlatList
                data={
                  allowAllInCategory && !multiple
                    ? [ALL_IN_CATEGORY, ...filteredProfessions]
                    : filteredProfessions
                }
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={<Text style={styles.emptyText}>לא נמצאו מקצועות תואמים</Text>}
                renderItem={({ item }) => {
                  const isAllOption = item === ALL_IN_CATEGORY;
                  const isSelected = multiple
                    ? selected.includes(item)
                    : isAllOption
                    ? !profession
                    : item === profession;
                  return (
                    <TouchableOpacity
                      style={[styles.row, isSelected && styles.rowSelected]}
                      onPress={() => selectProfession(item)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.rowText,
                          isAllOption && styles.rowTextMuted,
                          isSelected && styles.rowTextSelected,
                        ]}
                      >
                        {isAllOption ? `כל המקצועות ב${localCategory}` : item}
                      </Text>
                      {isSelected ? (
                        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      ) : (
                        <View style={styles.rowCheckSpacer} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
              {multiple && (
                <View style={styles.footer}>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={confirmMultiple}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.confirmBtnText}>
                      {selected.length > 0
                        ? `אישור (${selected.length})`
                        : 'אישור'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  clearText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  breadcrumb: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },

  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    padding: 0,
  },

  // flexShrink lets the list give up height (and become internally
  // scrollable) when the sheet hits its max height, instead of overflowing.
  list: { marginTop: Spacing.sm, flexShrink: 1 },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  rowSelected: { backgroundColor: Colors.primaryFaint },
  rowText: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowTextMuted: { color: Colors.textSecondary, fontWeight: '600' },
  rowTextSelected: { color: Colors.primaryDark, fontWeight: '700' },
  rowCheckSpacer: { width: 20 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  emptyText: {
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default ProfessionSelectorModal;
