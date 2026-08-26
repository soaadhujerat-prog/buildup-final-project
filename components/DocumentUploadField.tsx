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
import * as DocumentPicker from 'expo-document-picker';

import { Colors, Spacing, Radius, FontSize, Shadow } from '../theme/colors';
import { UploadedDocument } from '../types';

interface Props {
  value: UploadedDocument | null | undefined;
  onChange: (doc: UploadedDocument | null) => void;
  label?: string;
  error?: string;
}

/** True when a document should be rendered as an image thumbnail rather
 *  than a generic file card — used here and by RegistrationDetailsScreen
 *  so both sides agree on the same rule. */
export const isImageDocument = (doc: UploadedDocument): boolean => {
  if (doc.mimeType) return doc.mimeType.startsWith('image/');
  return /\.(jpe?g|png|heic|heif|webp)$/i.test(doc.fileName);
};

export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type SheetAction = 'camera' | 'gallery' | 'document';

/** Shared "צילום / צירוף תעודת זהות" control — a tappable field that opens
 *  an action sheet (camera / gallery / PDF file), shows a preview of
 *  whatever was picked, and lets the user replace or remove it. Used by
 *  both the worker and contractor sign-up flows so document capture
 *  behaves identically for both roles. Never logs or persists file
 *  content — only the local URI + lightweight metadata are kept, ready to
 *  be swapped for a Supabase Storage reference later. */
const DocumentUploadField: React.FC<Props> = ({
  value,
  onChange,
  label = 'צילום / צירוף תעודת זהות',
  error,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<SheetAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const openSheet = () => {
    setNotice(null);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    if (busyAction) return;
    setSheetOpen(false);
  };

  const applyDocument = (doc: UploadedDocument) => {
    onChange(doc);
    setNotice(null);
    setSheetOpen(false);
  };

  const removeDocument = () => onChange(null);

  const runCamera = async () => {
    setNotice(null);
    setBusyAction('camera');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        setNotice('לא ניתנה הרשאת מצלמה. אפשר לצרף תמונה מהגלריה או קובץ PDF במקום.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      applyDocument({
        uri: asset.uri,
        fileName: asset.fileName || `id-card-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize,
        type: 'id_card',
      });
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
        setNotice('לא ניתנה הרשאת גישה לגלריה. אפשר לצלם עכשיו או לצרף קובץ PDF במקום.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      applyDocument({
        uri: asset.uri,
        fileName: asset.fileName || `id-card-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize,
        type: 'id_card',
      });
    } catch {
      setNotice('לא ניתן היה לפתוח את הגלריה. נסה שוב.');
    } finally {
      setBusyAction(null);
    }
  };

  const runDocumentPicker = async () => {
    setNotice(null);
    setBusyAction('document');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      applyDocument({
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
        type: 'id_card',
      });
    } catch {
      setNotice('לא ניתן היה לבחור קובץ. נסה שוב.');
    } finally {
      setBusyAction(null);
    }
  };

  const isImage = value ? isImageDocument(value) : false;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
      </View>

      {!value ? (
        <TouchableOpacity style={styles.emptyCard} onPress={openSheet} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={30} color={Colors.textMuted} />
          <Text style={styles.emptyText}>{label}</Text>
          <Text style={styles.emptyHint}>לחץ להוספה — צילום, גלריה או קובץ PDF</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.previewCard, error && styles.previewCardError]}>
          {isImage ? (
            <TouchableOpacity onPress={() => setViewerOpen(true)} activeOpacity={0.85}>
              <Image source={{ uri: value.uri }} style={styles.thumb} resizeMode="cover" />
            </TouchableOpacity>
          ) : (
            <View style={styles.fileIconWrap}>
              <Ionicons name="document-text" size={28} color={Colors.primary} />
            </View>
          )}
          <View style={styles.previewInfo}>
            <Text style={styles.previewName} numberOfLines={1}>
              {value.fileName}
            </Text>
            {!!formatFileSize(value.size) && (
              <Text style={styles.previewMeta}>{formatFileSize(value.size)}</Text>
            )}
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity onPress={openSheet} style={styles.previewActionBtn} activeOpacity={0.8}>
              <Ionicons name="repeat" size={16} color={Colors.primary} />
              <Text style={styles.previewActionText}>החלף</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={removeDocument} style={styles.previewActionBtn} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={[styles.previewActionText, { color: Colors.danger }]}>הסר</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* Full-screen preview for images */}
      {value && isImage && (
        <Modal visible={viewerOpen} animationType="fade" transparent onRequestClose={() => setViewerOpen(false)}>
          <View style={styles.viewerBackdrop}>
            <TouchableOpacity
              style={styles.viewerCloseBtn}
              onPress={() => setViewerOpen(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="סגור"
            >
              <Ionicons name="close" size={28} color={Colors.white} />
            </TouchableOpacity>
            <Image source={{ uri: value.uri }} style={styles.viewerImage} resizeMode="contain" />
          </View>
        </Modal>
      )}

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
              <Text style={styles.sheetTitle}>הוספת תעודת זהות</Text>
              <View style={styles.sheetHeaderSpacer} />
            </View>

            <SheetOption
              icon="camera"
              label="צלם עכשיו"
              onPress={runCamera}
              busy={busyAction === 'camera'}
              disabled={!!busyAction}
            />
            <SheetOption
              icon="images"
              label="בחר תמונה מהגלריה"
              onPress={runGallery}
              busy={busyAction === 'gallery'}
              disabled={!!busyAction}
            />
            <SheetOption
              icon="document-attach"
              label="צרף קובץ PDF"
              onPress={runDocumentPicker}
              busy={busyAction === 'document'}
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
  wrap: { width: '100%', gap: 6 },
  labelRow: { width: '100%', alignItems: 'flex-end' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    writingDirection: 'rtl',
  },

  emptyCard: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.gray50,
  },
  emptyText: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textSecondary,
    writingDirection: 'rtl',
    marginTop: 4,
  },
  emptyHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    textAlign: 'center',
  },

  previewCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    padding: Spacing.sm,
  },
  previewCardError: { borderColor: Colors.danger },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
  },
  fileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: { flex: 1, gap: 2 },
  previewName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  previewMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
  },
  previewActions: { gap: 6, alignItems: 'flex-end' },
  previewActionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  previewActionText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
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
  sheetHeaderSpacer: { width: 24 },

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

export default DocumentUploadField;
