import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { ISRAEL_CITIES, findCityByNameOrAlias, findClosestIsraelCity } from '../data/israelCities';

interface Props {
  label: string;
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
  error?: string;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, ' ');

/** Shared "עיר מגורים" picker — a single tappable field that opens a
 *  searchable modal list of Israeli cities/towns, with an optional
 *  "use my current location" shortcut. Used by sign-up and profile-edit
 *  screens for both workers and contractors so the picker behaves and
 *  looks identical everywhere. */
const CityPickerField: React.FC<Props> = ({
  label,
  value,
  onChange,
  placeholder = 'בחר עיר מגורים',
  error,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return ISRAEL_CITIES;
    return ISRAEL_CITIES.filter((c) => normalize(c).includes(q));
  }, [query]);

  const openModal = () => {
    setQuery('');
    setLocationError(null);
    setOpen(true);
  };

  const closeModal = () => setOpen(false);

  const selectCity = (city: string) => {
    onChange(city);
    closeModal();
  };

  const useCurrentLocation = useCallback(async () => {
    setLocationError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('לא ניתנה הרשאת מיקום. אפשר לבחור עיר מהרשימה למטה.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;

      // Reverse geocoding is best-effort and its result may come back in
      // English/transliterated form (or fail outright) — it is only ever
      // used to look up a canonical Hebrew entry below, never stored or
      // shown directly.
      let matched = undefined as ReturnType<typeof findCityByNameOrAlias>;
      try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = results[0];
        const rawName = place?.city || place?.subregion || place?.district || place?.region;
        matched = findCityByNameOrAlias(rawName);
      } catch {
        // ignore — fall back to coordinate-based matching below
      }

      if (!matched) {
        matched = findClosestIsraelCity(latitude, longitude);
      }

      if (!matched) {
        setLocationError('לא הצלחנו לזהות עיר מהמיקום הנוכחי. אפשר לבחור עיר מהרשימה.');
        return;
      }

      selectCity(matched.name);
    } catch {
      setLocationError('אחזור המיקום נכשל. אפשר לבחור עיר מהרשימה למטה.');
    } finally {
      setLocating(false);
    }
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
      </View>

      <TouchableOpacity
        style={[styles.field, error && styles.fieldError]}
        onPress={openModal}
        activeOpacity={0.7}
      >
        <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Modal visible={open} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            style={styles.sheetWrap}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <TouchableOpacity
                  onPress={closeModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="סגור"
                >
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>בחירת עיר מגורים</Text>
                <View style={styles.sheetHeaderSpacer} />
              </View>

              <View style={styles.searchWrapper}>
                <Ionicons name="search" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="חיפוש עיר או יישוב..."
                  placeholderTextColor={Colors.textMuted}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="נקה חיפוש"
                  >
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.locationBtn}
                onPress={useCurrentLocation}
                activeOpacity={0.8}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="locate" size={18} color={Colors.primary} />
                )}
                <Text style={styles.locationBtnText}>
                  {locating ? 'מזהה מיקום נוכחי...' : 'השתמש במיקום הנוכחי שלי'}
                </Text>
              </TouchableOpacity>
              {!!locationError && <Text style={styles.locationErrorText}>{locationError}</Text>}

              <FlatList
                data={filtered}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>לא נמצאו ערים תואמות</Text>
                }
                renderItem={({ item }) => {
                  const selected = item === value;
                  return (
                    <TouchableOpacity
                      style={[styles.row, selected && styles.rowSelected]}
                      onPress={() => selectCity(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.rowText, selected && styles.rowTextSelected]}>
                        {item}
                      </Text>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                      ) : (
                        <View style={styles.rowCheckSpacer} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  fieldError: { borderColor: Colors.danger },
  value: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  placeholder: { color: Colors.textMuted },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetWrap: { maxHeight: '88%' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.lg,
    height: '100%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  sheetHeaderSpacer: { width: 24 },

  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray50,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
    padding: 0,
  },

  locationBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFaint,
  },
  locationBtnText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  locationErrorText: {
    marginHorizontal: Spacing.lg,
    marginTop: 6,
    fontSize: FontSize.xs,
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },

  list: { marginTop: Spacing.sm },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  rowSelected: { backgroundColor: Colors.primaryFaint },
  rowText: {
    fontSize: FontSize.md,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  rowTextSelected: { color: Colors.primaryDark, fontWeight: '700' },
  rowCheckSpacer: { width: 20 },
  emptyText: {
    marginTop: Spacing.xl,
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

export default CityPickerField;
