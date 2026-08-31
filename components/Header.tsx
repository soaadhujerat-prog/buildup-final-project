import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing } from '../theme/colors';
import AppText from './AppText';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: {
    icon: string;
    onPress: () => void;
    badge?: number;
  };
  variant?: 'primary' | 'white';
}

const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
  variant = 'primary',
}) => {
  const insets = useSafeAreaInsets();
  const isPrimary = variant === 'primary';

  return (
    <View
      style={[
        styles.container,
        isPrimary ? styles.primaryBg : styles.whiteBg,
        { paddingTop: insets.top + Spacing.sm },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.backSide}>
          {showBack && (
            <TouchableOpacity
              onPress={onBack}
              style={styles.backBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
            >
              <Ionicons
                name="chevron-forward"
                size={24}
                color={isPrimary ? Colors.white : Colors.text}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.center}>
          <AppText
            compact
            numberOfLines={1}
            style={[
              styles.title,
              isPrimary ? styles.titleWhite : styles.titleDark,
            ]}
          >
            {title}
          </AppText>

          {subtitle ? (
            <AppText
              compact
              numberOfLines={1}
              style={[
                styles.subtitle,
                isPrimary ? styles.subtitleWhite : styles.subtitleGray,
              ]}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>

        <View style={styles.actionSide}>
          {rightAction ? (
            <TouchableOpacity
              onPress={rightAction.onPress}
              style={styles.rightBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name={rightAction.icon as any}
                size={24}
                color={isPrimary ? Colors.white : Colors.text}
              />

              {rightAction.badge !== undefined && rightAction.badge > 0 ? (
                <View style={styles.badge}>
                  <AppText compact style={styles.badgeText}>
                    {rightAction.badge > 9 ? '9+' : rightAction.badge}
                  </AppText>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },

  primaryBg: {
    backgroundColor: Colors.primary,
  },

  whiteBg: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  backSide: {
    width: 44,
    alignItems: 'flex-end',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionSide: {
    width: 44,
    alignItems: 'flex-start',
  },

  // >= 44x44 touch target (was padding:4 → ~32px, easy to miss).
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rightBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
    flexShrink: 1,
  },

  titleWhite: {
    color: Colors.white,
  },

  titleDark: {
    color: Colors.text,
  },

  subtitle: {
    fontSize: FontSize.sm,
    marginTop: 2,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  subtitleWhite: {
    color: 'rgba(255,255,255,0.8)',
  },

  subtitleGray: {
    color: Colors.textSecondary,
  },

  badge: {
    position: 'absolute',
    top: -2,
    left: -2,
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  badgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});

export default Header;