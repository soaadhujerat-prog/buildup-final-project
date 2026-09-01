import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { requestPasswordReset } from '../services/passwordResetService';

interface Props {
  onBack: () => void;
  /** Recovery request accepted — move to the code-entry step with this email.
   *  Called for EVERY well-formed address (enumeration-safe): the generic
   *  "if this email exists…" copy is shown on the next screen too. */
  onCodeSent: (email: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Password-recovery request — shared by both Worker and Contractor login
 *  (recovery is by email regardless of role; ordinary login stays ID +
 *  password). Never confirms or denies whether the email is registered —
 *  always advances to the code-entry step with the same generic message, so
 *  the UI can't be used to enumerate accounts. Recovery is CODE-based (a
 *  one-time code emailed by Supabase Auth), not a clickable link. */
const ForgotPasswordScreen: React.FC<Props> = ({ onBack, onCodeSent }) => {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('כתובת אימייל לא תקינה');
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(trimmed);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
      // Brief confirmation, then straight to the OTP step. Same outcome
      // whether or not the address is registered.
      setTimeout(() => onCodeSent(trimmed), 900);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={onBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-forward" size={26} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.iconCircle}>
          <Ionicons name="key-outline" size={36} color={Colors.primary} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>שחזור סיסמה</Text>
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            הזן את כתובת האימייל שאיתה נרשמת למערכת ונשלח אליך קוד לאיפוס
            הסיסמה.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>אימייל</Text>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                placeholder="name@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {submitted && (
            <View style={styles.successBox}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={Colors.success}
              />
              <Text style={styles.successText}>
                אם קיימת כתובת אימייל תואמת במערכת, יישלח אליה קוד לאיפוס
                הסיסמה.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnLoading]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'שולח...' : 'שלח קוד לאיפוס'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  scroll: { paddingHorizontal: Spacing.xxl, paddingBottom: 40 },
  headerRow: { position: 'relative', minHeight: 32, marginBottom: Spacing.lg },
  backBtn: { position: 'absolute', right: 0, padding: 4 },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryFaint,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },

  titleRow: { width: '100%', alignItems: 'flex-end' },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
  },
  subtitleRow: { width: '100%', alignItems: 'flex-end' },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: Spacing.xxxl,
    lineHeight: 22,
  },

  form: { gap: Spacing.lg },
  inputGroup: { width: '100%', gap: Spacing.xs },
  labelRow: { width: '100%', alignItems: 'flex-end' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  successBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#F0FDF4',
    borderColor: Colors.success,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  successText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },

  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.xs,
    ...Shadow.medium,
  },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default ForgotPasswordScreen;
