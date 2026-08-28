import React from 'react';
import {
  View,
  StyleSheet,
  Image,
  StyleProp,
  ViewStyle,
  ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';

/** Minimal shape ContractorAvatar needs — anything with an optional profile
 *  image / company logo URI. Kept narrower than the full Contractor type so
 *  an in-progress edit-screen draft (a not-yet-saved avatarUrl) previews
 *  with the exact same component. */
export interface ContractorAvatarSubject {
  avatarUrl?: string;
}

interface Props {
  contractor: ContractorAvatarSubject | null | undefined;
  size: number;
  /** Icon color for the fallback. Defaults to the brand secondary (navy). */
  iconColor?: string;
  /** Background for the fallback tile. Defaults to the light-blue chip color. */
  fallbackBg?: string;
  style?: StyleProp<ViewStyle | ImageStyle>;
}

/** Single source of truth for a contractor / company's visual identity: the
 *  uploaded photo or company logo if `avatarUrl` is set, otherwise the
 *  existing building icon on a soft tile. NEVER initials or letters from the
 *  contractor's name — a company's fallback is always the building mark
 *  (this is the deliberate asymmetry with WorkerAvatar, which falls back to
 *  a person's initials). */
const ContractorAvatar: React.FC<Props> = ({
  contractor,
  size,
  iconColor = Colors.secondary,
  fallbackBg = '#DBEAFE',
  style,
}) => {
  const dimStyle = { width: size, height: size, borderRadius: size / 4 };

  if (contractor?.avatarUrl) {
    return (
      <Image
        source={{ uri: contractor.avatarUrl }}
        style={[styles.image, dimStyle, style] as StyleProp<ImageStyle>}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dimStyle, { backgroundColor: fallbackBg }, style]}
    >
      <Ionicons name="business" size={size * 0.5} color={iconColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: Colors.gray100 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

export default ContractorAvatar;
