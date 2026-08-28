import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import StaffingProgress from '../components/StaffingProgress';
import { getRegistrationStatus, isOpenForApplications } from '../services/jobStatusService';
import {
  APPLICATION_STATUS_LABEL,
  APPLICATION_STATUS_TONE,
} from '../utils/helpers';
import { Contractor, Worker } from '../types';

interface Props {
  onOpenMyJobs: () => void;
  onOpenApplicationsReceived: () => void;
  onOpenSentInvitations: () => void;
  onOpenContractorProfile: () => void;
  onOpenPostJob: () => void;
  onOpenSearchWorkers: () => void;
  onOpenFavoriteWorkers: () => void;
  onOpenSmartMatch: () => void;
  onOpenMessages: () => void;
  onOpenNotifications: () => void;
  onOpenSupport: () => void;
  onOpenJobDetails: (jobId: string) => void;
}

const ContractorDashboard: React.FC<Props> = ({
  onOpenMyJobs,
  onOpenApplicationsReceived,
  onOpenSentInvitations,
  onOpenContractorProfile,
  onOpenPostJob,
  onOpenSearchWorkers,
  onOpenFavoriteWorkers,
  onOpenSmartMatch,
  onOpenMessages,
  onOpenNotifications,
  onOpenSupport,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    jobs,
    applications,
    invitations,
    notifications,
    getUserById,
    getStaffingProgress,
  } = useApp();

  const me = currentUser as Contractor | undefined;

  // ---- Real-source derivations ----
  const myJobs = useMemo(
    () => jobs.filter((j) => j.contractorId === me?.id),
    [jobs, me]
  );
  const myJobIds = useMemo(() => myJobs.map((j) => j.id), [myJobs]);

  // Registration Status is the single source of truth for "open to
  // applications" — never job.status, never jobs.length.
  const openForApplicationsJobs = useMemo(
    () => myJobs.filter(isOpenForApplications),
    [myJobs]
  );

  const newApplications = useMemo(
    () =>
      applications.filter(
        (a) => myJobIds.includes(a.jobId) && a.status === 'pending'
      ),
    [applications, myJobIds]
  );

  const activeInvitations = useMemo(
    () =>
      invitations.filter(
        (i) => i.contractorId === me?.id && i.status === 'pending'
      ),
    [invitations, me]
  );

  const myUnreadNotifications = useMemo(
    () =>
      notifications.filter((n) => n.userId === me?.id && !n.isRead).length,
    [notifications, me]
  );

  // Recent applications (top 3, sorted by submission date desc)
  const recentApplications = useMemo(() => {
    const all = applications.filter((a) => myJobIds.includes(a.jobId));
    return [...all]
      .sort(
        (a, b) =>
          new Date(b.appliedAt).getTime() -
          new Date(a.appliedAt).getTime()
      )
      .slice(0, 3);
  }, [applications, myJobIds]);

  // Recent jobs (top 3, sorted by postedAt desc)
  const recentJobs = useMemo(
    () =>
      [...myJobs]
        .sort(
          (a, b) =>
            new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        )
        .slice(0, 3),
    [myJobs]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.secondary, Colors.secondaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={onOpenContractorProfile}
              style={styles.headerIconBtn}
            >
              <Ionicons
                name="person-outline"
                size={22}
                color={Colors.white}
              />
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
            <View style={styles.avatarCircle}>
              <Ionicons name="business" size={26} color={Colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>שלום, {me?.fullName}</Text>
              <Text style={styles.role}>
                {me?.companyName ?? 'קבלן ראשי'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stat cards — all clickable */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="briefcase-outline"
            tint={Colors.primary}
            label="משרות פתוחות להרשמה"
            value={openForApplicationsJobs.length}
            onPress={onOpenMyJobs}
          />
          <StatCard
            icon="people-outline"
            tint={Colors.success}
            label="בקשות חדשות"
            value={newApplications.length}
            onPress={onOpenApplicationsReceived}
            highlight={newApplications.length > 0}
          />
          <StatCard
            icon="paper-plane-outline"
            tint={Colors.info}
            label="הזמנות פעילות"
            value={activeInvitations.length}
            onPress={onOpenSentInvitations}
          />
        </View>

        {/* Quick actions */}
        <SectionHeader title="פעולות מהירות" />
        <View style={styles.quickRow}>
          <QuickAction
            icon="add-circle-outline"
            label="פרסם משרה"
            onPress={onOpenPostJob}
            primary
          />
          <QuickAction
            icon="search-outline"
            label="חפש עובדים"
            onPress={onOpenSearchWorkers}
          />
          <QuickAction
            icon="heart-outline"
            label="עובדים מועדפים"
            onPress={onOpenFavoriteWorkers}
          />
          <QuickAction
            icon="sparkles-outline"
            label="התאמה חכמה"
            onPress={onOpenSmartMatch}
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

        {/* Recent applications */}
        <SectionHeader
          title="בקשות אחרונות"
          actionLabel={recentApplications.length > 0 ? 'הצג הכל' : undefined}
          onAction={onOpenApplicationsReceived}
        />
        {recentApplications.length === 0 ? (
          <EmptyRow text="אין בקשות חדשות מעובדים" />
        ) : (
          recentApplications.map((app) => {
            const job = jobs.find((j) => j.id === app.jobId);
            const worker = getUserById(app.workerId) as Worker | undefined;
            return (
              <TouchableOpacity
                key={app.id}
                style={styles.row}
                activeOpacity={0.85}
                onPress={() =>
                  job ? onOpenJobDetails(job.id) : onOpenApplicationsReceived()
                }
              >
                <View
                  style={[
                    styles.rowIcon,
                    { backgroundColor: Colors.primaryFaint },
                  ]}
                >
                  <Ionicons name="hammer" size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {worker?.fullName ?? 'עובד לא ידוע'}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {worker?.profession ?? ''} · על המשרה{' '}
                    {job?.title ?? ''}
                  </Text>
                </View>
                <StatusBadge
                  label={APPLICATION_STATUS_LABEL[app.status]}
                  tone={APPLICATION_STATUS_TONE[app.status]}
                  small
                />
              </TouchableOpacity>
            );
          })
        )}

        {/* Recent jobs */}
        <SectionHeader
          title="המשרות שלי"
          actionLabel={myJobs.length > 0 ? 'הצג הכל' : undefined}
          onAction={onOpenMyJobs}
        />
        {recentJobs.length === 0 ? (
          <EmptyRow text="עדיין לא פרסמת משרות" />
        ) : (
          recentJobs.map((job) => {
            const candidatesCount = applications.filter(
              (a) => a.jobId === job.id && a.status === 'pending'
            ).length;
            const registrationStatus = getRegistrationStatus(job);
            const staffing = getStaffingProgress(job.id);
            return (
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
                    {candidatesCount} מועמדים · {job.city}
                  </Text>
                  <View style={styles.rowStaffing}>
                    <StaffingProgress progress={staffing} compact />
                  </View>
                </View>
                <StatusBadge
                  label={registrationStatus.label}
                  tone={registrationStatus.tone}
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
        color={primary ? Colors.white : Colors.secondary}
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
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderColor: Colors.success,
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
  rowStaffing: { marginTop: 6, maxWidth: 160 },

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

export default ContractorDashboard;
