import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import WorkerAvatar from '../components/WorkerAvatar';
import { callPhone } from '../utils/contact';
import { Contractor, Worker } from '../types';

interface Props {
  workerId: string;
  onBack: () => void;
  onOpenJobDetails?: (jobId: string) => void;
  onOpenChat?: (workerId: string) => void;
}

const WorkerProfileScreen: React.FC<Props> = ({
  workerId,
  onBack,
  onOpenJobDetails,
  onOpenChat,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    getUserById,
    jobs,
    sendInvitation,
    invitations,
    isFavoriteWorker,
    toggleFavoriteWorker,
  } = useApp();

  const worker = getUserById(workerId) as Worker | undefined;
  const me = currentUser;
  const isContractor = me?.role === 'contractor';
  const isFavorite = isContractor && me ? isFavoriteWorker(me.id, workerId) : false;
  const handleToggleFavorite = () => {
    if (!isContractor || !me) return;
    toggleFavoriteWorker(me.id, workerId);
  };

  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState('');

  const myOpenJobs = useMemo(() => {
    if (!isContractor || !me) return [];
    return jobs.filter(
      (j) => j.contractorId === me.id && j.status === 'open'
    );
  }, [jobs, me, isContractor]);

  // Has the contractor already invited this worker for any job?
  const existingInvitations = useMemo(() => {
    if (!isContractor || !me) return [];
    return invitations.filter(
      (i) => i.contractorId === me.id && i.workerId === workerId
    );
  }, [invitations, me, isContractor, workerId]);

  if (!worker || worker.role !== 'worker') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>עובד לא נמצא</Text>
        <TouchableOpacity onPress={onBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>חזרה</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSendInvite = () => {
    if (!selectedJobId || !me) return;
    sendInvitation(selectedJobId, me.id, worker.id, inviteMessage.trim() || undefined);
    setPickerVisible(false);
    setSelectedJobId(null);
    setInviteMessage('');
    Alert.alert('הזמנה נשלחה', `ההזמנה נשלחה ל-${worker.fullName}.`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>פרופיל עובד</Text>
        {isContractor && (
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
          <WorkerAvatar worker={worker} size={72} />
          <View style={styles.heroBody}>
            <View style={styles.heroNameRow}>
              {worker.isAvailable && (
                <View style={styles.availDot}>
                  <View style={styles.availDotInner} />
                </View>
              )}
              <Text style={styles.heroName}>{worker.fullName}</Text>
            </View>
            <Text style={styles.heroProfession}>
              {worker.profession} · {worker.experienceYears} שנות ניסיון
            </Text>
            <View style={styles.heroBadges}>
              <StatusBadge
                label={worker.isAvailable ? 'זמין מיד' : 'לא זמין כעת'}
                tone={worker.isAvailable ? 'success' : 'neutral'}
                small
              />
            </View>
          </View>
        </View>

        {/* Rates */}
        <View style={styles.ratesCard}>
          <View style={styles.rateBlock}>
            <Text style={styles.rateValue}>{worker.dailyRate}₪</Text>
            <Text style={styles.rateLabel}>תעריף יומי</Text>
          </View>
          <View style={styles.rateDivider} />
          <View style={styles.rateBlock}>
            <Text style={styles.rateValue}>{worker.hourlyRate}₪</Text>
            <Text style={styles.rateLabel}>תעריף שעתי</Text>
          </View>
        </View>

        {/* Bio */}
        {worker.bio && (
          <Section title="אודות">
            <Text style={styles.body}>{worker.bio}</Text>
          </Section>
        )}

        {/* Profession info */}
        <Section title="פרטים מקצועיים">
          <FieldRow label="תחום" value={worker.professionCategory} />
          <FieldRow label="מקצוע" value={worker.profession} />
          <FieldRow
            label="שנות ניסיון"
            value={`${worker.experienceYears} שנים`}
          />
          <FieldRow label="עיר" value={worker.city} />
          {worker.preferredAreas.length > 0 && (
            <FieldRow
              label="אזורי עבודה"
              value={worker.preferredAreas.join(', ')}
            />
          )}
        </Section>

        {/* Skills */}
        {worker.skills.length > 0 && (
          <Section title="מיומנויות">
            <View style={styles.tagRow}>
              {worker.skills.map((s) => (
                <View key={s} style={styles.tag}>
                  <Text style={styles.tagText}>{s}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {/* Certifications */}
        {worker.certifications.length > 0 && (
          <Section title="הסמכות ותעודות">
            {worker.certifications.map((c) => (
              <View key={c} style={styles.certRow}>
                <Text style={styles.certText}>{c}</Text>
                <Ionicons
                  name="ribbon-outline"
                  size={18}
                  color={Colors.warning}
                />
              </View>
            ))}
          </Section>
        )}

        {/* Past invitations from this contractor */}
        {isContractor && existingInvitations.length > 0 && (
          <Section title="הזמנות קודמות שלי">
            {existingInvitations.map((inv) => {
              const job = jobs.find((j) => j.id === inv.jobId);
              return (
                <TouchableOpacity
                  key={inv.id}
                  style={styles.invRow}
                  onPress={() =>
                    job && onOpenJobDetails && onOpenJobDetails(job.id)
                  }
                  activeOpacity={0.85}
                >
                  <StatusBadge
                    label={
                      inv.status === 'pending'
                        ? 'ממתין'
                        : inv.status === 'accepted'
                        ? 'התקבל'
                        : 'נדחה'
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
                  <Text style={styles.invText} numberOfLines={1}>
                    {job?.title ?? '—'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Section>
        )}
      </ScrollView>

      {/* Invite action — contractor only */}
      {isContractor && worker && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() =>
                onOpenChat?.(worker.id)
              }
              activeOpacity={0.85}
              accessibilityLabel={`שלח הודעה ל${worker.fullName}`}
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.contactBtnText}>שלח הודעה</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => callPhone(worker.phone)}
              activeOpacity={0.85}
              accessibilityLabel={`התקשר ל${worker.fullName}`}
            >
              <Ionicons name="call-outline" size={16} color={Colors.primary} />
              <Text style={styles.contactBtnText}>התקשר</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.inviteBtn}
            onPress={() => setPickerVisible(true)}
            activeOpacity={0.85}
            disabled={myOpenJobs.length === 0}
          >
            <Ionicons name="paper-plane" size={20} color={Colors.white} />
            <Text style={styles.inviteText}>
              {myOpenJobs.length === 0
                ? 'אין משרות פתוחות להזמנה'
                : 'הזמן לעבודה'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invite picker modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>בחר משרה</Text>
            <Text style={styles.modalSub}>
              לאיזו משרה להזמין את {worker.fullName}?
            </Text>

            <ScrollView style={{ maxHeight: 240 }}>
              {myOpenJobs.map((j) => {
                const active = selectedJobId === j.id;
                return (
                  <TouchableOpacity
                    key={j.id}
                    style={[
                      styles.jobOpt,
                      active && styles.jobOptActive,
                    ]}
                    onPress={() => setSelectedJobId(j.id)}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={
                        active ? 'radio-button-on' : 'radio-button-off'
                      }
                      size={18}
                      color={active ? Colors.primary : Colors.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobOptTitle}>{j.title}</Text>
                      <Text style={styles.jobOptMeta}>
                        {j.profession} · {j.city}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedJobId && (
              <TextInput
                style={styles.messageInput}
                value={inviteMessage}
                onChangeText={setInviteMessage}
                placeholder="הודעה אישית (אופציונלי)"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setPickerVisible(false);
                  setSelectedJobId(null);
                  setInviteMessage('');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnCancelText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  !selectedJobId && { opacity: 0.5 },
                ]}
                onPress={handleSendInvite}
                disabled={!selectedJobId}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnConfirmText}>שלח הזמנה</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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

const FieldRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.fRow}>
    <Text style={styles.fValue}>{value}</Text>
    <Text style={styles.fLabel}>{label}</Text>
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
  favoriteBtn: {
    position: 'absolute',
    left: Spacing.lg,
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
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.medium,
  },
  heroBody: { flex: 1 },
  heroNameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  availDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  heroProfession: {
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
    marginTop: 8,
  },
  ratesCard: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  rateBlock: { flex: 1, alignItems: 'center' },
  rateDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  rateValue: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.primary,
  },
  rateLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
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
  sectionBody: { gap: 6, alignItems: 'flex-end', width: '100%' },

  body: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 22,
  },

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

  tagRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
  },
  tagText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  certRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: Radius.sm,
  },
  certText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    writingDirection: 'rtl',
    textAlign: 'right',
    flex: 1,
  },

  invRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 8,
    borderBottomColor: Colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  invText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
    fontWeight: '600',
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
  contactRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: Spacing.sm,
  },
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
  inviteBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Radius.full,
    ...Shadow.small,
  },
  inviteText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

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
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modalSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  jobOpt: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  jobOptActive: {
    backgroundColor: Colors.primaryFaint,
    borderColor: Colors.primary,
  },
  jobOptTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  jobOptMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  messageInput: {
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.sm,
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
  modalBtnConfirm: { backgroundColor: Colors.primary },
  modalBtnConfirmText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
});

export default WorkerProfileScreen;
