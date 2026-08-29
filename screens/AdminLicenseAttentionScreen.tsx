import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import ContractorAvatar from '../components/ContractorAvatar';
import { Contractor } from '../types';
import {
  formatDateIL,
  getContractorLicenseStatus,
  contractorLicenseNeedsAttention,
  daysUntil,
} from '../utils/helpers';

interface Props {
  onBack: () => void;
  onOpenUser: (userId: string) => void;
}

/** Admin-only read-only list of every contractor whose licence needs
 *  attention TODAY — expired / expiring ≤30d / annual review due / has a
 *  pending update request. All derived live; no stored counters. */
const AdminLicenseAttentionScreen: React.FC<Props> = ({ onBack, onOpenUser }) => {
  const insets = useSafeAreaInsets();
  const { contractors, contractorLicenseRequests, hasRenewalRequestBeenSent } =
    useApp();

  const pendingIds = useMemo(
    () =>
      new Set(
        contractorLicenseRequests
          .filter((r) => r.status === 'pending')
          .map((r) => r.contractorId)
      ),
    [contractorLicenseRequests]
  );

  const rows = useMemo(
    () =>
      contractors.filter((c) =>
        contractorLicenseNeedsAttention(c, pendingIds.has(c.id))
      ),
    [contractors, pendingIds]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">
          רישיונות הדורשים טיפול
        </Text>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="shield-checkmark-outline"
            size={56}
            color={Colors.success}
          />
          <Text style={styles.emptyTitle}>אין רישיונות שדורשים טיפול</Text>
          <Text style={styles.emptySub}>
            כל רישיונות הקבלנים מאומתים, בתוקף ולא הגיעו למועד בדיקה.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: 40,
          }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <Row
              contractor={item}
              hasPendingRequest={pendingIds.has(item.id)}
              renewalSent={hasRenewalRequestBeenSent(
                item.id,
                item.licenseValidUntil
              )}
              onPress={() => onOpenUser(item.id)}
            />
          )}
        />
      )}
    </View>
  );
};

// One clear sentence explaining exactly WHY this contractor is on the list AND
// what the admin should do, driven by the single central status
// (priority: expired > expiring > review). For a validity problem it also
// says whether a renewal request still needs to be sent, was already sent,
// or a replacement is already pending review.
const reasonForRow = (
  c: Contractor,
  hasPendingRequest: boolean,
  renewalSent: boolean
): string => {
  const st = getContractorLicenseStatus(c);
  const until = c.licenseValidUntil ? formatDateIL(c.licenseValidUntil) : '—';

  const renewalHint = hasPendingRequest
    ? ' · עדכון רישיון ממתין לבדיקה'
    : renewalSent
    ? ' · בקשת חידוש נשלחה'
    : ' · יש לבקש חידוש רישיון';

  if (st.state === 'expired') {
    return `פג תוקף · תאריך התוקף: ${until}${renewalHint}`;
  }
  if (st.state === 'expiring_soon') {
    const d = Math.max(0, daysUntil(c.licenseValidUntil) ?? 0);
    return `מתקרב לפקיעה · יפוג בעוד ${d} ימים (${until})${renewalHint}`;
  }
  if (st.state === 'review_due') {
    return `נדרשת בדיקה תקופתית · מועד הבדיקה: ${
      c.licenseNextReviewAt ? formatDateIL(c.licenseNextReviewAt) : '—'
    }`;
  }
  // state is 'verified' → only here because of a pending update request.
  return hasPendingRequest ? 'עדכון רישיון ממתין לבדיקה' : '';
};

const Row: React.FC<{
  contractor: Contractor;
  hasPendingRequest: boolean;
  renewalSent: boolean;
  onPress: () => void;
}> = ({ contractor: c, hasPendingRequest, renewalSent, onPress }) => {
  const st = getContractorLicenseStatus(c);
  const reason = reasonForRow(c, hasPendingRequest, renewalSent);
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <ContractorAvatar contractor={c} size={44} />
      <View style={{ flex: 1 }}>
        <View style={styles.topline}>
          <StatusBadge label={st.label} tone={st.tone} small />
          <Text style={styles.name} numberOfLines={1}>
            {c.companyName}
          </Text>
        </View>
        <Text style={styles.sub}>
          {c.fullName} · מס' רישום{' '}
          <Text style={{ writingDirection: 'ltr' }}>
            {c.contractorRegistrationNumber}
          </Text>
        </Text>
        {!!reason && (
          <Text
            style={[
              styles.meta,
              hasPendingRequest && styles.metaPending,
            ]}
          >
            {reason}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
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
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
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

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    ...Shadow.medium,
  },
  topline: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sub: {
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
    lineHeight: FontSize.xs + 5,
  },
  metaPending: {
    color: Colors.secondary,
    fontWeight: '700',
  },
});

export default AdminLicenseAttentionScreen;
