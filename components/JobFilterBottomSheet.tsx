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
import { JobPost } from '../types';
import CityPickerField from './CityPickerField';
import ProfessionSelectorModal from './ProfessionSelectorModal';

// ---------------------------------------------------------------------------
// Shared filter state — the single source of truth for "search jobs"
// filtering, used by both the bottom sheet (editing) and the screen
// (applying + rendering active-filter chips). Only fields that actually
// exist on JobPost — no invented fields.
// ---------------------------------------------------------------------------

export interface JobFilters {
  professionCategory: string; // '' = all
  profession: string; // '' = all professions within the category
  city: string; // '' = all cities
  urgentOnly: boolean;
  // Viewer-relative (depends on which worker is logged in), so — like
  // favoritesOnly in the worker-search FilterBottomSheet — it's applied by
  // the screen itself, never inside filterJobs below.
  favoriteContractorsOnly: boolean;
  minRate: string;
  maxRate: string;
}

export const DEFAULT_JOB_FILTERS: JobFilters = {
  professionCategory: '',
  profession: '',
  city: '',
  urgentOnly: false,
  favoriteContractorsOnly: false,
  minRate: '',
  maxRate: '',
};

/** Single predicate shared by the live results and the sheet's "הצג X
 *  משרות" preview count. Only looks at intrinsic JobPost fields — the pool
 *  handed in should already be pre-filtered to open-for-applications jobs
 *  by the caller (see isOpenForApplications in jobStatusService), exactly
 *  like the worker-search screen pre-filters to approved workers. */
export const filterJobs = (
  jobs: JobPost[],
  searchQuery: string,
  filters: JobFilters,
  contractorLabelById: Record<string, string>
): JobPost[] => {
  const q = searchQuery.trim().toLowerCase();
  const minRate = filters.minRate.trim() ? Number(filters.minRate) : undefined;
  const maxRate = filters.maxRate.trim() ? Number(filters.maxRate) : undefined;

  return jobs.filter((j) => {
    if (q) {
      const haystack = [
        j.title,
        j.profession,
        j.professionCategory,
        j.city,
        contractorLabelById[j.contractorId] ?? '',
        j.requirements.join(' '),
        j.requiredCertifications.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.professionCategory && j.professionCategory !== filters.professionCategory) {
      return false;
    }
    if (filters.profession && j.profession !== filters.profession) return false;
    if (filters.city && j.city !== filters.city) return false;
    if (filters.urgentOnly && !j.urgent) return false;
    if (minRate !== undefined && !Number.isNaN(minRate)) {
      if (j.dailyRate === undefined || j.dailyRate < minRate) return false;
    }
    if (maxRate !== undefined && !Number.isNaN(maxRate)) {
      if (j.dailyRate === undefined || j.dailyRate > maxRate) return false;
    }
    return true;
  });
};

export const isJobFiltersActive = (f: JobFilters): boolean =>
  !!f.professionCategory ||
  !!f.profession ||
  !!f.city ||
  f.urgentOnly ||
  f.favoriteContractorsOnly ||
  !!f.minRate.trim() ||
  !!f.maxRate.trim();

interface Props {
  visible: boolean;
  onClose: () => void;
  jobs: JobPost[]; // pool the filters apply to (already open-for-applications)
  searchQuery: string;
  filters: JobFilters;
  onApply: (filters: JobFilters) => void;
  contractorLabelById: Record<string, string>;
  favoriteContractorIds: string[];
}

/** "סינון משרות" — the main filter bottom sheet for the worker job search.
 *  Edits a local draft copy; changes only take effect when "הצג X משרות" is
 *  pressed, so dismissing the sheet any other way discards them. */
const JobFilterBottomSheet: React.FC<Props> = ({
  visible,
  onClose,
  jobs,
  searchQuery,
  filters,
  onApply,
  contractorLabelById,
  favoriteContractorIds,
}) => {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<JobFilters>(filters);
  const [professionModalVisible, setProfessionModalVisible] = useState(false);

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const previewCount = (() => {
    const base = filterJobs(jobs, searchQuery, draft, contractorLabelById);
    return draft.favoriteContractorsOnly
      ? base.filter((j) => favoriteContractorIds.includes(j.contractorId)).length
      : base.length;
  })();

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleClearAll = () => setDraft(DEFAULT_JOB_FILTERS);

  const professionLabel = draft.profession || draft.professionCategory || 'הכל';

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
              <Text style={styles.headerTitle}>סינון משרות</Text>
              <View style={{ width: 24 }} />
            </View>
            <Text style={styles.headerSubtitle}>סינון לפי הפרטים שמתאימים לך</Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* קבלנים מועדפים */}
              <TouchableOpacity
                style={[styles.row, styles.favoritesRow]}
                onPress={() =>
                  setDraft((d) => ({ ...d, favoriteContractorsOnly: !d.favoriteContractorsOnly }))
                }
                activeOpacity={0.7}
              >
                <Ionicons
                  name={draft.favoriteContractorsOnly ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={draft.favoriteContractorsOnly ? Colors.primary : Colors.textMuted}
                />
                <Text style={styles.rowValue}>רק משרות מקבלנים מועדפים</Text>
                <Ionicons name="heart" size={16} color={Colors.textMuted} />
              </TouchableOpacity>

              {/* מקצוע */}
              <Text style={styles.sectionLabel}>מקצוע / תחום</Text>
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

              {/* דחיפות */}
              <Text style={styles.sectionLabel}>דחיפות</Text>
              <TouchableOpacity
                style={styles.row}
                onPress={() => setDraft((d) => ({ ...d, urgentOnly: !d.urgentOnly }))}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={draft.urgentOnly ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={draft.urgentOnly ? Colors.danger : Colors.textMuted}
                />
                <Text style={styles.rowValue}>רק משרות דחופות</Text>
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
                <Text style={styles.applyText}>הצג {previewCount} משרות</Text>
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

export default JobFilterBottomSheet;
