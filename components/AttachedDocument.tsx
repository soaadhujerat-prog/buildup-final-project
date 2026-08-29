import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { UploadedDocument } from '../types';
import { isImageDocument, formatFileSize } from './DocumentUploadField';

interface Props {
  doc?: UploadedDocument;
  /** Text shown when nothing is attached. */
  emptyLabel?: string;
}

const openDoc = async (uri: string) => {
  try {
    const ok = await Linking.canOpenURL(uri);
    if (!ok) throw new Error('cannot open');
    await Linking.openURL(uri);
  } catch {
    Alert.alert('לא ניתן לפתוח', 'לא ניתן לפתוח את הקובץ במכשיר זה.');
  }
};

/** Compact, READ-ONLY view of one UploadedDocument — an image thumbnail, a
 *  file chip, or a clear "not attached" state. Shared by every admin screen
 *  that surfaces documents a user attached (ID card, certificate scans), so
 *  the "missing document" state is always a tidy label and never broken UI. */
const AttachedDocument: React.FC<Props> = ({
  doc,
  emptyLabel = 'לא צורף מסמך',
}) => {
  if (!doc) {
    return (
      <View style={styles.emptyRow}>
        <Ionicons
          name="document-outline"
          size={16}
          color={Colors.textMuted}
        />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  if (isImageDocument(doc)) {
    return (
      <TouchableOpacity onPress={() => openDoc(doc.uri)} activeOpacity={0.85}>
        <Image
          source={{ uri: doc.uri }}
          style={styles.thumb}
          resizeMode="cover"
        />
        <Text style={styles.hint}>הקש לפתיחה</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => openDoc(doc.uri)}
      activeOpacity={0.85}
    >
      <View style={styles.fileIconWrap}>
        <Ionicons name="document-text" size={22} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fileName} numberOfLines={1}>
          {doc.fileName}
        </Text>
        {!!formatFileSize(doc.size) && (
          <Text style={styles.fileMeta}>{formatFileSize(doc.size)}</Text>
        )}
      </View>
      <Ionicons name="open-outline" size={18} color={Colors.primary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  emptyRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    writingDirection: 'rtl',
    fontStyle: 'italic',
  },
  thumb: {
    width: '100%',
    height: 140,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginTop: 4,
  },
  fileCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.sm,
  },
  fileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  fileMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    writingDirection: 'ltr',
    marginTop: 2,
  },
});

export default AttachedDocument;
