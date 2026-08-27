import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { Worker } from '../types';

// 'default' = no sort applied, just the existing order of the data. It's
// intentionally NOT labeled "מומלץ" / "recommended" — that phrasing implies
// a real recommendation, and there's no Smart Match scoring behind this yet
// (that lands later, backed by real AI matching). 'default' also never
// appears in SORT_OPTIONS, so the sheet never shows a "default" row.
export type SortOption = 'default' | 'expDesc' | 'expAsc' | 'rateAsc' | 'rateDesc';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'expDesc', label: 'ניסיון: מהגבוה לנמוך' },
  { value: 'expAsc', label: 'ניסיון: מהנמוך לגבוה' },
  { value: 'rateAsc', label: 'תעריף: מהנמוך לגבוה' },
  { value: 'rateDesc', label: 'תעריף: מהגבוה לנמוך' },
];

/** Label for the active-sort chip; null for 'default' (no chip shown). */
export const getSortLabel = (sort: SortOption): string | null =>
  SORT_OPTIONS.find((o) => o.value === sort)?.label ?? null;

/** Pure sort — applied after filtering, never mutates its input. */
export const sortWorkers = (workers: Worker[], sort: SortOption): Worker[] => {
  if (sort === 'default') return workers;
  const sorted = [...workers];
  switch (sort) {
    case 'expDesc':
      sorted.sort((a, b) => b.experienceYears - a.experienceYears);
      break;
    case 'expAsc':
      sorted.sort((a, b) => a.experienceYears - b.experienceYears);
      break;
    case 'rateAsc':
      sorted.sort((a, b) => a.dailyRate - b.dailyRate);
      break;
    case 'rateDesc':
      sorted.sort((a, b) => b.dailyRate - a.dailyRate);
      break;
  }
  return sorted;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  value: SortOption;
  onChange: (value: SortOption) => void;
}

/** "מיון" — small action sheet, selecting an option applies it immediately. */
const SortBottomSheet: React.FC<Props> = ({ visible, onClose, value, onChange }) => {
  const select = (opt: SortOption) => {
    onChange(opt);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>מיון לפי</Text>

          {SORT_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={styles.row}
                onPress={() => select(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowText, active && styles.rowTextActive]}>{opt.label}</Text>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? Colors.primary : Colors.textMuted}
                />
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
  },
  rowText: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowTextActive: { color: Colors.primaryDark, fontWeight: '700' },
});

export default SortBottomSheet;
