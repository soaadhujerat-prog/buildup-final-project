import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { Worker } from '../types';
import { workerProfessions, workerHasProfession } from '../utils/normalize';
import CityPickerField from './CityPickerField';
import ProfessionSelectorModal from './ProfessionSelectorModal';
import SkillsSelectorModal from './SkillsSelectorModal';

// ---------------------------------------------------------------------------
// Shared filter state — the single source of truth for "search workers"
// filtering, used by both the bottom sheet (editing) and the screen
// (applying + rendering active-filter chips).
// ---------------------------------------------------------------------------

export interface WorkerFilters {
  professionCategory: string; // '' = all
  profession: string; // '' = all professions within the category
  city: string; // '' = all cities
  availableOnly: boolean;
  minExperience: number; // 0 = all
  skills: string[];
  minRate: string; // kept as raw text for the numeric inputs
  maxRate: string;
  // Viewer-relative (depends on which contractor is logged in), so it is
  // intentionally NOT part of filterWorkers below — that predicate only
  // ever looks at intrinsic Worker fields. The screen applies this one
  // itself, after filterWorkers, against its own favoriteWorkerIds.
  favoritesOnly: boolean;
}

export const DEFAULT_WORKER_FILTERS: WorkerFilters = {
  professionCategory: '',
  profession: '',
  city: '',
  availableOnly: false,
  minExperience: 0,
  skills: [],
  minRate: '',
  maxRate: '',
  favoritesOnly: false,
};

export const EXPERIENCE_OPTIONS: { label: string; value: number }[] = [
  { label: 'הכל', value: 0 },
  { label: '1+ שנים', value: 1 },
  { label: '3+ שנים', value: 3 },
  { label: '5+ שנים', value: 5 },
  { label: '10+ שנים', value: 10 },
];

/** Single predicate shared by the live results and the sheet's "הצג X עובדים"
 *  preview count, so the two can never drift apart. */
