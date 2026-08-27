import React from 'react';
import { View, Text, StyleSheet, Image, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { getInitials } from '../utils/helpers';

/** Minimal shape WorkerAvatar needs — any worker-like subject with a stable
 *  id (used for the deterministic fallback color), a full name (used for
 *  initials) and an optional profile image. Kept narrower than the full
 *  Worker type on purpose, so an in-progress edit-screen draft (id + name
 *  + a not-yet-saved avatarUrl) can be previewed with the exact same
 *  component before it's saved to AppContext. */
export interface AvatarSubject {
  id: string;
  fullName: string;
  avatarUrl?: string;
}

// A muted, professional palette that fits BuildUp's warm brown/navy
// identity — used only for the deterministic initials-avatar background.
// Never randomized per render: the same worker.id always maps to the same
// color, in every screen.
const AVATAR_PALETTE = [
  '#1E3A5F', // navy
  '#0F766E', // teal
  '#9A7150', // warm brown (brand primary)
  '#6D28D9', // purple
  '#7A573C', // deep brown
  '#2E5B96', // slate blue
  '#B45309', // terracotta
  '#4B5563', // muted slate
];

const colorForId = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

interface Props {
  worker: AvatarSubject;
  size: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
}

/** Single source of truth for a worker's visual identity across the whole
 *  app: their real photo if `avatarUrl` is set, otherwise initials on a
 *  color that's always the same for that worker (derived from `id`, never
 *  random). Never a generic profession icon — a hammer/briefcase icon is
 *  not a person's identity. */
const WorkerAvatar: React.FC<Props> = ({ worker, size, style }) => {
  const dimStyle = { width: size, height: size, borderRadius: size / 2 };

  if (worker.avatarUrl) {
    return (
      <Image
        source={{ uri: worker.avatarUrl }}
        style={[styles.image, dimStyle, style] as StyleProp<ImageStyle>}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, dimStyle, { backgroundColor: colorForId(worker.id) }, style]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>
        {getInitials(worker.fullName)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: Colors.gray100 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: Colors.white, fontWeight: '800' },
});

export default WorkerAvatar;
