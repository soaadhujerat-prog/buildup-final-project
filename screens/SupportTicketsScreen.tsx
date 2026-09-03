import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import {
  supportTicketDisplay,
  supportTicketReceivedLine,
  SUPPORT_DISPLAY_FILTERS,
  SupportDisplayState,
} from '../utils/helpers';
import { SupportTicket } from '../types';

interface Props {
  onBack: () => void;
  onOpenTicket: (ticketId: string) => void;
  onOpenNewTicket?: () => void; // only used for customer roles
  /** Confined rejected-registration shell: an already-scoped ticket list to
   *  render as a non-admin requester. When absent, behaviour is unchanged
   *  (list comes from `useApp()`, scoped by `currentUser`). */
  ticketsOverride?: SupportTicket[];
}

type StatusFilter = 'all' | SupportDisplayState;

const SupportTicketsScreen: React.FC<Props> = ({
  onBack,
  onOpenTicket,
  onOpenNewTicket,
  ticketsOverride,
}) => {
  const insets = useSafeAreaInsets();
  const {
    currentUser,
    supportTickets,
    supportTicketsLoading,
    getUserById,
    registrations,
  } = useApp();

  const overridden = ticketsOverride !== undefined;
  const isAdmin = !overridden && currentUser?.role === 'admin';
  const loading = overridden ? false : supportTicketsLoading;
  const [filter, setFilter] = useState<StatusFilter>('all');

  // Source-of-truth filtering by role
  const myScope = useMemo(() => {
    if (overridden) return ticketsOverride ?? [];
    if (!currentUser) return [];
    if (isAdmin) return supportTickets;
    return supportTickets.filter((t) => t.userId === currentUser.id);
  }, [overridden, ticketsOverride, supportTickets, currentUser, isAdmin]);

  const filtered = useMemo(() => {
    const base =
      filter === 'all'
        ? myScope
        : myScope.filter((t) => supportTicketDisplay(t.status).state === filter);
    return [...base].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [myScope, filter]);

  // Every count derived live from the real tickets — 'resolved' and 'closed'
  // both fall under the single "טופל" (done) bucket.
  const counts = useMemo(() => {
    const c: Record<'all' | SupportDisplayState, number> = {
      all: myScope.length,
      waiting: 0,
      in_progress: 0,
      done: 0,
    };
    myScope.forEach((t) => {
      c[supportTicketDisplay(t.status).state] += 1;
    });
    return c;
  }, [myScope]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">
          {isAdmin ? 'כל פניות התמיכה' : 'הפניות שלי'}
        </Text>
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {SUPPORT_DISPLAY_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={`${f.label} (${counts[f.key]})`}
            active={filter === f.key}
            tone={
              f.key === 'waiting'
                ? 'danger'
                : f.key === 'in_progress'
                ? 'warning'
                : f.key === 'done'
                ? 'success'
                : undefined
            }
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ScrollView>

      {loading && myScope.length === 0 ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptySub}>טוען פניות…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name={isAdmin ? 'mail-open-outline' : 'help-buoy-outline'}
            size={56}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {isAdmin ? 'אין פניות תואמות' : 'אין לך פניות תמיכה'}
          </Text>
          <Text style={styles.emptySub}>
            {isAdmin
              ? 'נסה לשנות את הסינון.'
              : 'אם תיתקל בבעיה, ניתן לפתוח פנייה חדשה.'}
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.results}
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <TicketRow
              ticket={item}
              isAdmin={isAdmin}
              userName={
                !isAdmin
                  ? ''
                  : item.source === 'registration'
                  ? registrations.find(
                      (r) => r.id === (item.registrationId ?? item.userId)
                    )?.data.fullName ?? '—'
                  : getUserById(item.userId)?.fullName ?? '—'
              }
              onPress={() => onOpenTicket(item.id)}
            />
          )}
        />
      )}

      {!isAdmin && onOpenNewTicket && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 16 }]}
          onPress={onOpenNewTicket}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color={Colors.white} />
          <Text style={styles.fabText}>פנייה חדשה</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const Chip: React.FC<{
  label: string;
  active: boolean;
  tone?: 'success' | 'danger' | 'warning';
  onPress: () => void;
}> = ({ label, active, tone, onPress }) => {
  const activeBg =
    tone === 'success'
      ? Colors.success
      : tone === 'danger'
      ? Colors.danger
      : tone === 'warning'
      ? Colors.warning
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

const TicketRow: React.FC<{
  ticket: SupportTicket;
  isAdmin: boolean;
  userName: string;
  onPress: () => void;
}> = ({ ticket, isAdmin, userName, onPress }) => {
  const display = supportTicketDisplay(ticket.status);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={typeIcon(ticket.type)} size={20} color={Colors.info} />
      </View>
      <View style={{ flex: 1 }}>
        {/* Row 1: status badge only (stays right-anchored, RTL).
            Row 2: the subject on its own line, full width. */}
        <View style={styles.rowStatusLine}>
          <StatusBadge label={display.label} tone={display.tone} small />
          {ticket.isClosed && (
            <StatusBadge label="סגורה" tone="neutral" small />
          )}
          {ticket.source === 'registration' && (
            <StatusBadge label="רישום שנדחה" tone="warning" small />
          )}
        </View>
        <Text style={styles.subject} numberOfLines={2}>
          {ticket.subject}
        </Text>
        <Text style={styles.desc} numberOfLines={1}>
          {ticket.description}
        </Text>
        <Text style={styles.meta}>
          {typeLabel(ticket.type)}
          {isAdmin ? ` · ${userName}` : ''}
        </Text>
        <Text style={styles.meta}>
          {supportTicketReceivedLine(ticket.createdAt)}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
};

function typeIcon(t: SupportTicket['type']): keyof typeof Ionicons.glyphMap {
  switch (t) {
    case 'complaint':
      return 'alert-circle-outline';
    case 'claim':
      return 'shield-outline';
    case 'question':
      return 'help-circle-outline';
    case 'technical':
      return 'bug-outline';
  }
}
function typeLabel(t: SupportTicket['type']): string {
  switch (t) {
    case 'complaint':
      return 'תלונה';
    case 'claim':
      return 'תביעה';
    case 'question':
      return 'שאלה';
    case 'technical':
      return 'תקלה טכנית';
  }
}

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
    borderColor: Colors.textMuted,
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
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.medium,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowStatusLine: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  subject: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  meta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
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
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
  },

  fab: {
    position: 'absolute',
    left: Spacing.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: Radius.full,
    ...Shadow.large,
  },
  fabText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },
});

export default SupportTicketsScreen;
