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
import { updatePassword } from '../services/passwordResetService';
import {
  isPasswordValid,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_TEXT,
} from '../utils/passwordPolicy';
import PasswordChecklist from '../components/PasswordChecklist';

interface Props {
  onBack: () => void;
}

/** Sets a new password. Reached ONLY after the emailed recovery CODE is
 *  verified: VerifyRecoveryCodeScreen calls
 *  `supabase.auth.verifyOtp({ type: 'recovery' })` (native Supabase Auth — no
 *  custom token), which opens the recovery session, then flips
 *  `passwordRecoveryActive`, which routes AppNavigator's top-level gate here.
 *  `updatePassword` is `supabase.auth.updateUser({ password })` on that
 *  recovery session; the shared `utils/passwordPolicy` rules are enforced
 *  below. `onBack` here signs the recovery session out and returns to Welcome. */
const ResetPasswordScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Same policy as SignUpScreen (utils/passwordPolicy.ts) — no drift.
  const pwValid = isPasswordValid(newPassword);
  const pwMismatch =
    confirmPassword.length > 0 && confirmPassword !== newPassword;
  const canSubmit = !submitting && pwValid && newPassword === confirmPassword;

  const validate = (): string | null => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      return 'יש למלא את שני השדות';
    }
    if (!isPasswordValid(newPassword)) {
      return PASSWORD_RULE_TEXT;
    }
    if (newPassword !== confirmPassword) {
      return 'הסיסמאות אינן זהות';
    }
    return null;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await updatePassword(newPassword);
      setSubmitted(true);
    } catch {
      // Backend enabled and the update genuinely failed (e.g. the recovery
      // session expired). Surface it — no silent success.
      setError('לא ניתן לעדכן את הסיסמה כעת. חזור/חזרי למסך הכניסה ובקש/י קוד איפוס חדש.');
    } finally {
      setSubmitting(false);
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
          <Ionicons
            name={submitted ? 'checkmark-circle-outline' : 'lock-closed-outline'}
            size={36}
            color={submitted ? Colors.success : Colors.primary}
          />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>הגדרת סיסמה חדשה</Text>
        </View>

        {submitted ? (
          <>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>הסיסמה עודכנה בהצלחה.</Text>
            </View>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={onBack}
              activeOpacity={0.85}
            >
              <Text style={styles.submitBtnText}>חזרה למסך הכניסה</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>
                הזן סיסמה חדשה לחשבון שלך. {PASSWORD_RULE_TEXT}.
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>סיסמה חדשה</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowNewPassword((v) => !v)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={(v) => {
                      setNewPassword(v);
                      if (error) setError(null);
                    }}
                    placeholder={`לפחות ${PASSWORD_MIN_LENGTH} תווים`}
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <PasswordChecklist value={newPassword} />

              <View style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>אימות סיסמה</Text>
                </View>
                <View style={styles.inputWrapper}>
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.textMuted}
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(v) => {
                      setConfirmPassword(v);
                      if (error) setError(null);
                    }}
                    placeholder="הקלד שוב את הסיסמה"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                </View>
              </View>

              {pwMismatch && (
                <Text style={styles.mismatchText}>הסיסמאות אינן זהות</Text>
              )}

              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (submitting || !canSubmit) && styles.submitBtnLoading,
                ]}
                onPress={handleSubmit}
                activeOpacity={0.85}
                disabled={!canSubmit}
              >
                <Text style={styles.submitBtnText}>
                  {submitting ? 'מעדכן...' : 'עדכן סיסמה'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
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
  eyeBtn: { paddingVertical: 6 },
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
  mismatchText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
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

export default ResetPasswordScreen;
