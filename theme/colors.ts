export const Colors = {
  // Primary (brown/cream) — used for worker, contractor, and general screens
  primary: '#9A7150',
  primaryDark: '#7A573C',
  primaryLight: '#E6D5C3',
  primaryFaint: '#FCF8F3',

  // Secondary (dark blue) — kept for existing professional accents
  secondary: '#1E3A5F',
  secondaryDark: '#152D4A',
  secondaryLight: '#2E5B96',

  // Admin (dark blue palette — makes the admin section visually distinct)
  adminPrimary: '#1E3A5F',
  adminPrimaryDark: '#152D4A',
  adminPrimaryLight: '#D6E4F5',
  adminPrimaryFaint: '#F4F8FC',

  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',

  // Neutrals
  white: '#FFFFFF',
  black: '#0A0A0A',

  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // Surface / typography (new cream-toned palette)
  background: '#FFFDF9',
  surface: '#FDF8F2',
  border: '#E7D9C9',
  text: '#2F241C',
  textSecondary: '#6B5A4C',
  textMuted: '#9C8773',

  shadow: 'rgba(60,40,20,0.08)',
  overlay: 'rgba(0,0,0,0.5)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
};

export const Shadow = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
};

/**
 * Standard filter chip dimensions used across the app.
 * Apply these for consistent chip presentation.
 */
export const FilterChip = {
  height: 36,
  paddingHorizontal: 14,
  paddingVertical: 8,
  borderRadius: Radius.full,
  borderWidth: 1.5,
  gap: 8,
};
