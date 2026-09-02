import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { cityCoords } from '../data/israelCities';

export interface WorksiteCoords {
  lat: number;
  lon: number;
}

interface Props {
  visible: boolean;
  /** The job's already-chosen city — centres the map when there is no pin yet. */
  city: string;
  /** A previously-saved pin (edit mode) — the map opens here. */
  initial?: WorksiteCoords | null;
  onCancel: () => void;
  onConfirm: (coords: WorksiteCoords) => void;
}

// Neighbourhood-level zoom for a city / saved pin; country-level when we have
// neither.
const PIN_DELTA = 0.05;
const CITY_DELTA = 0.08;
const ISRAEL_REGION: Region = {
  latitude: 31.7,
  longitude: 35.0,
  latitudeDelta: 3.2,
  longitudeDelta: 3.2,
};

const fmt = (n: number) => n.toFixed(5);

/**
 * Body of the picker — mounted ONLY while the modal is open so `initialRegion`
 * and the marker state are always fresh for the job being edited.
 */
const PickerBody: React.FC<Omit<Props, 'visible'>> = ({
  city,
  initial,
  onCancel,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const geocodeSeq = useRef(0);

  const startRegion = useMemo<Region>(() => {
    if (initial) {
      return {
        latitude: initial.lat,
        longitude: initial.lon,
        latitudeDelta: PIN_DELTA,
        longitudeDelta: PIN_DELTA,
      };
    }
    const c = cityCoords(city);
    if (c) {
      return {
        latitude: c.lat,
        longitude: c.lon,
        latitudeDelta: CITY_DELTA,
        longitudeDelta: CITY_DELTA,
      };
    }
    return ISRAEL_REGION;
    // computed once on mount — the modal remounts this body on every open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [pin, setPin] = useState<WorksiteCoords | null>(initial ?? null);
  const [addressHint, setAddressHint] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Best-effort reverse geocode -> a short address hint. Display only; failures
  // are silent and it is never persisted.
  const refreshAddressHint = useCallback(async (coords: WorksiteCoords) => {
    const seq = ++geocodeSeq.current;
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: coords.lat,
        longitude: coords.lon,
      });
      if (seq !== geocodeSeq.current) return;
      const p = results[0];
      if (!p) {
        setAddressHint(null);
        return;
      }
      const parts = [
        [p.street, p.streetNumber].filter(Boolean).join(' '),
        p.city || p.subregion || p.district || p.region,
      ].filter((s): s is string => !!s && s.trim().length > 0);
      setAddressHint(parts.length ? parts.join(', ') : null);
    } catch {
      if (seq === geocodeSeq.current) setAddressHint(null);
    }
  }, []);

  const placePin = useCallback(
    (coords: WorksiteCoords) => {
      setPin(coords);
      void refreshAddressHint(coords);
    },
    [refreshAddressHint]
  );

  const useCurrentLocation = useCallback(async () => {
    setLocateError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocateError('לא ניתנה הרשאת מיקום. אפשר לסמן את המיקום ידנית על המפה.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
      placePin(coords);
      mapRef.current?.animateToRegion(
        {
          latitude: coords.lat,
          longitude: coords.lon,
          latitudeDelta: PIN_DELTA,
          longitudeDelta: PIN_DELTA,
        },
        350
      );
    } catch {
      setLocateError('איתור המיקום הנוכחי נכשל. אפשר לסמן את המיקום ידנית על המפה.');
    } finally {
      setLocating(false);
    }
  }, [placePin]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="ביטול"
        >
          <Ionicons name="close" size={26} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>סימון מיקום העבודה</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={startRegion}
          onPress={(e) =>
            placePin({
              lat: e.nativeEvent.coordinate.latitude,
              lon: e.nativeEvent.coordinate.longitude,
            })
          }
          showsUserLocation={false}
          toolbarEnabled={false}
        >
          {pin && (
            <Marker
              coordinate={{ latitude: pin.lat, longitude: pin.lon }}
              draggable
              onDragEnd={(e) =>
                placePin({
                  lat: e.nativeEvent.coordinate.latitude,
                  lon: e.nativeEvent.coordinate.longitude,
                })
              }
            />
          )}
        </MapView>

        {!pin && (
          <View style={styles.hintOverlay} pointerEvents="none">
            <View style={styles.hintPill}>
              <Ionicons name="hand-left-outline" size={15} color={Colors.white} />
              <Text style={styles.hintPillText}>
                הקש על המפה כדי לסמן את מיקום העבודה
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.currentBtn}
          onPress={useCurrentLocation}
          activeOpacity={0.85}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="locate" size={18} color={Colors.primary} />
          )}
          <Text style={styles.currentBtnText}>
            {locating ? 'מאתר מיקום…' : 'השתמש במיקום הנוכחי'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {!!locateError && <Text style={styles.errorText}>{locateError}</Text>}

        {pin ? (
          <View style={styles.selectedRow}>
            <Ionicons name="location" size={16} color={Colors.primary} />
            <View style={styles.selectedTextWrap}>
              <Text style={styles.selectedCoords} numberOfLines={1}>
                {fmt(pin.lat)}, {fmt(pin.lon)}
              </Text>
              {!!addressHint && (
                <Text style={styles.selectedAddress} numberOfLines={1}>
                  {addressHint}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <Text style={styles.footerHint}>
            עדיין לא נבחר מיקום מדויק. אפשר לשמור את המשרה עם העיר בלבד.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.confirmBtn, !pin && styles.confirmBtnDisabled]}
          onPress={() => pin && onConfirm(pin)}
          disabled={!pin}
          activeOpacity={0.85}
        >
          <Text style={styles.confirmBtnText}>אישור המיקום</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

/**
 * Full-screen map for a contractor to pin the EXACT worksite location of a job.
 * Expo-Go-compatible (react-native-maps: Apple Maps on iOS, Google via Expo Go
 * on Android — no API key). Tap the map or drag the marker to place the point.
 * "use my current location" is a one-time foreground fetch and never blocks
 * manual selection. Only the coordinate is returned; the address line is a
 * best-effort display hint and is never persisted.
 */
const WorksiteMapPicker: React.FC<Props> = ({ visible, ...rest }) => (
  <Modal
    visible={visible}
    animationType="slide"
    onRequestClose={rest.onCancel}
    presentationStyle="fullScreen"
  >
    {visible && <PickerBody {...rest} />}
  </Modal>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },

  mapWrap: { flex: 1, position: 'relative' },
  hintOverlay: {
    position: 'absolute',
    top: Spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17,24,39,0.86)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  hintPillText: {
    color: Colors.white,
    fontSize: FontSize.xs,
    fontWeight: '700',
    writingDirection: 'rtl',
  },

  currentBtn: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.full,
    ...Shadow.medium,
  },
  currentBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },

  footer: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footerHint: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectedRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  selectedTextWrap: { flex: 1 },
  selectedCoords: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  selectedAddress: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
    ...Shadow.small,
  },
  confirmBtnDisabled: { backgroundColor: Colors.gray300 },
  confirmBtnText: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
});

export default WorksiteMapPicker;
