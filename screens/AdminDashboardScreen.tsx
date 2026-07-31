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

interface Props {
  onOpenPendingRegistrations: () => void;
  onOpenUserManagement: (filter?: 'all' | 'approved' | 'blocked' | 'rejected') => void;
  onOpenSupportTickets: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenRegistrationDetails: (registrationId: string) => void;
  onOpenTicketDetails: (ticketId: string) => void;
  onLogout: () => void;
}

const AdminDashboardScreen: React.FC<Props> = ({
  onOpenPendingRegistrations,
  onOpenUserManagement,
  onOpenSupportTickets,
  onOpenNotifications,
  onOpenSettings,
  onOpenRegistrationDetails,
  onOpenTicketDetails,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    registrations,
    workers,
    contractors,
    supportTickets,
    notifications,
  } = useApp();

  // ---- Real-source derivations ----
  const pendingRegs = useMemo(
    () => registrations.filter((r) => r.status === 'pending'),
    [registrations]
  );
  const approvedCount = useMemo(
    () =>
      workers.filter((w) => w.status === 'approved').length +
      contractors.filter((c) => c.status === 'approved').length,
    [workers, contractors]
  );
  const blockedCount = useMemo(
    () =>
      workers.filter((w) => w.status === 'blocked').length +
      contractors.filter((c) => c.status === 'blocked').length,
    [workers, contractors]
  );
  const openTickets = useMemo(
    () =>
      supportTickets.filter(
        (t) => t.status === 'open' || t.status === 'in_progress'
      ),
    [supportTickets]
  );
  const myUnreadNotifications = useMemo(
    () =>
      notifications.filter(
        (n) => n.userId === currentUser?.id && !n.isRead
      ).length,
    [notifications, currentUser]
  );

  const recentPendingRegs = pendingRegs.slice(0, 3);
  const recentOpenTickets = openTickets.slice(0, 3);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Header */}
        <LinearGradient
          colors={[Colors.secondary, Colors.secondaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={onLogout} style={styles.headerIconBtn}>
              <Ionicons name="log-out-outline" size={22} color={Colors.white} />
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
                  <Text style={styles.dotText}>{myUnreadNotifications}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.headerBody}>
            <View style={styles.shieldCircle}>
              <Ionicons
                name="shield-checkmark"
                size={28}
                color={Colors.white}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>שלום, {currentUser?.fullName}</Text>
              <Text style={styles.role}>מנהל מערכת BuildUp</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="hourglass-outline"
            tint={Colors.warning}
            label="בקשות ממתינות"
            value={pendingRegs.length}
            onPress={onOpenPendingRegistrations}
          />
          <StatCard
            icon="people-outline"
            tint={Colors.success}
            label="משתמשים פעילים"
            value={approvedCount}
            onPress={() => onOpenUserManagement('approved')}
          />
          <StatCard
            icon="ban-outline"
            tint={Colors.danger}
            label="משתמשים חסומים"
            value={blockedCount}
            onPress={() => onOpenUserManagement('blocked')}
          />
          <StatCard
            icon="help-buoy-outline"
            tint={Colors.info}
            label="פניות פתוחות"
            value={openTickets.length}
            onPress={onOpenSupportTickets}
          />
        </View>

        {/* Quick actions */}
        <SectionHeader title="פעולות מהירות" />
        <View style={styles.quickRow}>
          <QuickAction
            icon="checkmark-done-outline"
            label="אשר רישומים"
            onPress={onOpenPendingRegistrations}
          />
          <QuickAction
            icon="people-outline"
            label="ניהול משתמשים"
            onPress={() => onOpenUserManagement('all')}
          />
          <QuickAction
            icon="chatbubbles-outline"
            label="פניות תמיכה"
            onPress={onOpenSupportTickets}
          />
          <QuickAction
            icon="settings-outline"
            label="הגדרות"
            onPress={onOpenSettings}
          />
        </View>

        {/* Recent pending registrations */}
        <SectionHeader
          title="רישומים ממתינים אחרונים"
          actionLabel={pendingRegs.length > 3 ? 'הצג הכל' : undefined}
          onAction={onOpenPendingRegistrations}
        />
        {recentPendingRegs.length === 0 ? (
          <EmptyRow text="אין בקשות רישום ממתינות כרגע" />
        ) : (
          recentPendingRegs.map((reg) => (
            <TouchableOpacity
              key={reg.id}
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => onOpenRegistrationDetails(reg.id)}
            >
              <View style={styles.rowIcon}>
                <Ionicons
                  name={reg.role === 'worker' ? 'hammer' : 'business'}
                  size={20}
                  color={Colors.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{reg.data.fullName}</Text>
                <Text style={styles.rowSub}>
                  {reg.role === 'worker' ? 'עובד' : 'קבלן'} · ת.ז{' '}
                  <Text style={{ writingDirection: 'ltr' }}>
                    {reg.data.idNumber}
                  </Text>
                </Text>
              </View>
              <StatusBadge label="ממתין" tone="warning" small />
            </TouchableOpacity>
          ))
        )}

        {/* Recent open tickets */}
        <SectionHeader
          title="פניות תמיכה פתוחות"
          actionLabel={openTickets.length > 3 ? 'הצג הכל' : undefined}
          onAction={onOpenSupportTickets}
        />
        {recentOpenTickets.length === 0 ? (
          <EmptyRow text="אין פניות פתוחות כרגע" />
        ) : (
          recentOpenTickets.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => onOpenTicketDetails(t.id)}
            >
              <View
                style={[
                  styles.rowIcon,
                  { backgroundColor: '#DBEAFE' },
                ]}
              >
                <Ionicons name="mail-outline" size={20} color={Colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t.subject}</Text>
                <Text style={styles.rowSub}>
                  {t.userRole === 'worker' ? 'עובד' : 'קבלן'} · {ticketTypeLabel(t.type)}
                </Text>
              </View>
              <StatusBadge
                label={t.status === 'open' ? 'פתוח' : 'בטיפול'}
                tone={t.status === 'open' ? 'danger' : 'warning'}
                small
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

// ---------- subcomponents ----------

function ticketTypeLabel(t: string): string {
  switch (t) {
    case 'complaint':
      return 'תלונה';
    case 'claim':
      return 'תביעה';
    case 'question':
      return 'שאלה';
    case 'technical':
      return 'תקלה';
    default:
      return t;
  }
}

const StatCard: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  value: number;
  onPress: () => void;
}> = ({ icon, tint, label, value, onPress }) => (
  <TouchableOpacity
    style={styles.statCard}
    activeOpacity={0.85}
    onPress={onPress}
  >
    <View style={[styles.statIcon, { backgroundColor: tint + '22' }]}>
      <Ionicons name={icon} size={22} color={tint} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
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
}> = ({ icon, label, onPress }) => (
  <TouchableOpacity
    style={styles.quickCard}
    activeOpacity={0.85}
    onPress={onPress}
  >
    <Ionicons name={icon} size={26} color={Colors.secondary} />
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

const SectionHeader: React.FC<{
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, actionLabel, onAction }) => (
  <View style={styles.sectionHead}>
    {actionLabel && (
      <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
        <Text style={styles.sectionAction}>{actionLabel}</Text>
      </TouchableOpacity>
    )}
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const EmptyRow: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.empty}>
    <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
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
  dotText: {
    fontSize: 10,
    color: Colors.white,
    fontWeight: '800',
  },
  headerBody: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
  },
  shieldCircle: {
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
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: 8,
    ...Shadow.medium,
  },
  quickLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'center',
  },

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
    backgroundColor: '#FEF3C7',
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

export default AdminDashboardScreen;
