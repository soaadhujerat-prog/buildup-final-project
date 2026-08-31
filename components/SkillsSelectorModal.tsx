import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import Sheet from './Sheet';

const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, ' ');

interface Props {
  visible: boolean;
  onClose: () => void;
  allSkills: string[];
  selected: string[];
  onChange: (skills: string[]) => void;
}

/** Multi-select skills picker — search + vertical list + clear check marks.
 *  `allSkills` is derived by the caller from the real worker pool, never
 *  invented here. */
const SkillsSelectorModal: React.FC<Props> = ({
  visible,
  onClose,
  allSkills,
  selected,
  onChange,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return allSkills;
    return allSkills.filter((s) => normalize(s).includes(q));
  }, [query, allSkills]);

  const toggle = (skill: string) => {
    if (selected.includes(skill)) {
      onChange(selected.filter((s) => s !== skill));
    } else {
      onChange([...selected, skill]);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard maxHeightRatio={0.88}>
      <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="סגור"
            >
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>מיומנויות</Text>
            <TouchableOpacity
              onPress={() => onChange([])}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.clearText}>נקה</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrapper}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="חיפוש מיומנות..."
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

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.emptyText}>לא נמצאו מיומנויות תואמות</Text>}
            renderItem={({ item }) => {
              const isSelected = selected.includes(item);
              return (
                <TouchableOpacity
                  style={[styles.row, isSelected && styles.rowSelected]}
                  onPress={() => toggle(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]}>
                    {item}
                  </Text>
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? Colors.primary : Colors.textMuted}
                  />
                </TouchableOpacity>
              );
            }}
          />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.doneText}>
            {selected.length > 0 ? `אישור (${selected.length})` : 'אישור'}
          </Text>
        </TouchableOpacity>
      </View>
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
  rowTextSelected: { color: Colors.primaryDark, fontWeight: '700' },
  emptyText: {
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  doneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.white,
    writingDirection: 'rtl',
  },
});

export default SkillsSelectorModal;
