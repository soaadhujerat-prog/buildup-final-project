import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { JobPost } from '../types';

// 'default' = no explicit sort chosen — jobs.postedAt desc, same as
// 'newest' produces, but silently (no chip). 'newest' is a real, honest
// sort criterion (an objective fact about the data) — unlike "מומלץ", it
// never implies a recommendation, so it's a normal, always-visible option.
export type JobSortOption = 'default' | 'newest' | 'rateDesc' | 'rateAsc';

export const JOB_SORT_OPTIONS: { value: JobSortOption; label: string }[] = [
  { value: 'newest', label: 'החדש ביותר' },
  { value: 'rateDesc', label: 'תעריף: מהגבוה לנמוך' },
  { value: 'rateAsc', label: 'תעריף: מהנמוך לגבוה' },
];

export const getJobSortLabel = (sort: JobSortOption): string | null =>
  JOB_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? null;

// Both rate fields are optional (a job may only have hourlyRate set) — for
// sort purposes only (never for display or filtering) a missing dailyRate
// falls back to hourlyRate, then to 0, so every job still lands somewhere
// deterministic in the ordering.
const sortableRate = (job: JobPost): number => job.dailyRate ?? job.hourlyRate ?? 0;

/** Pure sort — applied after filtering, never mutates its input. 'default'
 *  applies no transformation at all (the existing data order), matching
 *  the worker-search sort's same convention — 'newest' is a distinct,
 *  explicit choice the user can make, even though it's the same order the
 *  data mock happens to already ship in. */
export const sortJobs = (jobs: JobPost[], sort: JobSortOption): JobPost[] => {
  if (sort === 'default') return jobs;
  const sorted = [...jobs];
  switch (sort) {
    case 'newest':
      sorted.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      break;
    case 'rateDesc':
      sorted.sort((a, b) => sortableRate(b) - sortableRate(a));
      break;
    case 'rateAsc':
      sorted.sort((a, b) => sortableRate(a) - sortableRate(b));
      break;
  }
  return sorted;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  value: JobSortOption;
  onChange: (value: JobSortOption) => void;
}

/** "מיון" — small action sheet, selecting an option applies it immediately. */
const JobSortBottomSheet: React.FC<Props> = ({ visible, onClose, value, onChange }) => {
  const select = (opt: JobSortOption) => {
    onChange(opt);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>מיון לפי</Text>

          {JOB_SORT_OPTIONS.map((opt) => {
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

export default JobSortBottomSheet;
