import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { PROFESSION_CATEGORIES, PROFESSIONS_BY_CATEGORY } from '../data/mockData';

const CATEGORIES = PROFESSION_CATEGORIES.filter((c) => c !== 'כל המקצועות');

const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, ' ');

interface Props {
  visible: boolean;
  onClose: () => void;
  professionCategory: string;
  profession: string;
  onChange: (professionCategory: string, profession: string) => void;
}

type Step = 'category' | 'profession';

const ALL_IN_CATEGORY = '__ALL__';

/** Two-step hierarchical picker: תחום מקצועי → מקצוע ספציפי.
 *  Uses only PROFESSION_CATEGORIES / PROFESSIONS_BY_CATEGORY — the taxonomy
 *  already defined in mockData, never invented values. */
const ProfessionSelectorModal: React.FC<Props> = ({
  visible,
  onClose,
  professionCategory,
  profession,
  onChange,
}) => {
  const [step, setStep] = useState<Step>('category');
  const [localCategory, setLocalCategory] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setLocalCategory(professionCategory);
      setStep(professionCategory ? 'profession' : 'category');
      setQuery('');
    }
  }, [visible, professionCategory]);

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
  };

  const selectProfession = (prof: string) => {
    onChange(localCategory, prof === ALL_IN_CATEGORY ? '' : prof);
    onClose();
  };

  const goBack = () => {
    setStep('category');
    setQuery('');
  };

  const clearAll = () => {
    onChange('', '');
    onClose();
  };

  const title = step === 'category' ? 'תחום מקצועי' : 'מקצוע ספציפי';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

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
            <FlatList
              data={[ALL_IN_CATEGORY, ...filteredProfessions]}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.emptyText}>לא נמצאו מקצועות תואמים</Text>}
              renderItem={({ item }) => {
                const isAllOption = item === ALL_IN_CATEGORY;
                const selected = isAllOption ? !profession : item === profession;
                return (
                  <TouchableOpacity
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => selectProfession(item)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.rowText,
                        isAllOption && styles.rowTextMuted,
                        selected && styles.rowTextSelected,
                      ]}
                    >
                      {isAllOption ? `כל המקצועות ב${localCategory}` : item}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                    ) : (
                      <View style={styles.rowCheckSpacer} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.xl,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
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

  list: { marginTop: Spacing.sm },
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
  emptyText: {
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default ProfessionSelectorModal;
