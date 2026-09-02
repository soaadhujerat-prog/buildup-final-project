import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, FontSize } from '../theme/colors';
import { JobPost } from '../types';
import Sheet from './Sheet';

// 'default' = no explicit sort chosen — jobs.postedAt desc, same as
// 'newest' produces, but silently (no chip). 'newest' is a real, honest
// sort criterion (an objective fact about the data) — unlike "מומלץ", it
// never implies a recommendation, so it's a normal, always-visible option.
export type JobSortOption =
  | 'default'
  | 'newest'
  | 'rateDesc'
  | 'rateAsc'
  | 'nearest';

export const JOB_SORT_OPTIONS: { value: JobSortOption; label: string }[] = [
  { value: 'newest', label: 'החדש ביותר' },
  { value: 'rateDesc', label: 'תעריף: מהגבוה לנמוך' },
  { value: 'rateAsc', label: 'תעריף: מהנמוך לגבוה' },
  // Worker job search only — distance from the worker's residence city to the
  // job worksite (Phase 10). Jobs with an unknown distance sort last.
  { value: 'nearest', label: 'הקרובות אליי' },
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
export const sortJobs = (
  jobs: JobPost[],
  sort: JobSortOption,
  /** Worker→job distance per job id (Phase 10). Required only for the
   *  'nearest' sort; jobs with no entry (unknown distance) sort last. */
  distanceByJobId?: Record<string, number | undefined>
): JobPost[] => {
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
    case 'nearest': {
      const d = (id: string) => distanceByJobId?.[id] ?? Number.POSITIVE_INFINITY;
      sorted.sort((a, b) => d(a.id) - d(b.id));
      break;
    }
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
    <Sheet visible={visible} onClose={onClose}>
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
    </Sheet>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
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
