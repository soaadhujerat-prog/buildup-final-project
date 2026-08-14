import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  Shadow,
  FilterChip as FC,
} from '../theme/colors';
import { useApp } from '../context/AppContext';
import DatePickerField from '../components/DatePickerField';
import { AREAS_ISRAEL } from '../data/mockData';
import { Worker } from '../types';

interface Props {
  onBack: () => void;
}

const AvailabilityManagementScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { currentUser, setWorkerAvailability, updateWorkerProfile } =
    useApp();
  const me = currentUser as Worker | undefined;

  const [isAvailable, setIsAvailable] = useState(me?.isAvailable ?? false);
  const [availableFrom, setAvailableFrom] = useState(
    me?.availableFrom ?? ''
  );
  const [preferredAreas, setPreferredAreas] = useState<string[]>(
    me?.preferredAreas ?? []
  );

  if (!me || me.role !== 'worker') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.notFound}>אין משתמש פעיל</Text>
      </View>
    );
  }

  const toggleArea = (a: string) => {
    setPreferredAreas((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSave = () => {
    if (submitting) return;
    if (preferredAreas.length === 0) {
      Alert.alert('שגיאה', 'יש לבחור לפחות אזור עבודה אחד');
      return;
    }
    if (
      availableFrom.trim() &&
      !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(availableFrom.trim())
    ) {
      Alert.alert('שגיאה', 'תאריך זמינות חייב להיות בפורמט DD/MM/YYYY');
      return;
    }
    setSubmitting(true);
    setWorkerAvailability(me.id, isAvailable);
    updateWorkerProfile(me.id, {
      availableFrom: availableFrom.trim() || undefined,
      preferredAreas,
    });
    setSubmitting(false);
    Alert.alert('נשמר', 'ההגדרות עודכנו בהצלחה.', [
      { text: 'אישור', onPress: onBack },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ניהול זמינות</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Section title="סטטוס זמינות">
          <View style={styles.toggleCard}>
            <Switch
              value={isAvailable}
              onValueChange={setIsAvailable}
              trackColor={{ false: Colors.border, true: Colors.success }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>
                {isAvailable ? 'זמין לעבודה כעת' : 'לא זמין כרגע'}
              </Text>
              <Text style={styles.toggleSub}>
                {isAvailable
                  ? 'קבלנים יוכלו למצוא אותך בחיפוש ולשלוח הזמנות'
                  : 'הפרופיל שלך יוסתר מתוצאות חיפוש פעילות'}
              </Text>
            </View>
          </View>
        </Section>

        <Section title="זמין החל מתאריך (אופציונלי)">
          <Text style={styles.help}>
            אם אינך זמין מיידית אבל תהיה זמין בעתיד הקרוב, אפשר לציין מתי.
          </Text>
          <DatePickerField
            label="זמין החל מ-"
            value={availableFrom}
            onChange={setAvailableFrom}
            minimumDate={new Date()}
          />
        </Section>

        <Section title="אזורי עבודה מועדפים">
          <Text style={styles.help}>
            בחר את האזורים שבהם אתה מוכן לעבוד. עבודות מאזורים אלו יוצגו לך
            תחילה.
          </Text>
          <View style={styles.areaGrid}>
            {AREAS_ISRAEL.map((a) => {
              const active = preferredAreas.includes(a);
              return (
                <TouchableOpacity
                  key={a}
                  onPress={() => toggleArea(a)}
                  style={[styles.areaChip, active && styles.areaChipActive]}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={active ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={active ? Colors.primary : Colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.areaChipText,
                      active && styles.areaChipTextActive,
                    ]}
                  >
                    {a}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle"
            size={18}
            color={Colors.secondary}
          />
          <Text style={styles.infoText}>
            ניתן לשנות את הזמינות בכל עת. שינויים יישמרו מיד.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={submitting}
        >
          <Text style={styles.saveText}>
            {submitting ? 'שומר...' : 'שמור שינויים'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerBar: {
    position: 'relative',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    position: 'absolute',
    right: Spacing.lg,
    top: Spacing.md,
    padding: 4,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  notFound: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 60,
  },

  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.small,
  },
  sectionHead: { width: '100%', alignItems: 'flex-end', marginBottom: 8 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  sectionBody: { gap: Spacing.sm },

  help: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },

  toggleCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
  },
  toggleTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  toggleSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 2,
  },

  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'ltr',
  },

  areaGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  areaChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: FC.height,
    paddingHorizontal: FC.paddingHorizontal,
    borderRadius: FC.borderRadius,
    backgroundColor: Colors.gray50,
    borderWidth: FC.borderWidth,
    borderColor: 'transparent',
  },
  areaChipActive: {
    backgroundColor: Colors.primaryFaint,
    borderColor: Colors.primary,
  },
  areaChipText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
  },
  areaChipTextActive: { color: Colors.primary },

  infoBox: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.secondary,
    lineHeight: 20,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  saveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: Radius.full,
    alignItems: 'center',
    ...Shadow.medium,
  },
  saveText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

export default AvailabilityManagementScreen;
