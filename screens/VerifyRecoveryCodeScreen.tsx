import React, { useEffect, useRef, useState } from 'react';
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
import {
  requestPasswordReset,
  verifyRecoveryCode,
  RecoveryCodeError,
  RECOVERY_CODE_LENGTH,
} from '../services/passwordResetService';

interface Props {
  /** The address the recovery code was sent to (from ForgotPasswordScreen). */
  email: string;
  onBack: () => void;
  /** The code verified — a live Supabase recovery session now exists. The
   *  caller flips `passwordRecoveryActive`, which routes to ResetPasswordScreen. */
  onVerified: () => void;
}

const RESEND_COOLDOWN_SEC = 60;

/** Step 2 of CODE-based password recovery (no deep link): the user pastes the
 *  one-time code from the email; we verify it with Supabase Auth's native
 *  `verifyOtp({ type: 'recovery' })`. On success the recovery session is live
 *  and ResetPasswordScreen takes over. Visual language matches
 *  ForgotPasswordScreen / ResetPasswordScreen. */
const VerifyRecoveryCodeScreen: React.FC<Props> = ({
  email,
  onBack,
  onVerified,
}) => {
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown for the "resend code" action — starts on mount (a code was just
  // sent by the previous screen) and after every resend. Respects Supabase's
  // own auth rate limit; we never auto-resend.
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SEC);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const digits = code.replace(/\D/g, '').slice(0, RECOVERY_CODE_LENGTH);
  const canSubmit = !verifying && digits.length === RECOVERY_CODE_LENGTH;

  const handleVerify = async () => {
    if (verifying) return;
    if (digits.length !== RECOVERY_CODE_LENGTH) {
      setError(`יש להזין קוד בן ${RECOVERY_CODE_LENGTH} ספרות`);
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      await verifyRecoveryCode(email, digits);
      onVerified();
    } catch (e) {
      if (e instanceof RecoveryCodeError) {
        setError('הקוד שגוי או שפג תוקפו. בקש/י קוד חדש ונסה/י שוב.');
      } else {
        setError('אירעה שגיאה. בדוק/י את החיבור לאינטרנט ונסה/י שוב.');
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setError(null);
    setResending(true);
    try {
      await requestPasswordReset(email);
    } finally {
      setResending(false);
      startCooldown();
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
          <Ionicons name="mail-open-outline" size={36} color={Colors.primary} />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>הזנת קוד אימות</Text>
        </View>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            אם קיימת כתובת אימייל תואמת במערכת, נשלח אליה קוד בן{' '}
            {RECOVERY_CODE_LENGTH} ספרות. הזן/י אותו כאן כדי להמשיך.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>קוד אימות</Text>
            </View>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.codeInput}
                value={digits}
                onChangeText={(v) => {
                  setCode(v);
                  if (error) setError(null);
                }}
                placeholder={'—'.repeat(RECOVERY_CODE_LENGTH)}
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={RECOVERY_CODE_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleVerify}
                autoFocus
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (verifying || !canSubmit) && styles.submitBtnLoading,
            ]}
            onPress={handleVerify}
            activeOpacity={0.85}
            disabled={!canSubmit}
          >
            <Text style={styles.submitBtnText}>
              {verifying ? 'מאמת...' : 'אמת קוד'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResend}
            activeOpacity={0.7}
            disabled={resending || cooldown > 0}
          >
            <Text
              style={[
                styles.resendText,
                (resending || cooldown > 0) && styles.resendTextDisabled,
              ]}
            >
              {resending
                ? 'שולח קוד חדש...'
                : cooldown > 0
                ? `אפשר לבקש קוד חדש בעוד ${cooldown} שניות`
                : 'שלח שוב את הקוד'}
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
  codeInput: {
    flex: 1,
    fontSize: FontSize.xxl,
    color: Colors.text,
    paddingVertical: 14,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: '700',
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

  resendBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  resendText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  resendTextDisabled: { color: Colors.textMuted },
});

export default VerifyRecoveryCodeScreen;
