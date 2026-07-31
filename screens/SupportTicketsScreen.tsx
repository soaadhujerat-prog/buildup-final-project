import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow , FilterChip as FC } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import { SupportTicket, SupportTicketStatus } from '../types';

interface Props {
  onBack: () => void;
  onOpenTicket: (ticketId: string) => void;
  onOpenNewTicket?: () => void; // only used for customer roles
}

type StatusFilter = 'all' | SupportTicketStatus;

const SupportTicketsScreen: React.FC<Props> = ({
  onBack,
  onOpenTicket,
  onOpenNewTicket,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, supportTickets, getUserById } = useApp();

  const isAdmin = currentUser?.role === 'admin';
  const [filter, setFilter] = useState<StatusFilter>('all');

  // Source-of-truth filtering by role
  const myScope = useMemo(() => {
    if (!currentUser) return [];
    if (isAdmin) return supportTickets;
    return supportTickets.filter((t) => t.userId === currentUser.id);
  }, [supportTickets, currentUser, isAdmin]);

  const filtered = useMemo(() => {
    const base =
      filter === 'all' ? myScope : myScope.filter((t) => t.status === filter);
    return [...base].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [myScope, filter]);

  const counts = useMemo(
    () => ({
      all: myScope.length,
      open: myScope.filter((t) => t.status === 'open').length,
      in_progress: myScope.filter((t) => t.status === 'in_progress').length,
      resolved: myScope.filter((t) => t.status === 'resolved').length,
    }),
    [myScope]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isAdmin ? 'כל פניות התמיכה' : 'הפניות שלי'}
        </Text>
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
          label={`פתוח (${counts.open})`}
          active={filter === 'open'}
          tone="danger"
          onPress={() => setFilter('open')}
        />
        <Chip
          label={`בטיפול (${counts.in_progress})`}
          active={filter === 'in_progress'}
          tone="warning"
          onPress={() => setFilter('in_progress')}
        />
        <Chip
          label={`טופל (${counts.resolved})`}
          active={filter === 'resolved'}
          tone="success"
          onPress={() => setFilter('resolved')}
        />
      </ScrollView>

      {filtered.length === 0 ? (
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
                isAdmin ? getUserById(item.userId)?.fullName ?? '—' : ''
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
  const statusTone =
    ticket.status === 'open'
      ? 'danger'
      : ticket.status === 'in_progress'
      ? 'warning'
      : ticket.status === 'resolved'
      ? 'success'
      : 'neutral';
  const statusLabel =
    ticket.status === 'open'
      ? 'פתוח'
      : ticket.status === 'in_progress'
      ? 'בטיפול'
      : ticket.status === 'resolved'
      ? 'טופל'
      : 'נסגר';
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
        <View style={styles.rowTop}>
          <StatusBadge label={statusLabel} tone={statusTone} small />
          <Text style={styles.subject}>{ticket.subject}</Text>
        </View>
        <Text style={styles.desc} numberOfLines={1}>
          {ticket.description}
        </Text>
        <Text style={styles.meta}>
          {typeLabel(ticket.type)}
          {isAdmin ? ` · ${userName}` : ''}
          {' · '}
          {new Date(ticket.updatedAt).toLocaleDateString('he-IL')}
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
  rowTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  subject: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
    flexShrink: 1,
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
