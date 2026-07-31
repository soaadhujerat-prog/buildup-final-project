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
import { useApp, LoginResult } from '../context/AppContext';

type CustomerRole = 'contractor' | 'worker';

interface Props {
  role: CustomerRole;
  onLoginResult: (result: LoginResult) => void;
  onBack: () => void;
  onGoSignUp: () => void;
}

const LoginScreen: React.FC<Props> = ({
  role,
  onLoginResult,
  onBack,
  onGoSignUp,
}) => {
  const insets = useSafeAreaInsets();
  const { loginAsCustomer } = useApp();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identifierLabel =
    role === 'worker' ? 'תעודת זהות' : 'תעודת זהות או מספר רישום קבלנים';

  const identifierHint =
    role === 'worker'
      ? 'למשל: 311223344'
      : 'תעודת זהות של האחראי או מספר רישום הקבלן במערכת';

  const handleLogin = () => {
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      const result = loginAsCustomer(identifier, password);
      setIsLoading(false);

      if (!result.ok) {
        // we still raise the result so navigator can show the proper screen
        // for pending / rejected / blocked. "not_found" and "wrong_password"
        // stay here as inline errors.
        if (result.reason === 'not_found') {
          setError('לא נמצא משתמש עם תעודת הזהות הזו');
          return;
        }
        if (result.reason === 'wrong_password') {
          setError('סיסמה שגויה');
          return;
        }
      }

      onLoginResult(result);
    }, 600);
  };

  const isWorker = role === 'worker';

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

        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Ionicons
              name={isWorker ? 'hammer' : 'business'}
              size={28}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.logoText}>
            {isWorker ? 'כניסת עובד' : 'כניסת קבלן'}
          </Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.title}>ברוך הבא בחזרה</Text>
        </View>

        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            התחבר באמצעות תעודת הזהות שרשמת איתה במערכת
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{identifierLabel}</Text>
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons
                name="card-outline"
                size={20}
                color={Colors.textMuted}
              />
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={identifierHint}
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
                returnKeyType="next"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>סיסמה</Text>
            </View>

            <View style={styles.inputWrapper}>
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="הכנס סיסמה"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons
                name="alert-circle"
                size={18}
                color={Colors.danger}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.loginBtn, isLoading && styles.loginBtnLoading]}
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={isLoading}
          >
            <Text style={styles.loginBtnText}>
              {isLoading ? 'מתחבר...' : 'כניסה'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.hintBox}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={Colors.info}
          />
          <Text style={styles.hintText}>
            עדיין לא רשום? לחץ להרשמה למטה. מנהל המערכת יאשר את הרישום שלך
            לפני שתוכל להתחבר.
          </Text>
        </View>

        <View style={styles.signupRow}>
          <Text style={styles.signupText}>אין לך חשבון?</Text>
          <TouchableOpacity onPress={onGoSignUp} activeOpacity={0.7}>
            <Text style={styles.signupLink}>הרשמה</Text>
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
  logoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xxxl,
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },

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

  form: { gap: Spacing.lg, marginBottom: Spacing.xl },
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

  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.sm,
    ...Shadow.medium,
  },
  loginBtnLoading: { opacity: 0.7 },
  loginBtnText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  hintBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  hintText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },

  signupRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.md,
  },
  signupText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  signupLink: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default LoginScreen;
