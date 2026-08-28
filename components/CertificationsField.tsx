import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { Certification, UploadedDocument } from '../types';
import DocumentUploadField from './DocumentUploadField';

interface Props {
  label?: string;
  value: Certification[];
  onChange: (next: Certification[]) => void;
}

const newCertId = () => `cert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** Editor for the worker's "תעודות והסמכות" — each certificate is its own row
 *  with a name AND an optional attached document (camera / gallery / PDF).
 *  The document belongs to THAT certification, never a loose shared array.
 *  Frontend-only: only the local URI + metadata are kept (see
 *  UploadedDocument), ready to be swapped for a Storage reference later.
 *  Used identically by worker sign-up and the profile-edit screen. */
const CertificationsField: React.FC<Props> = ({
  label = 'תעודות והסמכות',
  value,
  onChange,
}) => {
  const addRow = () => {
    onChange([...value, { id: newCertId(), name: '' }]);
  };

  const updateRow = (index: number, patch: Partial<Certification>) => {
    onChange(value.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
      </View>

      {value.map((cert, i) => (
        <View key={cert.id ?? `${i}-${cert.name}`} style={styles.card}>
          <View style={styles.cardHead}>
            <TouchableOpacity
              onPress={() => removeRow(i)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`הסר תעודה ${cert.name || i + 1}`}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
            <Text style={styles.cardIndex}>תעודה {i + 1}</Text>
          </View>

          <TextInput
            style={styles.input}
            value={cert.name}
            onChangeText={(name) => updateRow(i, { name })}
            placeholder="שם התעודה — לדוגמה: חשמלאי מוסמך"
            placeholderTextColor={Colors.textMuted}
          />

          <DocumentUploadField
            label="מסמך התעודה (אופציונלי)"
            documentType="certification"
            sheetTitle="הוספת מסמך תעודה"
            emptyHint="לחץ לצירוף — צילום, גלריה או קובץ PDF"
            value={cert.document ?? null}
            onChange={(doc: UploadedDocument | null) =>
              updateRow(i, { document: doc ?? undefined })
            }
          />
        </View>
      ))}

      <TouchableOpacity
        style={styles.addRow}
        onPress={addRow}
        activeOpacity={0.8}
      >
        <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
        <Text style={styles.addText}>הוסף תעודה</Text>
      </TouchableOpacity>
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
  card: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIndex: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  addRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    backgroundColor: Colors.white,
  },
  addText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
});

export default CertificationsField;
