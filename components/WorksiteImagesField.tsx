import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';

interface Props {
  images: string[]; // local URIs — see JobPost.worksiteImages
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
  error?: string;
}

type SheetAction = 'camera' | 'gallery';

const TILE_SIZE = 92;

/** "תמונות מקום העבודה" — a separate entity from DocumentUploadField's ID
 *  card capture (public, multi-image, no verification purpose). Local URIs
 *  only for now; a future Supabase Storage migration swaps the URI list
 *  for storage paths without this component's API changing. */
const WorksiteImagesField: React.FC<Props> = ({
  images,
  onChange,
  max = 5,
  label = 'תמונות מקום העבודה',
  error,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<SheetAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const canAddMore = images.length < max;

  const openSheet = () => {
    if (!canAddMore) return;
    setNotice(null);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    if (busyAction) return;
    setSheetOpen(false);
  };

  const addImage = (uri: string) => {
    onChange([...images, uri]);
    setSheetOpen(false);
  };

  const removeImage = (uri: string) => {
    onChange(images.filter((u) => u !== uri));
  };

  const runCamera = async () => {
    setNotice(null);
    setBusyAction('camera');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        setNotice('לא ניתנה הרשאת מצלמה. אפשר לצרף תמונה מהגלריה במקום.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      addImage(result.assets[0].uri);
    } catch {
      setNotice('לא ניתן היה לפתוח את המצלמה. נסה שוב.');
    } finally {
      setBusyAction(null);
    }
  };

  const runGallery = async () => {
    setNotice(null);
    setBusyAction('gallery');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        setNotice('לא ניתנה הרשאת גישה לגלריה. אפשר לצלם עכשיו במקום.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, max - images.length),
      });
      if (result.canceled || !result.assets?.length) return;
      const remaining = Math.max(0, max - images.length);
      const picked = result.assets.slice(0, remaining).map((a) => a.uri);
      onChange([...images, ...picked]);
      setSheetOpen(false);
    } catch {
      setNotice('לא ניתן היה לפתוח את הגלריה. נסה שוב.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.countText}>
          {images.length}/{max}
        </Text>
      </View>

      <View style={styles.grid}>
        {images.map((uri) => (
          <View key={uri} style={styles.tile}>
            <TouchableOpacity onPress={() => setViewerUri(uri)} activeOpacity={0.85}>
              <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeBadge}
              onPress={() => removeImage(uri)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="הסר תמונה"
            >
              <Ionicons name="close" size={14} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ))}

        {canAddMore && (
          <TouchableOpacity style={styles.addTile} onPress={openSheet} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={26} color={Colors.textMuted} />
            <Text style={styles.addTileText}>הוסף תמונה</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* Full-screen preview */}
      <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerCloseBtn}
            onPress={() => setViewerUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="סגור"
          >
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
          {!!viewerUri && (
            <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {/* Action sheet */}
      <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={closeSheet}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                onPress={closeSheet}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="סגור"
                disabled={!!busyAction}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>הוספת תמונה</Text>
              <View style={{ width: 24 }} />
            </View>

            <SheetOption
              icon="camera"
              label="צלם תמונה"
              onPress={runCamera}
              busy={busyAction === 'camera'}
              disabled={!!busyAction}
            />
            <SheetOption
              icon="images"
              label="בחר מהגלריה"
              onPress={runGallery}
              busy={busyAction === 'gallery'}
              disabled={!!busyAction}
            />

            {!!notice && <Text style={styles.noticeText}>{notice}</Text>}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const SheetOption: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}> = ({ icon, label, onPress, busy, disabled }) => (
  <TouchableOpacity
    style={[styles.sheetRow, disabled && !busy && styles.sheetRowDisabled]}
    onPress={onPress}
    activeOpacity={0.75}
    disabled={disabled}
  >
    {busy ? (
      <ActivityIndicator size="small" color={Colors.primary} />
    ) : (
      <Ionicons name={icon} size={22} color={Colors.primary} />
    )}
    <Text style={styles.sheetRowText}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 8 },
  labelRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },
  countText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: { position: 'relative' },
  tileImage: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addTileText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    writingDirection: 'rtl',
  },

  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: Spacing.lg,
    zIndex: 1,
    padding: 6,
  },
  viewerImage: { width: '100%', height: '80%' },

  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.xl,
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
  sheetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray50,
  },
  sheetRowDisabled: { opacity: 0.5 },
  sheetRowText: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    writingDirection: 'rtl',
  },
  noticeText: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    fontSize: FontSize.xs,
    color: Colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
});

export default WorksiteImagesField;
