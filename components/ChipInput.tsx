import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface Props {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

/** Add/remove chip editor for free-form lists like skills or certifications —
 *  replaces a raw comma-separated TextInput with discrete, removable chips.
 *  Prevents empty and duplicate (case/whitespace-insensitive) entries. */
const ChipInput: React.FC<Props> = ({ label, values, onChange, placeholder }) => {
  const [draft, setDraft] = useState('');

  const addValue = () => {
    const v = draft.trim();
    if (!v) return;
    const exists = values.some((x) => x.trim().toLowerCase() === v.toLowerCase());
    if (exists) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  };

  const removeValue = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
      </View>

      {values.length > 0 && (
        <View style={styles.chipRow}>
          {values.map((v, i) => (
            <View key={`${v}-${i}`} style={styles.chip}>
              <TouchableOpacity
                onPress={() => removeValue(i)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`הסר ${v}`}
              >
                <Ionicons name="close-circle" size={16} color={Colors.primaryDark} />
              </TouchableOpacity>
              <Text style={styles.chipText}>{v}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        <TouchableOpacity
          style={[styles.addBtn, !draft.trim() && styles.addBtnDisabled]}
          onPress={addValue}
          disabled={!draft.trim()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={20} color={Colors.white} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          onSubmitEditing={addValue}
          returnKeyType="done"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  labelRow: { width: '100%', alignItems: 'flex-end' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  chipRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primaryDark,
    writingDirection: 'rtl',
  },
  addRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: Colors.textMuted },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default ChipInput;
