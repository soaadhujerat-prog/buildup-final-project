import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import ContractorAvatar from '../components/ContractorAvatar';
import StatusBadge from '../components/StatusBadge';
import SharedWorkHistorySheet from '../components/SharedWorkHistorySheet';
import { callPhone } from '../utils/contact';
import { RELATIONSHIP_BADGE } from '../utils/helpers';
import { getWorkerContractorRelationship } from '../services/assignmentService';
import { isOpenForApplications } from '../services/jobStatusService';
import { contractorAreas } from '../utils/normalize';
import { Contractor } from '../types';

interface Props {
  contractorId: string;
  onBack: () => void;
  onOpenChat?: (contractorId: string) => void;
  onOpenJobDetails?: (jobId: string) => void;
}

/**
 * SAFE, worker-facing contractor profile — reached from a favorite contractor
 * card ("צפה בפרופיל"). Deliberately a SEPARATE screen from
 * ContractorProfileScreen (the contractor's own self-only profile: licence
 * number/details/dates/document, own national-ID reveal, edit/settings).
 * ContractorProfileScreen is hard-wired to `currentUser` and was never built
 * to branch safely between self/other — retrofitting it would have meant
 * threading a worker/self conditional through every private field, which is
 * exactly the "fragile" case worth a dedicated file for. This screen only
 * ever reads the contractor from the resolved `Contractor` object already
 * loaded by AppContext (via loadContractorSummaries / loadJobPublisherSummaries
 * / loadMyFavoriteContractorSummaries — all narrow, safe-column readers), and
 * never imports anything self-only (no useSelfIdNumber, no licence fields, no
 * AttachedDocument for the licence, no edit/settings props).
 *
 * Mirrors WorkerProfileScreen's visual language (hero card, relationship
 * card + SharedWorkHistorySheet, section/field rows, contact action bar) so
 * the two "view someone else's safe profile" screens read as one system.
 */
const ContractorPublicProfileScreen: React.FC<Props> = ({
  contractorId,
  onBack,
  onOpenChat,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getUserById,
    jobs,
    assignments,
    isFavoriteContractor,
    toggleFavoriteContractor,
  } = useApp();

  const contractor = getUserById(contractorId) as Contractor | undefined;
  const isWorker = currentUser?.role === 'worker';
  const workerId = isWorker ? currentUser!.id : null;

  const [historyVisible, setHistoryVisible] = useState(false);

  const isFavorite =
    isWorker && workerId ? isFavoriteContractor(workerId, contractorId) : false;
  const handleToggleFavorite = () => {
    if (!workerId) return;
    toggleFavoriteContractor(workerId, contractorId);
  };

  // Truthful, real-Assignment-derived relationship — never fabricated.
  const relationship = workerId
    ? getWorkerContractorRelationship(assignments, workerId, contractorId)
    : 'never';

  const openJobsCount = useMemo(
    () =>
      jobs.filter((j) => j.contractorId === contractorId && isOpenForApplications(j))
        .length,
    [jobs, contractorId]
  );

  const locationLabel = contractor
    ? [contractor.city, ...contractorAreas(contractor)].filter(Boolean).join(' · ')
    : '';

  if (!contractor || contractor.role !== 'contractor') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>הקבלן לא נמצא</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">פרופיל קבלן</Text>
        {isWorker && (
          <TouchableOpacity
            onPress={handleToggleFavorite}
            style={styles.favoriteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={isFavorite ? 'הסר מהמועדפים' : 'הוסף למועדפים'}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? '#E0245E' : Colors.text}
            />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <ContractorAvatar
            contractor={contractor}
            size={72}
            iconColor={Colors.white}
            fallbackBg={Colors.secondary}
          />
          <View style={styles.heroBody}>
            <Text style={styles.heroName} numberOfLines={1}>
              {contractor.companyName || contractor.fullName}
            </Text>
            {!!locationLabel && (
              <Text style={styles.heroMeta} numberOfLines={1}>
                {locationLabel}
              </Text>
            )}
            <View style={styles.heroBadges}>
              <Ionicons name="briefcase-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.heroJobsText}>{openJobsCount} משרות פתוחות</Text>
            </View>
          </View>
        </View>

        {/* Professional-history relationship — worker viewing contractor */}
        {isWorker && (
          <View style={styles.relationshipCard}>
            <View style={styles.relationshipTop}>
              <StatusBadge
                label={RELATIONSHIP_BADGE[relationship].label}
                tone={RELATIONSHIP_BADGE[relationship].tone}
              />
              <Text style={styles.relationshipHint}>היכרות מקצועית</Text>
            </View>
            {relationship !== 'never' && (
              <TouchableOpacity
                style={styles.historyCta}
                onPress={() => setHistoryVisible(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="time-outline" size={16} color={Colors.primary} />
                <Text style={styles.historyCtaText}>
                  צפה בהיסטוריית עבודות משותפות
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Bio */}
        {!!contractor.bio && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>אודות</Text>
            </View>
            <Text style={styles.body}>{contractor.bio}</Text>
          </View>
        )}
      </ScrollView>

      {/* Contact actions — call / message, same product rules as JobDetails
          "פורסם על ידי": call() only when a phone is actually present; a
          conversation is always start-able (get_or_create_direct_conversation
          has no relationship requirement — unchanged here). */}
      {isWorker && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => onOpenChat?.(contractor.id)}
              activeOpacity={0.85}
              accessibilityLabel={`שלח הודעה ל${contractor.companyName || contractor.fullName}`}
            >
              <Ionicons name="chatbubble-outline" size={16} color={Colors.primary} />
              <Text style={styles.contactBtnText}>שלח הודעה</Text>
            </TouchableOpacity>
            {!!contractor.phone && (
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => callPhone(contractor.phone)}
                activeOpacity={0.85}
                accessibilityLabel={`התקשר ל${contractor.companyName || contractor.fullName}`}
              >
                <Ionicons name="call-outline" size={16} color={Colors.primary} />
                <Text style={styles.contactBtnText}>התקשר</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {isWorker && workerId && (
        <SharedWorkHistorySheet
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          workerId={workerId}
          contractorId={contractor.id}
          onOpenJob={
            onOpenJobDetails
              ? (jobId) => {
                  setHistoryVisible(false);
                  onOpenJobDetails(jobId);
                }
              : undefined
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { position: 'absolute', right: Spacing.lg, top: Spacing.md, padding: 4 },
  favoriteBtn: { position: 'absolute', left: Spacing.lg, top: Spacing.md, padding: 4 },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },
  backLink: { alignItems: 'center', marginTop: 12 },
  backLinkText: { color: Colors.primary, fontWeight: '700' },

  heroCard: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.medium,
  },
  heroBody: { flex: 1, gap: 2 },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroBadges: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  heroJobsText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },

  relationshipCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 10,
    ...Shadow.small,
  },
  relationshipTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  relationshipHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },
  historyCta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  historyCtaText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  sectionHead: { width: '100%', alignItems: 'flex-end', marginBottom: 8 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  body: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  contactRow: { flexDirection: 'row-reverse', gap: 8 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  contactBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
});

export default ContractorPublicProfileScreen;
