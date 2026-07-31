import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, Spacing } from '../theme/colors';

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
          <Text
            style={[
              styles.title,
              isPrimary ? styles.titleWhite : styles.titleDark,
            ]}
          >
            {title}
          </Text>

          {subtitle ? (
            <Text
              style={[
                styles.subtitle,
                isPrimary ? styles.subtitleWhite : styles.subtitleGray,
              ]}
            >
              {subtitle}
            </Text>
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
                  <Text style={styles.badgeText}>
                    {rightAction.badge > 9 ? '9+' : rightAction.badge}
                  </Text>
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
    width: 40,
    alignItems: 'flex-end',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  actionSide: {
    width: 40,
    alignItems: 'flex-start',
  },

  backBtn: {
    padding: 4,
  },

  rightBtn: {
    padding: 4,
    position: 'relative',
  },

  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
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