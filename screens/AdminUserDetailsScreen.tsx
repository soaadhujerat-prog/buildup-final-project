import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import { Contractor, Worker } from '../types';

interface Props {
  userId: string;
  onBack: () => void;
}

const AdminUserDetailsScreen: React.FC<Props> = ({ userId, onBack }) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getUserById,
    jobs,
    applications,
    invitations,
    supportTickets,
    blockUser,
    unblockUser,
  } = useApp();

  const user = getUserById(userId);
  const [blockModalVisible, setBlockModalVisible] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const activity = useMemo(() => {
    if (!user) return null;
    if (user.role === 'worker') {
      const apps = applications.filter((a) => a.workerId === user.id);
      const invs = invitations.filter((i) => i.workerId === user.id);
      const tix = supportTickets.filter((t) => t.userId === user.id);
      return {
        applicationsCount: apps.length,
        completedCount: apps.filter(
          (a) =>
            a.status === 'accepted' &&
            jobs.find((j) => j.id === a.jobId)?.status === 'completed'
        ).length,
        invitationsCount: invs.length,
        ticketsCount: tix.length,
      };
    }
    if (user.role === 'contractor') {
      const myJobs = jobs.filter((j) => j.contractorId === user.id);
      const myJobIds = myJobs.map((j) => j.id);
      const apps = applications.filter((a) => myJobIds.includes(a.jobId));
      const invs = invitations.filter((i) => i.contractorId === user.id);
      const tix = supportTickets.filter((t) => t.userId === user.id);
      return {
        jobsCount: myJobs.length,
        completedJobs: myJobs.filter((j) => j.status === 'completed').length,
        applicationsCount: apps.length,
        invitationsSent: invs.length,
        ticketsCount: tix.length,
      };
    }
    return null;
  }, [user, applications, invitations, supportTickets, jobs]);

  if (!user || user.role === 'admin') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>משתמש לא נמצא</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isWorker = user.role === 'worker';
  const w = isWorker ? (user as Worker) : null;
  const c = !isWorker ? (user as Contractor) : null;

  const handleBlockConfirm = () => {
    if (!blockReason.trim()) {
      Alert.alert('שגיאה', 'יש לציין סיבת חסימה');
      return;
    }
    blockUser(user.id, currentUser?.id ?? 'adm1', blockReason.trim());
    setBlockModalVisible(false);
    setBlockReason('');
    Alert.alert('המשתמש נחסם', `${user.fullName} נחסם/ה בהצלחה.`);
  };

  const handleUnblock = () => {
    Alert.alert(
      'ביטול חסימה',
      `לאשר את ביטול החסימה של ${user.fullName}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'בטל חסימה',
          style: 'default',
          onPress: () => {
            unblockUser(user.id, currentUser?.id ?? 'adm1');
            Alert.alert(
              'החסימה בוטלה',
              `החסימה של ${user.fullName} בוטלה בהצלחה.`
            );
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>פרטי משתמש</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          {isWorker && w ? (
            <WorkerAvatar worker={w} size={64} />
          ) : (
            <View style={[styles.heroIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="business" size={28} color={Colors.secondary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{user.fullName}</Text>
            <Text style={styles.heroRole}>
              {isWorker ? 'עובד' : 'קבלן'}
              {' · '}
              {isWorker ? w?.profession : c?.companyName}
            </Text>
            <View style={styles.heroBadges}>
              <StatusBadge
                label={user.status === 'approved' ? 'פעיל' : 'חסום'}
                tone={user.status === 'approved' ? 'success' : 'danger'}
                small
              />
            </View>
          </View>
        </View>

        {/* Activity stats — derived from real source data */}
        {activity && (
          <View style={styles.statsRow}>
            {isWorker ? (
              <>
                <StatChip
                  label="הגיש מועמדויות"
                  value={(activity as any).applicationsCount}
                />
                <StatChip
                  label="הזמנות שקיבל"
                  value={(activity as any).invitationsCount}
                />
                <StatChip
                  label="פניות תמיכה"
                  value={(activity as any).ticketsCount}
                />
              </>
            ) : (
              <>
                <StatChip
                  label="משרות שפרסם"
                  value={(activity as any).jobsCount}
                />
                <StatChip
                  label="הזמנות ששלח"
                  value={(activity as any).invitationsSent}
                />
                <StatChip
                  label="מועמדים שקיבל"
                  value={(activity as any).applicationsCount}
                />
              </>
            )}
          </View>
        )}

        {/* Identity */}
        <Section title="פרטי קשר">
          <FieldRow label="שם מלא" value={user.fullName} />
          <FieldRow label="תעודת זהות" value={user.idNumber} mono ltr />
          <FieldRow
            label="טלפון"
            value={user.phone}
            ltr
            onPress={() => Linking.openURL(`tel:${user.phone}`)}
          />
          <FieldRow
            label="אימייל"
            value={user.email}
            ltr
            onPress={() => Linking.openURL(`mailto:${user.email}`)}
          />
          <FieldRow label="עיר" value={user.city} />
        </Section>

        {/* Worker-only */}
        {w && (
          <>
            <Section title="פרופיל מקצועי">
              <FieldRow label="מקצוע" value={w.profession} />
              <FieldRow label="תחום" value={w.professionCategory} />
              <FieldRow
                label="שנות ניסיון"
                value={`${w.experienceYears} שנים`}
              />
              <FieldRow
                label="מיומנויות"
                value={w.skills.length ? w.skills.join(', ') : '—'}
              />
              <FieldRow
                label="תעודות"
                value={
                  w.certifications.length
                    ? w.certifications.join(', ')
                    : '—'
                }
              />
              <FieldRow
                label="זמין"
                value={w.isAvailable ? 'כן' : 'לא'}
              />
              <FieldRow label="תעריף שעתי" value={`${w.hourlyRate} ₪`} ltr />
              <FieldRow label="תעריף יומי" value={`${w.dailyRate} ₪`} ltr />
            </Section>
          </>
        )}

        {/* Contractor-only */}
        {c && (
          <Section title="פרטי הקבלן">
            <FieldRow label="חברה" value={c.companyName} />
            <FieldRow
              label="מספר רישום קבלנים"
              value={c.contractorRegistrationNumber}
              mono
              ltr
            />
            <FieldRow label="אזור פעילות" value={c.areaOfOperation} />
            <FieldRow
              label="סוגי פרויקטים"
              value={c.projectTypes.join(', ')}
            />
            <FieldRow label="פרטי רישיון" value={c.licenseDetails} />
          </Section>
        )}

        {user.bio && (
          <Section title="אודות">
            <Text style={styles.bio}>{user.bio}</Text>
          </Section>
        )}

        {user.status === 'blocked' && user.blockedReason && (
          <View style={styles.blockedBox}>
            <View style={styles.blockedHeader}>
              <Ionicons name="ban" size={18} color={Colors.danger} />
              <Text style={styles.blockedTitle}>סיבת חסימה</Text>
            </View>
            <Text style={styles.blockedText}>{user.blockedReason}</Text>
            {user.blockedAt && (
              <Text style={styles.blockedMeta}>
                נחסם ב-
                <Text style={{ writingDirection: 'ltr' }}>
                  {new Date(user.blockedAt).toLocaleString('he-IL')}
                </Text>
              </Text>
            )}
          </View>
        )}

        <Text style={styles.createdAt}>
          חבר במערכת מאז{' '}
          <Text style={{ writingDirection: 'ltr' }}>
            {new Date(user.createdAt).toLocaleDateString('he-IL')}
          </Text>
        </Text>
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        {user.status === 'approved' ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.blockBtn]}
            onPress={() => setBlockModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="ban" size={20} color={Colors.white} />
            <Text style={styles.blockText}>חסום משתמש</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, styles.unblockBtn]}
            onPress={handleUnblock}
            activeOpacity={0.85}
          >
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={Colors.white}
            />
            <Text style={styles.unblockText}>בטל חסימה</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={blockModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBlockModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setBlockModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>חסימת משתמש</Text>
                </View>
                <Text style={styles.modalSub}>
                  ציין סיבה לחסימה. הסיבה תוצג למשתמש במסך החסימה.
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={blockReason}
                  onChangeText={setBlockReason}
                  placeholder="לדוגמה: דיווחים חוזרים על התנהגות בלתי הולמת"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setBlockModalVisible(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnCancelText}>ביטול</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnConfirm]}
                    onPress={handleBlockConfirm}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnConfirmText}>אשר חסימה</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

// ---------- subcomponents ----------

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const FieldRow: React.FC<{
  label: string;
  value: string;
  mono?: boolean;
  ltr?: boolean;
  onPress?: () => void;
}> = ({ label, value, mono, ltr, onPress }) => (
  <View style={styles.fRow}>
    {onPress ? (
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text
          style={[
            styles.fValue,
            { color: Colors.primary, textDecorationLine: 'underline' },
            mono && { fontFamily: 'monospace' },
            ltr && { writingDirection: 'ltr' },
          ]}
        >
          {value}
        </Text>
      </TouchableOpacity>
    ) : (
      <Text
        style={[
          styles.fValue,
          mono && { fontFamily: 'monospace' },
          ltr && { writingDirection: 'ltr' },
        ]}
      >
        {value}
      </Text>
    )}
    <Text style={styles.fLabel}>{label}</Text>
  </View>
);

const StatChip: React.FC<{ label: string; value: number }> = ({
  label,
  value,
}) => (
  <View style={styles.statChip}>
    <Text style={styles.statChipValue}>{value}</Text>
    <Text style={styles.statChipLabel}>{label}</Text>
  </View>
);

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
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.medium,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  heroRole: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  heroBadges: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },

  statsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statChip: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'flex-end',
    ...Shadow.small,
  },
  statChipValue: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  statChipLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
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
  sectionBody: { gap: 6 },

  fRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    gap: 6,
    paddingVertical: 6,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    flexShrink: 0,
  },
  fValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  bio: {
    fontSize: FontSize.sm,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 22,
  },

  blockedBox: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: 4,
  },
  blockedHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  blockedTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.danger,
    writingDirection: 'rtl',
  },
  blockedText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    lineHeight: 20,
  },
  blockedMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  createdAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 8,
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
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  blockBtn: { backgroundColor: Colors.danger, ...Shadow.small },
  blockText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },
  unblockBtn: { backgroundColor: Colors.success, ...Shadow.small },
  unblockText: { color: Colors.white, fontSize: FontSize.md, fontWeight: '700' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: 12,
  },
  modalHeader: { width: '100%', alignItems: 'flex-end' },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  modalSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  modalInput: {
    minHeight: 90,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modalBtnCancelText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  modalBtnConfirm: { backgroundColor: Colors.danger },
  modalBtnConfirmText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});

export default AdminUserDetailsScreen;
