import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import { Worker, ApplicationStatus } from '../types';

interface Props {
  onOpenProProfile: () => void;
  onOpenAvailableJobs: () => void;
  onOpenMyApplications: (initialFilter?: 'all' | ApplicationStatus) => void;
  onOpenInvitations: () => void;
  onOpenAvailability: () => void;
  onOpenMessages: () => void;
  onOpenNotifications: () => void;
  onOpenSupport: () => void;
  onOpenJobDetails: (jobId: string) => void;
  onOpenMyAssignments: () => void;
}

const WorkerDashboard: React.FC<Props> = ({
  onOpenProProfile,
  onOpenAvailableJobs,
  onOpenMyApplications,
  onOpenInvitations,
  onOpenAvailability,
  onOpenMessages,
  onOpenNotifications,
  onOpenSupport,
  onOpenJobDetails,
  onOpenMyAssignments,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    jobs,
    applications,
    invitations,
    notifications,
    setWorkerAvailability,
  } = useApp();

  const me = currentUser as Worker | undefined;

  // ---- Real-source derivations per audit table ----

  // Active assignments: jobs the worker is actually assigned to via either
  //   - an application they sent that was accepted by the contractor, OR
  //   - an invitation from a contractor that they accepted.
  // De-duplicated by jobId so a worker assigned via both routes is counted once.
  const activeAssignmentsCount = useMemo(() => {
    if (!me) return 0;
    const jobIds = new Set<string>();
    applications.forEach((a) => {
      if (a.workerId === me.id && a.status === 'accepted') jobIds.add(a.jobId);
    });
    invitations.forEach((i) => {
      if (i.workerId === me.id && i.status === 'accepted') jobIds.add(i.jobId);
    });
    return jobIds.size;
  }, [me, applications, invitations]);

  // Active applications I sent that are still pending
  const activeApplications = useMemo(() => {
    if (!me) return [];
    return applications.filter(
      (a) => a.workerId === me.id && a.status === 'pending'
    );
  }, [me, applications]);

  // New invitations to me, status pending
  const pendingInvitations = useMemo(() => {
    if (!me) return [];
    return invitations.filter(
      (i) => i.workerId === me.id && i.status === 'pending'
    );
  }, [me, invitations]);

  // Recent invitations (top 3, all statuses)
  const recentInvitations = useMemo(() => {
    if (!me) return [];
    return [...invitations]
      .filter((i) => i.workerId === me.id)
      .sort(
        (a, b) =>
          new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      )
      .slice(0, 3);
  }, [me, invitations]);

  // Recommended jobs: status=open, profession or area match
  const recommendedJobs = useMemo(() => {
    if (!me) return [];
    return jobs
      .filter((j) => j.status === 'open')
      .filter((j) => {
        const sameCategory = j.professionCategory === me.professionCategory;
        const sameProfession = j.profession === me.profession;
        const inMyAreas =
          me.preferredAreas.some((a) => a) &&
          (j.city === me.city || me.preferredAreas.length > 0);
        return sameCategory || sameProfession || inMyAreas;
      })
      .slice(0, 3);
  }, [me, jobs]);

  const myUnreadNotifications = useMemo(
    () =>
      notifications.filter((n) => n.userId === me?.id && !n.isRead).length,
    [notifications, me]
  );

  if (!me) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.primary, Colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={onOpenProProfile}
              style={styles.headerIconBtn}
            >
              <Ionicons name="person-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onOpenNotifications}
              style={styles.headerIconBtn}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={Colors.white}
              />
              {myUnreadNotifications > 0 && (
                <View style={styles.dot}>
                  <Text style={styles.dotText}>
                    {myUnreadNotifications}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.headerBody}>
            <WorkerAvatar worker={me} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>שלום, {me.fullName}</Text>
              <Text style={styles.role}>
                {me.profession} · {me.experienceYears} שנות ניסיון
              </Text>
            </View>
          </View>

          {/* Availability quick toggle */}
          <View style={styles.availabilityCard}>
            <Switch
              value={me.isAvailable}
              onValueChange={(v) => setWorkerAvailability(me.id, v)}
              trackColor={{
                false: 'rgba(255,255,255,0.3)',
                true: Colors.success,
              }}
              thumbColor={Colors.white}
            />
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                onPress={onOpenAvailability}
                style={{ flex: 1, paddingVertical: 6 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.availTitle}>
                  {me.isAvailable ? 'זמין לעבודה' : 'לא זמין כרגע'}
                </Text>
                <Text style={styles.availSub}>
                  ניהול זמינות מתקדם →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        {/* Stats — all from real sources */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="briefcase-outline"
            tint={Colors.primary}
            label="שיבוצים פעילים"
            value={activeAssignmentsCount}
            onPress={onOpenMyAssignments}
          />
          <StatCard
            icon="time-outline"
            tint={Colors.warning}
            label="בקשות פעילות"
            value={activeApplications.length}
            onPress={() => onOpenMyApplications('pending')}
          />
          <StatCard
            icon="mail-unread-outline"
            tint={Colors.info}
            label="הזמנות חדשות"
            value={pendingInvitations.length}
            onPress={onOpenInvitations}
            highlight={pendingInvitations.length > 0}
          />
        </View>

        {/* Quick actions */}
        <SectionHeader title="פעולות מהירות" />
        <View style={styles.quickRow}>
          <QuickAction
            icon="search-outline"
            label="חיפוש עבודות"
            onPress={onOpenAvailableJobs}
            primary
          />
          <QuickAction
            icon="calendar-outline"
            label="ניהול זמינות"
            onPress={onOpenAvailability}
          />
          <QuickAction
            icon="person-outline"
            label="הפרופיל המקצועי"
            onPress={onOpenProProfile}
          />
          <QuickAction
            icon="chatbubbles-outline"
            label="הודעות"
            onPress={onOpenMessages}
          />
          <QuickAction
            icon="notifications-outline"
            label="התראות"
            onPress={onOpenNotifications}
          />
          <QuickAction
            icon="help-buoy-outline"
            label="תמיכה"
            onPress={onOpenSupport}
          />
        </View>

        {/* Recommended jobs */}
        <SectionHeader
          title="עבודות מומלצות עבורך"
          actionLabel={recommendedJobs.length > 0 ? 'הצג הכל' : undefined}
          onAction={onOpenAvailableJobs}
        />
        {recommendedJobs.length === 0 ? (
          <EmptyRow text="אין כרגע עבודות מתאימות לפרופיל שלך" />
        ) : (
          recommendedJobs.map((job) => (
            <TouchableOpacity
              key={job.id}
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => onOpenJobDetails(job.id)}
            >
              <View
                style={[styles.rowIcon, { backgroundColor: '#DBEAFE' }]}
              >
                <Ionicons
                  name="briefcase"
                  size={20}
                  color={Colors.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {job.title}
                </Text>
                <Text style={styles.rowSub}>
                  {job.profession} · {job.city} ·{' '}
                  <Text style={{ writingDirection: 'ltr' }}>
                    {job.dailyRate}₪/יום
                  </Text>
                </Text>
              </View>
              {job.urgent && (
                <StatusBadge label="דחוף" tone="danger" small />
              )}
            </TouchableOpacity>
          ))
        )}

        {/* Recent invitations */}
        <SectionHeader
          title="הזמנות אחרונות"
          actionLabel={recentInvitations.length > 0 ? 'הצג הכל' : undefined}
          onAction={onOpenInvitations}
        />
        {recentInvitations.length === 0 ? (
          <EmptyRow text="עדיין לא קיבלת הזמנות מקבלנים" />
        ) : (
          recentInvitations.map((inv) => {
            const job = jobs.find((j) => j.id === inv.jobId);
            return (
              <TouchableOpacity
                key={inv.id}
                style={styles.row}
                activeOpacity={0.85}
                onPress={onOpenInvitations}
              >
                <View
                  style={[
                    styles.rowIcon,
                    { backgroundColor: Colors.primaryFaint },
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {job?.title ?? 'משרה'}
                  </Text>
                  <Text style={[styles.rowSub, { writingDirection: 'ltr' }]}>
                    {new Date(inv.sentAt).toLocaleDateString('he-IL')}
                  </Text>
                </View>
                <StatusBadge
                  label={
                    inv.status === 'pending'
                      ? 'ממתין'
                      : inv.status === 'accepted'
                      ? 'אישרת'
                      : 'דחית'
                  }
                  tone={
                    inv.status === 'pending'
                      ? 'warning'
                      : inv.status === 'accepted'
                      ? 'success'
                      : 'danger'
                  }
                  small
                />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

// ---------- subcomponents ----------

const StatCard: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: number | string;
  onPress: () => void;
  highlight?: boolean;
  isString?: boolean;
}> = ({ icon, tint, label, value, onPress, highlight, isString }) => (
  <TouchableOpacity
    style={[styles.statCard, highlight && styles.statCardHighlight]}
    activeOpacity={0.85}
    onPress={onPress}
  >
    <View style={[styles.statIcon, { backgroundColor: tint + '22' }]}>
      <Ionicons name={icon} size={22} color={tint} />
    </View>
    <Text style={[styles.statValue, isString && { fontSize: FontSize.xl }]}>
      {value}
    </Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Ionicons
      name="chevron-back"
      size={14}
      color={Colors.textMuted}
      style={styles.chev}
    />
  </TouchableOpacity>
);

const QuickAction: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}> = ({ icon, label, onPress, primary }) => (
  <TouchableOpacity
    style={[styles.quickCard, primary && styles.quickCardPrimary]}
    activeOpacity={0.85}
    onPress={onPress}
  >
    <View
      style={[
        styles.quickIconWrap,
        primary
          ? { backgroundColor: 'rgba(255,255,255,0.2)' }
          : { backgroundColor: Colors.primaryFaint },
      ]}
    >
      <Ionicons
        name={icon}
        size={22}
        color={primary ? Colors.white : Colors.primary}
      />
    </View>
    <Text
      style={[styles.quickLabel, primary && styles.quickLabelPrimary]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const SectionHeader: React.FC<{
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, actionLabel, onAction }) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {actionLabel && (
      <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.empty}>
    <Ionicons
      name="information-circle-outline"
      size={20}
      color={Colors.textMuted}
    />
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

// ---------- styles ----------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -2,
    left: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontSize: 10, color: Colors.white, fontWeight: '800' },
  headerBody: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  hello: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  role: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  availabilityCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  availTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  availSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  statsGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  statCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.medium,
  },
  statCardHighlight: {
    borderWidth: 2,
    borderColor: Colors.info,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  statLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chev: { position: 'absolute', left: 12, top: 16 },

  sectionHead: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  sectionAction: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  quickRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  quickCard: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 6,
    ...Shadow.medium,
  },
  quickCardPrimary: { backgroundColor: Colors.primary },
  quickIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'center',
  },
  quickLabelPrimary: { color: Colors.white },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.medium,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  empty: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
});

export default WorkerDashboard;
