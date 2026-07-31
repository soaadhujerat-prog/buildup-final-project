import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';

interface Props {
  onBack: () => void;
  onEditProfile?: () => void; // customers only
  onLogout: () => void;
}

const SettingsScreen: React.FC<Props> = ({
  onBack,
  onEditProfile,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser } = useApp();

  const handleLogout = () => {
    Alert.alert(
      'התנתקות',
      'האם אתה בטוח שברצונך להתנתק?',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'התנתק', style: 'destructive', onPress: onLogout },
      ]
    );
  };

  if (!currentUser) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.emptyTitle}>לא מחובר</Text>
      </View>
    );
  }

  const isAdmin = currentUser.role === 'admin';
  const isCustomer = !isAdmin;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>הגדרות</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account card */}
        <View style={styles.accountCard}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: isAdmin
                  ? Colors.secondary
                  : currentUser.role === 'worker'
                  ? Colors.primary
                  : Colors.info,
              },
            ]}
          >
            <Ionicons
              name={
                isAdmin
                  ? 'shield-checkmark'
                  : currentUser.role === 'worker'
                  ? 'hammer'
                  : 'business'
              }
              size={26}
              color={Colors.white}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{currentUser.fullName}</Text>
            <Text style={styles.role}>
              {isAdmin
                ? 'מנהל מערכת'
                : currentUser.role === 'worker'
                ? 'עובד'
                : 'קבלן'}
            </Text>
            <Text style={styles.id}>ת.ז {currentUser.idNumber}</Text>
          </View>
        </View>

        {/* Section: Account */}
        <SectionHead title="חשבון" />
        {isCustomer && onEditProfile && (
          <Row
            icon="person-outline"
            label="עריכת פרופיל"
            onPress={onEditProfile}
          />
        )}
        <Row
          icon="mail-outline"
          label="אימייל"
          value={currentUser.email}
          readOnly
        />
        <Row
          icon="call-outline"
          label="טלפון"
          value={currentUser.phone}
          readOnly
        />
        {isCustomer && (
          <Row
            icon="location-outline"
            label="עיר"
            value={currentUser.city}
            readOnly
          />
        )}

        {/* Section: About */}
        <SectionHead title="אודות" />
        <Row
          icon="information-circle-outline"
          label="גרסת אפליקציה"
          value="1.0.0 (Iteration 1)"
          readOnly
        />
        <Row
          icon="document-text-outline"
          label="תנאי שימוש"
          value="—"
          readOnly
        />
        <Row
          icon="shield-checkmark-outline"
          label="מדיניות פרטיות"
          value="—"
          readOnly
        />

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const SectionHead: React.FC<{ title: string }> = ({ title }) => (
  <View style={styles.sectionHead}>
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
);

const Row: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  readOnly?: boolean;
  onPress?: () => void;
}> = ({ icon, label, value, readOnly, onPress }) => {
  const Container: React.ComponentType<any> = readOnly
    ? View
    : TouchableOpacity;
  return (
    <Container
      style={styles.row}
      onPress={onPress}
      activeOpacity={readOnly ? 1 : 0.85}
    >
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {!readOnly && (
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      )}
    </Container>
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

  accountCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
    ...Shadow.medium,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  role: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  id: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    fontFamily: 'monospace',
    marginTop: 2,
  },

  sectionHead: {
    width: '100%',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.md,
    marginBottom: 6,
    ...Shadow.small,
  },
  rowLabel: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowValue: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },

  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    paddingVertical: 16,
    borderRadius: Radius.full,
    marginTop: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.danger,
  },
  logoutText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  emptyTitle: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },
});

export default SettingsScreen;
