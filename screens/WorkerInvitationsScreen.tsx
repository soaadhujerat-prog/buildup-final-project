import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import {
  Contractor,
  Invitation,
  InvitationStatus,
  Worker,
} from '../types';

interface Props {
  onBack: () => void;
  onOpenJobDetails: (jobId: string) => void;
}

type Filter = 'all' | InvitationStatus;

const WorkerInvitationsScreen: React.FC<Props> = ({
  onBack,
  onOpenJobDetails,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    invitations,
    jobs,
    getUserById,
    respondToInvitation,
  } = useApp();
  const me = currentUser as Worker | undefined;

  const [filter, setFilter] = useState<Filter>('all');

  // SOURCE: invitations.filter(workerId === me.id)
  const myInvitations = useMemo(
    () => invitations.filter((i) => i.workerId === me?.id),
    [invitations, me]
  );

  const filtered = useMemo(() => {
    const base =
      filter === 'all'
        ? myInvitations
        : myInvitations.filter((i) => i.status === filter);
    return [...base].sort(
      (a, b) =>
        new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
  }, [myInvitations, filter]);

  const counts = {
    all: myInvitations.length,
    pending: myInvitations.filter((i) => i.status === 'pending').length,
    accepted: myInvitations.filter((i) => i.status === 'accepted').length,
    declined: myInvitations.filter((i) => i.status === 'declined').length,
  };

  const handleAccept = (inv: Invitation) => {
    const job = jobs.find((j) => j.id === inv.jobId);
    Alert.alert(
      'אישור הזמנה',
      `לאשר את ההזמנה למשרה "${job?.title ?? ''}"?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'אשר',
          onPress: () => respondToInvitation(inv.id, true),
        },
      ]
    );
  };

  const handleDecline = (inv: Invitation) => {
    const job = jobs.find((j) => j.id === inv.jobId);
    Alert.alert(
      'דחיית הזמנה',
      `לדחות את ההזמנה למשרה "${job?.title ?? ''}"?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'דחה',
          style: 'destructive',
          onPress: () => respondToInvitation(inv.id, false),
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הזמנות מקבלנים</Text>
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          label={`הכל (${counts.all})`}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={`חדשות (${counts.pending})`}
          active={filter === 'pending'}
          tone="warning"
          onPress={() => setFilter('pending')}
        />
        <Chip
          label={`אישרת (${counts.accepted})`}
          active={filter === 'accepted'}
          tone="success"
          onPress={() => setFilter('accepted')}
        />
        <Chip
          label={`דחית (${counts.declined})`}
          active={filter === 'declined'}
          tone="danger"
          onPress={() => setFilter('declined')}
        />
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="mail-outline"
            size={64}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {counts.all === 0
              ? 'עדיין לא קיבלת הזמנות'
              : 'אין הזמנות בסינון זה'}
          </Text>
          <Text style={styles.emptySub}>
            {counts.all === 0
              ? 'קבלנים יזמינו אותך כאשר ימצאו בך התאמה.'
              : 'נסה סינון אחר'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => (
            <View style={{ height: Spacing.sm }} />
          )}
          renderItem={({ item }) => {
            const job = jobs.find((j) => j.id === item.jobId);
            const contractor = getUserById(item.contractorId) as
              | Contractor
              | undefined;
            return (
              <InvitationCard
                inv={item}
                jobTitle={job?.title ?? '—'}
                jobCity={job?.city ?? ''}
                jobDailyRate={job?.dailyRate ?? 0}
                contractorName={
                  contractor?.companyName ?? contractor?.fullName ?? ''
                }
                contractorRating={contractor?.rating}
                onPressJob={() => job && onOpenJobDetails(job.id)}
                onAccept={() => handleAccept(item)}
                onDecline={() => handleDecline(item)}
              />
            );
          }}
        />
      )}
    </View>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  tone?: 'success' | 'warning' | 'danger';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'warning'
      ? Colors.warning
      : tone === 'danger'
      ? Colors.danger
      : Colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: activeBg, borderColor: activeBg },
      ]}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const InvitationCard: React.FC<{
  inv: Invitation;
  jobTitle: string;
  jobCity: string;
  jobDailyRate: number;
  contractorName: string;
  contractorRating?: number;
  onPressJob: () => void;
  onAccept: () => void;
  onDecline: () => void;
}> = ({
  inv,
  jobTitle,
  jobCity,
  jobDailyRate,
  contractorName,
  contractorRating,
  onPressJob,
  onAccept,
  onDecline,
}) => {
  const tone =
    inv.status === 'pending'
      ? 'warning'
      : inv.status === 'accepted'
      ? 'success'
      : 'danger';
  const label =
    inv.status === 'pending'
      ? 'חדש'
      : inv.status === 'accepted'
      ? 'אישרת'
      : 'דחית';

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <StatusBadge label={label} tone={tone} small />
        <Text style={styles.title} numberOfLines={1}>
          {jobTitle}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.contractorRow}
        onPress={onPressJob}
        activeOpacity={0.85}
      >
        <View style={styles.contractorIcon}>
          <Ionicons name="business" size={16} color={Colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.contractorName}>{contractorName}</Text>
          {contractorRating !== undefined && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={Colors.warning} />
              <Text style={styles.ratingText}>
                {contractorRating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons
            name="location-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.metaText}>{jobCity}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons
            name="cash-outline"
            size={14}
            color={Colors.textSecondary}
          />
          <Text style={styles.metaText}>{jobDailyRate}₪/יום</Text>
        </View>
      </View>

      {inv.message && (
        <Text style={styles.message}>{inv.message}</Text>
      )}

      <Text style={styles.sentAt}>
        נשלח:{' '}
        <Text style={{ writingDirection: 'ltr' }}>
          {new Date(inv.sentAt).toLocaleDateString('he-IL')}
        </Text>
        {inv.respondedAt && (
          <>
            {' · נענה: '}
            <Text style={{ writingDirection: 'ltr' }}>
              {new Date(inv.respondedAt).toLocaleDateString('he-IL')}
            </Text>
          </>
        )}
      </Text>

      <TouchableOpacity
        style={styles.viewJobBtn}
        onPress={onPressJob}
        activeOpacity={0.85}
      >
        <Ionicons name="chevron-back" size={14} color={Colors.primary} />
        <Text style={styles.viewJobText}>הצג פרטי משרה</Text>
        <Ionicons name="briefcase-outline" size={14} color={Colors.primary} />
      </TouchableOpacity>

      {inv.status === 'pending' && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={onDecline}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={Colors.danger} />
            <Text style={styles.declineText}>דחה</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={onAccept}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color={Colors.white} />
            <Text style={styles.acceptText}>אשר</Text>
          </TouchableOpacity>
        </View>
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

  chipRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: FC.gap,
    alignItems: 'center',
  },
  chip: {
    height: FC.height,
    paddingHorizontal: FC.paddingHorizontal,
    borderRadius: FC.borderRadius,
    borderWidth: FC.borderWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 4,
  },
  chipTextActive: { color: Colors.white },

  results: {
    flex: 1,
  },

  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 8,
    ...Shadow.medium,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  contractorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.gray50,
    padding: 8,
    borderRadius: Radius.sm,
  },
  contractorIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractorName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  ratingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '700',
  },

  metaRow: {
    flexDirection: 'row-reverse',
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  message: {
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.primaryFaint,
    padding: 8,
    borderRadius: Radius.sm,
    textAlign: 'right',
    writingDirection: 'rtl',
    fontStyle: 'italic',
  },
  sentAt: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  viewJobBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryFaint,
  },
  viewJobText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  actionRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 4,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.success,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  acceptText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  declineBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  declineText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: '700',
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

export default WorkerInvitationsScreen;
