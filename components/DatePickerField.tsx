import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface Props {
  label: string;
  value: string; // displayed/stored as DD/MM/YYYY, empty string = not set
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

const formatDDMMYYYY = (d: Date) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const parseDDMMYYYY = (value: string): Date => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (match) {
    const [, dd, mm, yyyy] = match;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

/** Native date picker (Expo/RN-community) that displays and stores the date
 *  as a DD/MM/YYYY string, matching the format the rest of the app already
 *  uses for job start dates / worker availability dates. */
const DatePickerField: React.FC<Props> = ({
  label,
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  minimumDate,
  error,
}) => {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState<Date>(() => parseDDMMYYYY(value || ''));

  const openPicker = () => {
    setDraft(parseDDMMYYYY(value || ''));
    setShow(true);
  };

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && selected) {
        onChange(formatDDMMYYYY(selected));
      }
      return;
    }
    // iOS: keep the sheet open, just track the draft until "אישור"
    if (selected) setDraft(selected);
  };

  const confirmIOS = () => {
    onChange(formatDDMMYYYY(draft));
    setShow(false);
  };

  const cancelIOS = () => setShow(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
      </View>
      <TouchableOpacity
        style={[styles.input, error && styles.inputError]}
        onPress={openPicker}
        activeOpacity={0.7}
      >
        <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
        <Text
          style={[
            styles.value,
            !value && styles.placeholder,
          ]}
        >
          {value || placeholder}
        </Text>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={draft}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide">
          <View style={styles.iosBackdrop}>
            <View style={styles.iosSheet}>
              <View style={styles.iosSheetHeader}>
                <TouchableOpacity onPress={confirmIOS}>
                  <Text style={styles.iosConfirm}>אישור</Text>
                </TouchableOpacity>
                <Text style={styles.iosTitle}>{label}</Text>
                <TouchableOpacity onPress={cancelIOS}>
                  <Text style={styles.iosCancel}>ביטול</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                minimumDate={minimumDate}
                onChange={handleChange}
                locale="he-IL"
                style={{ alignSelf: 'center' }}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 6 },
  labelRow: { width: '100%', alignItems: 'flex-end' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  input: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  inputError: { borderColor: Colors.danger },
  value: {
    fontSize: FontSize.md,
    color: Colors.text,
    writingDirection: 'ltr',
  },
  placeholder: { color: Colors.textMuted },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  iosBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  iosSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  iosSheetHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iosTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  iosConfirm: { fontSize: FontSize.md, fontWeight: '700', color: Colors.primary },
  iosCancel: { fontSize: FontSize.md, color: Colors.textSecondary },
});

export default DatePickerField;
