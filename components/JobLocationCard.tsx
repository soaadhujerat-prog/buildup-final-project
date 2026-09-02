import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface Props {
  city: string;
  address?: string;
  /** Exact worksite pin, when the contractor set one. */
  lat?: number | null;
  lon?: number | null;
}

/**
 * JobDetails "מיקום העבודה" block — city + address, an optional non-interactive
 * map preview of the exact worksite pin, and an "open in Google Maps" button.
 * Never shows or uses any worker location. The external link uses the job's
 * coordinate when available, otherwise a text search for its address/city.
 */
const JobLocationCard: React.FC<Props> = ({ city, address, lat, lon }) => {
  const hasPin = typeof lat === 'number' && typeof lon === 'number';

  const openInMaps = () => {
    const query = hasPin
      ? `${lat},${lon}`
      : encodeURIComponent(
          [address, city].filter((s) => !!s && s.trim().length > 0).join(', ') ||
            city
        );
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('לא ניתן לפתוח את המפה', 'לא נמצא יישום מפות זמין במכשיר.')
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>מיקום העבודה</Text>
      </View>

      <View style={styles.row}>
        <Ionicons name="business-outline" size={15} color={Colors.textSecondary} />
        <Text style={styles.rowText}>{city || 'לא צוינה עיר'}</Text>
      </View>
      {!!address && address.trim().length > 0 && (
        <View style={styles.row}>
          <Ionicons name="navigate-outline" size={15} color={Colors.textSecondary} />
          <Text style={styles.rowText}>{address}</Text>
        </View>
      )}

      {hasPin && (
        <TouchableOpacity
          style={styles.mapPreview}
          activeOpacity={0.9}
          onPress={openInMaps}
        >
          <MapView
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            initialRegion={{
              latitude: lat as number,
              longitude: lon as number,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            <Marker coordinate={{ latitude: lat as number, longitude: lon as number }} />
          </MapView>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.mapsBtn} onPress={openInMaps} activeOpacity={0.85}>
        <Ionicons name="map-outline" size={16} color={Colors.primary} />
        <Text style={styles.mapsBtnText}>פתח ב-Google Maps</Text>
      </TouchableOpacity>

      {!hasPin && (
        <Text style={styles.noPinHint}>
          לא סומן מיקום מדויק — הכפתור יפתח את המפה לפי העיר והכתובת.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionHead: { flexDirection: 'row-reverse', alignItems: 'center' },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '800',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  rowText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapPreview: {
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 2,
  },
  mapsBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 11,
  },
  mapsBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.primary,
    writingDirection: 'rtl',
  },
  noPinHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});

export default JobLocationCard;
