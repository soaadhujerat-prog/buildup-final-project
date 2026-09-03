import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { SupportTicketType } from '../types';

interface Props {
  onBack: () => void;
  onSubmitted: (ticketId: string) => void;
  /** Optional pre-filled subject (e.g. the blocked-account support flow).
   *  The user can still edit or clear it before sending. */
  initialSubject?: string;
  /** Confined rejected-registration shell: create the ticket through this
   *  instead of the `currentUser`-gated context action. Returns the new id.
   *  Absent -> unchanged (normal worker / contractor / blocked flow). */
  onCreateOverride?: (
    type: SupportTicketType,
    subject: string,
    description: string
  ) => Promise<string>;
}

const TYPES: { value: SupportTicketType; label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; description: string }[] = [
  {
    value: 'complaint',
    label: 'תלונה',
    icon: 'alert-circle-outline',
    description: 'דיווח על משתמש או שירות',
  },
  {
    value: 'claim',
    label: 'תביעה',
    icon: 'shield-outline',
    description: 'תביעה רשמית הדורשת מענה משפטי',
  },
  {
    value: 'question',
    label: 'שאלה',
    icon: 'help-circle-outline',
    description: 'שאלה כללית על המערכת',
  },
  {
    value: 'technical',
    label: 'תקלה טכנית',
    icon: 'bug-outline',
    description: 'בעיה באפליקציה',
  },
];

const OpenSupportTicketScreen: React.FC<Props> = ({
  onBack,
  onSubmitted,
  initialSubject,
  onCreateOverride,
}) => {
  const insets = useSafeAreaInsets();
  const { currentUser, openSupportTicket } = useApp();

  const [type, setType] = useState<SupportTicketType>('question');
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return; // guard against a double-tap while the request is in flight
    if (!subject.trim()) {
      Alert.alert('שגיאה', 'נושא הפנייה חובה');
      return;
    }
    if (description.trim().length < 10) {
      Alert.alert('שגיאה', 'תיאור הפנייה חייב לכלול לפחות 10 תווים');
      return;
    }
    if (
      !onCreateOverride &&
      (!currentUser ||
        (currentUser.role !== 'worker' && currentUser.role !== 'contractor'))
    ) {
      Alert.alert('שגיאה', 'יש להתחבר כעובד או קבלן כדי לפתוח פנייה');
      return;
    }
    setSubmitting(true);
    try {
      if (onCreateOverride) {
        const id = await onCreateOverride(type, subject.trim(), description.trim());
        onSubmitted(id);
      } else {
        const ticket = await openSupportTicket(
          currentUser!.id,
          currentUser!.role as 'worker' | 'contractor',
          type,
          subject.trim(),
          description.trim()
        );
        onSubmitted(ticket.id);
      }
    } catch {
      Alert.alert('שגיאה', 'שליחת הפנייה נכשלה. נסה שוב.');
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.headerBar, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">פנייה חדשה לתמיכה</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>סוג הפנייה</Text>
          </View>
          <View style={styles.typeGrid}>
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeCard, active && styles.typeCardActive]}
                  onPress={() => setType(t.value)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={t.icon}
                    size={26}
                    color={active ? Colors.primary : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeLabel,
                      active && styles.typeLabelActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                  <Text style={styles.typeDesc}>{t.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>נושא</Text>
          </View>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="סכם את הפנייה במשפט אחד"
            placeholderTextColor={Colors.textMuted}
            maxLength={120}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>תיאור מפורט</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="פרט את הבעיה / השאלה / התלונה. ככל שהמידע יהיה מפורט יותר, המענה יהיה מהיר יותר."
            placeholderTextColor={Colors.textMuted}
            multiline
          />
          <Text style={styles.charCount}>{description.length} תווים</Text>
        </View>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={18}
            color={Colors.secondary}
          />
          <Text style={styles.infoText}>
            הפנייה תישלח למנהל מערכת BuildUp ותוכל לעקוב אחר הסטטוס שלה
            במסך "הפניות שלי".
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={styles.submitText}>
            {submitting ? 'שולח...' : 'שלח פנייה'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
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

  typeGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'flex-end',
    gap: 4,
  },
  typeCardActive: {
    backgroundColor: Colors.primaryFaint,
    borderColor: Colors.primary,
  },
  typeLabel: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
    marginTop: 2,
  },
  typeLabelActive: { color: Colors.primary },
  typeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  textarea: {
    minHeight: 130,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'left',
    marginTop: 4,
  },

  infoBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    lineHeight: 20,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  submitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    ...Shadow.medium,
  },
  submitText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default OpenSupportTicketScreen;
