import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { rankWorkersForJob, matchBand } from '../utils/matching';
import { isOpenForApplications } from '../services/jobStatusService';
import { Contractor, JobPost, MatchResult } from '../types';
import { jobProfessions } from '../utils/normalize';

interface Props {
  initialJobId?: string;
  onBack: () => void;
  onOpenWorkerProfile: (workerId: string) => void;
  onOpenJobDetails: (jobId: string) => void;
}

const SmartMatchScreen: React.FC<Props> = ({
  initialJobId,
  onBack,
  onOpenWorkerProfile,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, jobs, workers, invitations, sendInvitation } = useApp();
  const me = currentUser as Contractor | undefined;

  // Canonical "open to registration" check — same source of truth every
  // other screen uses. A job that filled its capacity is auto-closed
  // (acceptingApplications === false) and correctly drops out here.
  const myOpenJobs = useMemo(
    () =>
      jobs.filter(
        (j) => j.contractorId === me?.id && isOpenForApplications(j)
      ),
    [jobs, me]
  );

  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    initialJobId ?? myOpenJobs[0]?.id ?? null
  );

  useEffect(() => {
    if (!selectedJobId && myOpenJobs[0]) {
      setSelectedJobId(myOpenJobs[0].id);
    }
  }, [myOpenJobs, selectedJobId]);

  const selectedJob = useMemo<JobPost | undefined>(
    () => myOpenJobs.find((j) => j.id === selectedJobId),
    [myOpenJobs, selectedJobId]
  );

  const ranked = useMemo<MatchResult[]>(
    () => (selectedJob ? rankWorkersForJob(workers, selectedJob) : []),
    [workers, selectedJob]
  );

  // Only a still-live invitation (pending / accepted) marks a worker as
  // "already invited" and hides the invite button. A historical
  // declined / expired / cancelled record — including one auto-cancelled
  // because the job was momentarily full — must NOT block a fresh invite
  // once a seat frees up again.
  const invitedWorkerIds = useMemo(() => {
    if (!selectedJobId) return new Set<string>();
    return new Set(
      invitations
        .filter(
          (i) =>
            i.jobId === selectedJobId &&
            (i.status === 'pending' || i.status === 'accepted')
        )
        .map((i) => i.workerId)
    );
  }, [invitations, selectedJobId]);

  const handleInvite = (workerId: string, workerName: string) => {
    if (!selectedJobId || !me) return;
    const created = sendInvitation(selectedJobId, me.id, workerId);
    if (!created) {
      Alert.alert('כל המקומות במשרה כבר אוישו.');
      return;
    }
    Alert.alert('הזמנה נשלחה', `ההזמנה נשלחה ל-${workerName}.`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">התאמה חכמה</Text>
      </View>

      {myOpenJobs.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Ionicons name="sparkles" size={20} color={Colors.primary} />
            <Text style={styles.introText}>
              המערכת מדרגת עובדים מאושרים על פי מקצוע, מיקום, זמינות
              והסמכות.
            </Text>
          </View>
          <View style={styles.emptyWrap}>
            <Ionicons
              name="briefcase-outline"
              size={56}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyTitle}>אין משרות פתוחות</Text>
            <Text style={styles.emptySub}>
              פרסם משרה חדשה כדי להפעיל התאמה חכמה.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={ranked}
          keyExtractor={(m) => m.worker.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={styles.intro}>
                <Ionicons name="sparkles" size={20} color={Colors.primary} />
                <Text style={styles.introText}>
                  המערכת מדרגת עובדים מאושרים על פי מקצוע, מיקום, זמינות
                  והסמכות.
                </Text>
              </View>

              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>בחר משרה</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.jobChipRow}
              >
                {myOpenJobs.map((j) => {
                  const active = j.id === selectedJobId;
                  return (
                    <TouchableOpacity
                      key={j.id}
                      style={[styles.jobChip, active && styles.jobChipActive]}
                      onPress={() => setSelectedJobId(j.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.jobChipTitle,
                          active && styles.jobChipTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {j.title}
                      </Text>
                      <Text
                        style={[
                          styles.jobChipMeta,
                          active && styles.jobChipMetaActive,
                        ]}
                      >
                        {jobProfessions(j).join(', ')} · {j.city}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedJob && (
                <TouchableOpacity
                  style={styles.jobDetailsLink}
                  onPress={() => onOpenJobDetails(selectedJob.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={Colors.secondary}
                  />
                  <Text style={styles.jobDetailsLinkText}>
                    הצג פרטי משרה
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>
                  {ranked.length} מועמדים מתאימים
                </Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                אין עובדים מתאימים כרגע. נסה משרה אחרת.
              </Text>
            </View>
          }
          renderItem={({ item: m }) => (
            <MatchCard
              match={m}
              invited={invitedWorkerIds.has(m.worker.id)}
              onPressWorker={() => onOpenWorkerProfile(m.worker.id)}
              onInvite={() => handleInvite(m.worker.id, m.worker.fullName)}
            />
          )}
        />
      )}
    </View>
  );
};

// ---------- subcomponents ----------

const MatchCard: React.FC<{
  match: MatchResult;
  invited: boolean;
  onPressWorker: () => void;
  onInvite: () => void;
}> = ({ match, invited, onPressWorker, onInvite }) => {
  const w = match.worker;
  const band = matchBand(match.matchScore);
  const tone =
    band.tone === 'success'
      ? Colors.success
      : band.tone === 'info'
      ? Colors.info
      : band.tone === 'warning'
      ? Colors.warning
      : Colors.danger;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHead}
        onPress={onPressWorker}
        activeOpacity={0.85}
      >
        <View style={[styles.scoreRing, { borderColor: tone }]}>
          <Text style={[styles.scoreValue, { color: tone }]}>
            {match.matchScore}
          </Text>
          <Text style={styles.scoreLabel}>%</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            {w.isAvailable && <View style={styles.dot} />}
            <Text style={styles.name}>{w.fullName}</Text>
          </View>
          <Text style={styles.profession}>
            {w.profession} · {w.experienceYears} שנים · {w.city}
          </Text>
          <View style={{ marginTop: 4, alignItems: 'flex-end' }}>
            <StatusBadge label={band.label} tone={band.tone} small />
          </View>
        </View>
      </TouchableOpacity>

      {/* Reasons */}
      <View style={styles.reasons}>
        {match.reasons.map((r, idx) => (
          <View key={idx} style={styles.reasonRow}>
            <Text style={styles.reasonScore}>
              {r.score >= 0 ? `+${r.score}` : r.score}
            </Text>
            <View style={{ flex: 1 }}>
              <View style={styles.reasonBarBg}>
                <View
                  style={[
                    styles.reasonBar,
                    {
                      width: `${Math.max(
                        0,
                        Math.min(100, (Math.abs(r.score) / r.weight) * 100)
                      )}%`,
                      backgroundColor:
                        r.score >= 0 ? Colors.success : Colors.danger,
                    },
                  ]}
                />
              </View>
            </View>
            <Text style={styles.reasonLabel}>{r.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.inviteBtn, invited && styles.invitedBtn]}
        onPress={onInvite}
        disabled={invited}
        activeOpacity={0.85}
      >
        <Ionicons
          name={invited ? 'checkmark-circle' : 'paper-plane'}
          size={16}
          color={invited ? Colors.success : Colors.white}
        />
        <Text style={[styles.inviteText, invited && styles.invitedText]}>
          {invited ? 'הוזמן' : 'הזמן לעבודה'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ---------- styles ----------

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
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
    top: Spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  intro: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.primaryFaint,
    margin: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  introText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },

  sectionHead: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'flex-end',
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  jobChipRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  jobChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.textMuted,
    backgroundColor: Colors.white,
    minWidth: 180,
    alignItems: 'flex-end',
  },
  jobChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  jobChipTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  jobChipTitleActive: { color: Colors.white },
  jobChipMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    marginTop: 2,
  },
  jobChipMetaActive: { color: 'rgba(255,255,255,0.85)' },

  jobDetailsLink: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 4,
    marginTop: 6,
  },
  jobDetailsLinkText: {
    fontSize: FontSize.xs,
    color: Colors.secondary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  card: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: 10,
    ...Shadow.medium,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  scoreValue: { fontSize: FontSize.lg, fontWeight: '800' },
  scoreLabel: { fontSize: 9, color: Colors.textMuted, marginTop: -3 },

  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  profession: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
    marginTop: 2,
  },

  reasons: { gap: 4 },
  reasonRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  reasonLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    width: 110,
    textAlign: 'right',
  },
  reasonBarBg: {
    height: 6,
    backgroundColor: Colors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  reasonBar: {
    height: '100%',
    borderRadius: 3,
  },
  reasonScore: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    width: 30,
  },

  inviteBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  invitedBtn: {
    backgroundColor: '#DCFCE7',
  },
  inviteText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  invitedText: {
    color: Colors.success,
  },

  empty: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  emptyWrap: {
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: 8,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
    marginTop: 8,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default SmartMatchScreen;