export const filterWorkers = (
  workers: Worker[],
  searchQuery: string,
  filters: WorkerFilters
): Worker[] => {
  const q = searchQuery.trim().toLowerCase();
  const minRate = filters.minRate.trim() ? Number(filters.minRate) : undefined;
  const maxRate = filters.maxRate.trim() ? Number(filters.maxRate) : undefined;

  return workers.filter((w) => {
    if (q) {
      const haystack = [
        w.fullName,
        workerProfessions(w).join(' '),
        w.professionCategory,
        w.skills.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.professionCategory && w.professionCategory !== filters.professionCategory) {
      return false;
    }
    if (filters.profession && !workerHasProfession(w, filters.profession)) return false;
    if (filters.city && w.city !== filters.city) return false;
    if (filters.availableOnly && !w.isAvailable) return false;
    if (filters.minExperience > 0 && w.experienceYears < filters.minExperience) return false;
    if (filters.skills.length > 0 && !filters.skills.every((s) => w.skills.includes(s))) {
      return false;
    }
    if (minRate !== undefined && !Number.isNaN(minRate) && w.dailyRate < minRate) return false;
    if (maxRate !== undefined && !Number.isNaN(maxRate) && w.dailyRate > maxRate) return false;
    return true;
  });
};

export const isFiltersActive = (f: WorkerFilters): boolean =>
  !!f.professionCategory ||
  !!f.profession ||
  !!f.city ||
  f.availableOnly ||
  f.minExperience > 0 ||
  f.skills.length > 0 ||
  !!f.minRate.trim() ||
  !!f.maxRate.trim() ||
  f.favoritesOnly;

interface Props {
  visible: boolean;
  onClose: () => void;
  workers: Worker[]; // pool the filters apply to (already approved)
  searchQuery: string; // current free-text search, folded into the preview count
  filters: WorkerFilters;
  onApply: (filters: WorkerFilters) => void;
  allSkills: string[];
  favoriteWorkerIds: string[]; // for the "רק עובדים מועדפים" preview count
}

/** "סינון עובדים" — the main filter bottom sheet. Edits a local draft copy
 *  of the filters; changes only take effect when "הצג X עובדים" is pressed,
 *  so dismissing the sheet any other way discards them. */
const FilterBottomSheet: React.FC<Props> = ({
  visible,
  onClose,
  workers,
  searchQuery,
  filters,
  onApply,
  allSkills,
  favoriteWorkerIds,
}) => {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<WorkerFilters>(filters);
  const [professionModalVisible, setProfessionModalVisible] = useState(false);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const previewCount = (() => {
    const base = filterWorkers(workers, searchQuery, draft);
    return draft.favoritesOnly
      ? base.filter((w) => favoriteWorkerIds.includes(w.id)).length
      : base.length;
  })();

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleClearAll = () => setDraft(DEFAULT_WORKER_FILTERS);

  const professionLabel = draft.profession || draft.professionCategory || 'הכל';
  const skillsLabel = draft.skills.length > 0 ? `נבחרו ${draft.skills.length}` : 'הכל';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheetWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="סגור"
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>סינון עובדים</Text>
              <View style={{ width: 24 }} />
            </View>
            <Text style={styles.headerSubtitle}>סינון לפי הפרטים שמתאימים למשרה שלך</Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* מועדפים */}
              <TouchableOpacity
                style={[styles.row, styles.favoritesRow]}
                onPress={() => setDraft((d) => ({ ...d, favoritesOnly: !d.favoritesOnly }))}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={draft.favoritesOnly ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={draft.favoritesOnly ? Colors.primary : Colors.textMuted}
                />
                <Text style={styles.rowValue}>רק עובדים מועדפים</Text>
                <Ionicons name="heart" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* מקצוע */}
              <Text style={styles.sectionLabel}>מקצוע</Text>
              <TouchableOpacity
                style={styles.row}
                onPress={() => setProfessionModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="briefcase-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.rowValue} numberOfLines={1}>
                  {professionLabel}
                </Text>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* עיר */}
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionLabel, styles.sectionLabelNoMargin]}>עיר</Text>
                {!!draft.city && (
                  <TouchableOpacity
                    onPress={() => setDraft((d) => ({ ...d, city: '' }))}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.sectionClear}>נקה</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.cityWrap}>
                <CityPickerField
                  label=""
                  value={draft.city}
                  onChange={(city) => setDraft((d) => ({ ...d, city }))}
                  placeholder="כל הערים"
                />
              </View>

              {/* זמינות */}
              <Text style={styles.sectionLabel}>זמינות</Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[styles.segment, !draft.availableOnly && styles.segmentActive]}
                  onPress={() => setDraft((d) => ({ ...d, availableOnly: false }))}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      !draft.availableOnly && styles.segmentTextActive,
                    ]}
                  >
                    הכל
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, draft.availableOnly && styles.segmentActive]}
                  onPress={() => setDraft((d) => ({ ...d, availableOnly: true }))}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.segmentText, draft.availableOnly && styles.segmentTextActive]}
                  >
                    זמין מיד
                  </Text>
                </TouchableOpacity>
              </View>

              {/* שנות ניסיון */}
              <Text style={styles.sectionLabel}>מינימום שנות ניסיון</Text>
              <View style={styles.pillWrap}>
                {EXPERIENCE_OPTIONS.map((opt) => {
                  const active = draft.minExperience === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.pill, active && styles.pillActive]}
                      onPress={() => setDraft((d) => ({ ...d, minExperience: opt.value }))}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* מיומנויות */}
              <Text style={styles.sectionLabel}>מיומנויות</Text>
              <TouchableOpacity
                style={styles.row}
                onPress={() => setSkillsModalVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="construct-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.rowValue} numberOfLines={1}>
                  {skillsLabel}
                </Text>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* תעריף יומי */}
              <Text style={styles.sectionLabel}>תעריף יומי (₪)</Text>
              <View style={styles.rateRow}>
                <TextInput
                  style={styles.rateInput}
                  value={draft.minRate}
                  onChangeText={(v) => setDraft((d) => ({ ...d, minRate: v.replace(/[^0-9]/g, '') }))}
                  placeholder="מינימום"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  textAlign="right"
                />
                <TextInput
                  style={styles.rateInput}
                  value={draft.maxRate}
                  onChangeText={(v) => setDraft((d) => ({ ...d, maxRate: v.replace(/[^0-9]/g, '') }))}
                  placeholder="מקסימום"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  textAlign="right"
                />
              </View>
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
              <TouchableOpacity
                style={styles.clearAllBtn}
                onPress={handleClearAll}
                activeOpacity={0.8}
              >
                <Text style={styles.clearAllText}>נקה הכל</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.85}>
                <Text style={styles.applyText}>הצג {previewCount} עובדים</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <ProfessionSelectorModal
        visible={professionModalVisible}
        onClose={() => setProfessionModalVisible(false)}
        professionCategory={draft.professionCategory}
        profession={draft.profession}
        onChange={(professionCategory, profession) =>
          setDraft((d) => ({ ...d, professionCategory, profession }))
        }
      />

      <SkillsSelectorModal
        visible={skillsModalVisible}
        onClose={() => setSkillsModalVisible(false)}
        allSkills={allSkills}
        selected={draft.skills}
        onChange={(skills) => setDraft((d) => ({ ...d, skills }))}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetWrap: { maxHeight: '90%' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '100%',
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
    paddingVertical: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },

  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionLabelNoMargin: { marginTop: 0, marginBottom: 0 },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionClear: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  rowValue: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  favoritesRow: { marginTop: Spacing.sm },

  cityWrap: { marginTop: -6 },

  segmentRow: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  segmentTextActive: { color: Colors.white },

  pillWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  pillTextActive: { color: Colors.white },

  rateRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
  },
  rateInput: {
    flex: 1,
    backgroundColor: Colors.gray50,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    writingDirection: 'rtl',
  },

  footer: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  applyBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  applyText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.white,
    writingDirection: 'rtl',
  },
  clearAllBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  clearAllText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
});

export default FilterBottomSheet;
