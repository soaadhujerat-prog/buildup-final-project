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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { useApp } from '../context/AppContext';

interface Props {
  onBack: () => void;
}

const AdminLoginScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { loginAsAdmin } = useApp();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const r = loginAsAdmin(identifier, password);
      setLoading(false);
      // Deliberately generic regardless of the failure reason — never
      // reveal whether the ID or the password was the wrong part.
      if (!r.ok) setError('פרטי ההתחברות אינם נכונים');
      // success: AppNavigator will route via the currentUser effect.
    }, 500);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The hero (back button, logo, title, subtitle) is rendered
            *inside* the gradient itself now, instead of behind a
            fixed-height absolute strip — so the blue background always
            grows to fully contain its white text, on every device/insets/
            font-scale, instead of the text potentially spilling onto the
            white page background below where it'd be unreadable. */}
        <LinearGradient
          colors={[Colors.secondary, Colors.secondaryDark ?? '#1E3A8A']}
          style={[styles.topBar, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-forward" size={26} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.logoCircle}>
            <Ionicons
              name="shield-checkmark"
              size={48}
              color={Colors.white}
            />
          </View>

          <Text style={styles.title}>כניסת מנהל מערכת</Text>
          <Text style={styles.subtitle}>
            איזור מאובטח לצוות ADMIN בלבד.{'\n'}
            חשבונות מוגדרים מראש – אין הרשמה.
          </Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>תעודת זהות / אימייל</Text>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="person-outline"
                size={18}
                color={Colors.textMuted}
              />
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="הזן תעודת זהות או אימייל"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                keyboardType="default"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>סיסמה</Text>
            </View>
            <View style={styles.inputWrapper}>
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textMuted}
                />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showPassword}
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.cta, loading && styles.ctaDim]}
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}
          >
            <Text style={styles.ctaText}>
              {loading ? 'מתחבר...' : 'כניסה למערכת'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  // Wraps its own content (back button, logo, title, subtitle) instead of
  // being a fixed-height absolute strip behind the scroll content — so the
  // blue background always extends exactly as far as the white text does.
  topBar: {
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.xl,
  },
  scroll: { paddingBottom: 60 },

  headerRow: { minHeight: 32, marginBottom: Spacing.md },
  backBtn: { position: 'absolute', right: 0, padding: 4 },

  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },

  title: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },

  card: {
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.medium,
  },

  inputGroup: { width: '100%', gap: 6 },
  labelRow: { width: '100%', alignItems: 'flex-end' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
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
    gap: 6,
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  cta: {
    backgroundColor: Colors.secondary,
    borderRadius: Radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  ctaDim: { opacity: 0.7 },
  ctaText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default AdminLoginScreen;
