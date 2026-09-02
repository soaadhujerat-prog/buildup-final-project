import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import WorksiteMapPicker, { WorksiteCoords } from './WorksiteMapPicker';

interface Props {
  /** The job's selected city — required before the map can be opened. */
  city: string;
  /** Current worksite pin, or null when none is set. */
  value: WorksiteCoords | null;
  onChange: (value: WorksiteCoords | null) => void;
}

const fmt = (n: number) => n.toFixed(5);

/**
 * "מיקום מדויק של העבודה" — an OPTIONAL map pin that augments the required
 * city. Contractor-facing, used in Post/Edit Job. When no pin is set the job
 * saves with the city alone and Smart Match uses the city centroid.
 */
const WorksiteLocationField: React.FC<Props> = ({ city, value, onChange }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasCity = !!city.trim();

  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>
        אפשר לסמן על מפה את המיקום המדויק של אתר העבודה. הסימון עוזר לעובדים
        להעריך מרחק ומופיע בפרטי המשרה. זהו שדה רשות — אם לא תסמנו, המשרה תוצג
        לפי העיר בלבד.
      </Text>

      {!hasCity ? (
        <View style={styles.disabledRow}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.disabledText}>יש לבחור עיר קודם כדי לסמן מיקום על המפה.</Text>
        </View>
      ) : value ? (
        <View style={styles.selectedCard}>
          <View style={styles.selectedHead}>
            <Ionicons name="location" size={18} color={Colors.primary} />
            <Text style={styles.selectedTitle}>מיקום מדויק נבחר</Text>
          </View>
          <Text style={styles.selectedCoords}>
            {fmt(value.lat)}, {fmt(value.lon)}
          </Text>
          <View style={styles.selectedActions}>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={15} color={Colors.primary} />
              <Text style={styles.linkBtnText}>שנה מיקום</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => onChange(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              <Text style={[styles.linkBtnText, { color: Colors.danger }]}>
                הסר מיקום מדויק
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.pickBtn}
          onPress={() => setPickerOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={18} color={Colors.primary} />
          <Text style={styles.pickBtnText}>בחר מיקום במפה</Text>
        </TouchableOpacity>
      )}

      <WorksiteMapPicker
        visible={pickerOpen}
        city={city}
        initial={value}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(coords) => {
          onChange(coords);
          setPickerOpen(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: Spacing.sm },
  help: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  disabledRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  disabledText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pickBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  pickBtnText: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  selectedCard: {
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
    backgroundColor: Colors.primaryFaint,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: 6,
  },
  selectedHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  selectedTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  selectedCoords: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  selectedActions: {
    flexDirection: 'row-reverse',
    gap: Spacing.lg,
    marginTop: 2,
  },
  linkBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  linkBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
});

export default WorksiteLocationField;
