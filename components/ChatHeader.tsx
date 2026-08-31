import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ChatAvatar from './ChatAvatar';
import { Colors, Spacing, FontSize } from '../theme/colors';
import { chatPartyName, chatPartySubtitle } from '../utils/helpers';
import type { Admin, Contractor, Worker } from '../types';

interface Props {
  otherUser: Worker | Contractor | Admin | undefined;
  /** Safe-area top inset from the screen. */
  topInset: number;
  onBack: () => void;
}

/** The chat screen's top bar — shared by the worker and contractor sides.
 *  Shows the same avatar, name and subtitle as the inbox row. `onBack` is
 *  passed straight through; this component owns none of the navigation. */
const ChatHeader: React.FC<Props> = ({ otherUser, topInset, onBack }) => {
  const subtitle = chatPartySubtitle(otherUser);

  return (
    <View style={[styles.header, { paddingTop: topInset + Spacing.sm }]}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-forward" size={26} color={Colors.text} />
      </TouchableOpacity>

      <ChatAvatar user={otherUser} size={40} />

      <View style={styles.center}>
        <Text style={styles.name} numberOfLines={1}>
          {chatPartyName(otherUser)}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 2,
  },
  center: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 1,
  },
});

export default ChatHeader;
