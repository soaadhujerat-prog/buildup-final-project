import React from 'react';
import {
  View,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '../theme/colors';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Cap on the sheet height as a fraction of the usable height (below the
   * status bar). Default 0.9.
   */
  maxHeightRatio?: number;
  /**
   * Pin the sheet to its full (capped) height instead of letting it hug its
   * content — use for sheets with an internal `flex: 1` ScrollView and a
   * footer that must stay at the bottom.
   */
  fill?: boolean;
  /** Wrap the sheet in a KeyboardAvoidingView (sheets that contain inputs). */
  avoidKeyboard?: boolean;
  /** Extra style for the white sheet surface. */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Hide the grabber handle at the top. */
  hideHandle?: boolean;
}

/**
 * Shared bottom-sheet shell.
 *
 * One place that gets the cross-platform modal plumbing right:
 *   - `statusBarTranslucent` so the dim backdrop and the sheet cover the
 *     Android status-bar strip under edge-to-edge (SDK 54 default);
 *   - a full-bleed backdrop that dismisses on tap;
 *   - bottom safe-area padding so content clears the home indicator /
 *     Android navigation area;
 *   - a numeric `maxHeight` derived from the live window height, so a tall
 *     sheet never runs under the status bar;
 *   - `overflow: 'hidden'` so the rounded top corners actually clip content
 *     on Android and inner scroll views scroll within the capped frame;
 *   - an optional KeyboardAvoidingView for sheets with inputs.
 *
 * It owns layout only — callers keep their own header / body / footer and
 * all of their logic.
 */
const Sheet: React.FC<SheetProps> = ({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.9,
  fill = false,
  avoidKeyboard = false,
  sheetStyle,
  hideHandle = false,
}) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const maxHeight = Math.min(
    Math.round(height * maxHeightRatio),
    Math.round(height - insets.top - Spacing.xl)
  );

  const surface = (
    <View
      style={[
        styles.sheet,
        fill ? { height: maxHeight } : { maxHeight },
        { paddingBottom: Math.max(insets.bottom, Spacing.md) },
        sheetStyle,
      ]}
    >
      {!hideHandle && <View style={styles.handle} />}
      {children}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="סגירה"
        />
        {avoidKeyboard ? (
          <KeyboardAvoidingView
            style={styles.kav}
            pointerEvents="box-none"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {surface}
          </KeyboardAvoidingView>
        ) : (
          surface
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.sm,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
});

export default Sheet;
