import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontSize, Radius, Spacing, Shadow } from '../theme/colors';
import { SmartMatchResult, Worker } from '../types';
import { WorkerContractorRelationship } from '../services/assignmentService';
import { COMPENSATION_LABEL } from '../services/smartMatchService';
import { workerProfessions } from '../utils/normalize';
import WorkerAvatar from './WorkerAvatar';
import StatusBadge from './StatusBadge';
import SmartMatchScore from './SmartMatchScore';
import SmartMatchBreakdown from './SmartMatchBreakdown';
import SmartMatchExplanation from './SmartMatchExplanation';

interface Props {
  worker: Worker;
  result: SmartMatchResult;
  relationship: WorkerContractorRelationship;
  jobCity: string;
  /** A live pending / accepted invitation for this worker on this job. */
  invited: boolean;
  /** An active assignment for this worker on this job. */
  assigned: boolean;
  onPressProfile: () => void;
  onInvite: () => void;
}

const COMP_TONE = {
  within_budget: 'success',
  slightly_above: 'warning',
  above_budget: 'danger',
  unknown: 'neutral',
} as const;

// Smart-Match wording for the shared-history chip. NOTE: on this screen
// `relationship === 'current'` for a listed worker means an active assignment
// on a DIFFERENT job of this contractor — a worker already on the SELECTED
// job is surfaced through the "משובץ למשרה זו" CTA and this chip is hidden.
// Kept short here; the "why he fits" list spells out "עובד איתך כעת במשרה אחרת".
const RELATIONSHIP_CHIP: Record<
  WorkerContractorRelationship,
  { label: string; tone: 'success' | 'info' | 'neutral' } | null
> = {
  never: null,
  current: { label: 'עובד איתך כעת', tone: 'success' },
  past: { label: 'עבדתם יחד בעבר', tone: 'info' },
};

const SmartMatchWorkerCard: React.FC<Props> = ({
  worker,
  result,
  relationship,
  jobCity,
  invited,
  assigned,
  onPressProfile,
  onInvite,
}) => {
  const professions = workerProfessions(worker);
  const sameCity = !!worker.city && worker.city === jobCity;
  const locationText =
    result.distanceKm != null
      ? `כ-${Math.round(result.distanceKm)} ק"מ ממיקום העבודה`
      : sameCity
      ? 'אותה עיר כמו המשרה'
      : `${worker.city} · עיר שונה מהמשרה`;

  return (
    <View style={styles.card}>
      {/* ---- header ---- */}
      <TouchableOpacity
        style={styles.head}
        onPress={onPressProfile}
        activeOpacity={0.85}
      >
        <WorkerAvatar worker={worker} size={48} />
        <View style={styles.headBody}>
          <View style={styles.nameRow}>
            {worker.isAvailable && <View style={styles.availDot} />}
            <Text style={styles.name} numberOfLines={1}>
              {worker.fullName}
            </Text>
          </View>
          <Text style={styles.sub} numberOfLines={1}>
            {professions.join(' · ')}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {worker.city} · {worker.experienceYears} שנות ניסיון
          </Text>
        </View>
        <SmartMatchScore percent={result.matchPercent} level={result.matchLevel} />
      </TouchableOpacity>

      {/* ---- quick facts ---- */}
      <View style={styles.facts}>
        <StatusBadge
          label={
            worker.isAvailable ? 'זמין עכשיו' : 'לא סומן כזמין'
          }
          tone={worker.isAvailable ? 'success' : 'neutral'}
          small
        />
        {!assigned && RELATIONSHIP_CHIP[relationship] && (
          <StatusBadge
            label={RELATIONSHIP_CHIP[relationship]!.label}
            tone={RELATIONSHIP_CHIP[relationship]!.tone}
            small
          />
        )}
        <StatusBadge
          label={COMPENSATION_LABEL[result.compensationStatus]}
          tone={COMP_TONE[result.compensationStatus]}
          small
        />
      </View>

      <View style={styles.locationRow}>
        <Ionicons name="navigate-outline" size={13} color={Colors.textMuted} />
        <Text style={styles.locationText}>{locationText}</Text>
      </View>

      <View style={styles.divider} />

      <SmartMatchBreakdown
        strengths={result.strengths}
        concerns={result.concerns}
      />

      {/* Renders only once a backend supplies aiSummary. */}
      <SmartMatchExplanation summary={result.aiSummary} />

      {/* ---- actions ---- */}
      <View style={styles.actions}>
        {assigned ? (
          <View style={[styles.cta, styles.ctaDone]}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={[styles.ctaText, styles.ctaDoneText]}>משובץ למשרה זו</Text>
          </View>
        ) : invited ? (
          <View style={[styles.cta, styles.ctaDone]}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
            <Text style={[styles.ctaText, styles.ctaDoneText]}>הוזמן למשרה</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.cta, styles.ctaPrimary]}
            onPress={onInvite}
            activeOpacity={0.85}
          >
            <Ionicons name="paper-plane" size={16} color={Colors.white} />
            <Text style={[styles.ctaText, styles.ctaPrimaryText]}>הזמן לעבודה</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.cta, styles.ctaSecondary]}
          onPress={onPressProfile}
          activeOpacity={0.85}
        >
          <Ionicons name="person-outline" size={16} color={Colors.primary} />
          <Text style={[styles.ctaText, styles.ctaSecondaryText]}>צפה בפרופיל</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...Shadow.medium,
  },
  head: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headBody: { flex: 1, gap: 2 },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  availDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  name: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  facts: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  locationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray100,
    marginVertical: 2,
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: Spacing.sm,
    marginTop: 2,
  },
  cta: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    minHeight: 44,
  },
  ctaPrimary: { backgroundColor: Colors.primary },
  ctaPrimaryText: { color: Colors.white },
  ctaSecondary: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.white,
  },
  ctaSecondaryText: { color: Colors.primary },
  ctaDone: { backgroundColor: '#DCFCE7' },
  ctaDoneText: { color: Colors.success },
  ctaText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
});

export default SmartMatchWorkerCard;
