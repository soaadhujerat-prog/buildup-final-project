import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';

interface Props {
  visible: boolean;
  title: string;
  /** Short explanatory line under the title. Optional. */
  message?: string;
  /** Label above the optional free-text box. */
  inputLabel: string;
  inputPlaceholder: string;
  /** Confirm button caption, e.g. "אישור ושיבוץ" / "ביטול שיבוץ". */
  confirmLabel: string;
  /** Cancel/back button caption. Defaults to "חזור". */
  cancelLabel?: string;
  /** Paint the confirm button red (irreversible / removing something). */
  destructive?: boolean;
  onConfirm: (message: string) => void;
  onClose: () => void;
}

/** One shared confirm-with-optional-note sheet for every "respond to X"
 *  action: accept/reject an application, accept/decline an invitation,
 *  cancel an assignment from either side. Bottom-sheet layout, RTL,
 *  keyboard-safe (tap the dimmed area to dismiss the keyboard only — it
 *  never closes the sheet, and the typed note is kept until the sheet
 *  actually closes). */
const ResponseDialog: React.FC<Props> = ({
  visible,
  title,
  message,
  inputLabel,
  inputPlaceholder,
  confirmLabel,
  cancelLabel = 'חזור',
  destructive,
  onConfirm,
  onClose,
}) => {
  const [text, setText] = useState('');

  // Reset the note whenever the sheet is dismissed/reopened so a previous
  // action's text never leaks into the next one.
  useEffect(() => {
    if (!visible) setText('');
  }, [visible]);

  const handleConfirm = () => {
    onConfirm(text.trim());
    setText('');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            style={styles.kav}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableWithoutFeedback
              onPress={Keyboard.dismiss}
              accessible={false}
            >
              <View style={styles.card}>
                <View style={styles.handle} />
                <Text style={styles.title}>{title}</Text>
                {!!message && <Text style={styles.message}>{message}</Text>}

                <Text style={styles.inputLabel}>{inputLabel}</Text>
                <TextInput
                  style={styles.input}
                  value={text}
                  onChangeText={setText}
                  placeholder={inputPlaceholder}
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnCancel]}
                    onPress={onClose}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnCancelText}>{cancelLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.btn,
                      destructive ? styles.btnDestructive : styles.btnConfirm,
                    ]}
                    onPress={handleConfirm}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnConfirmText}>{confirmLabel}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  kav: { width: '100%' },
  card: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    gap: 10,
    ...Shadow.large,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    marginBottom: 4,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  message: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: FontSize.sm + 6,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },
  input: {
    minHeight: 76,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  btnCancelText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },
  btnConfirm: { backgroundColor: Colors.primary },
  btnDestructive: { backgroundColor: Colors.danger },
  btnConfirmText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
    writingDirection: 'rtl',
  },
});

export default ResponseDialog;
