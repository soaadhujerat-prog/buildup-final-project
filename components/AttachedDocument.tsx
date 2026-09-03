import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Radius, FontSize } from '../theme/colors';
import { UploadedDocument } from '../types';
import { isImageDocument, formatFileSize } from './DocumentUploadField';
import { openDocument } from '../utils/openDocument';
import {
  getSignedUrl,
  type PrivateBucket,
  SIGNED_URL_TTL,
} from '../services/storageService';

interface Props {
  doc?: UploadedDocument;
  /** Text shown when nothing is attached. */
  emptyLabel?: string;
  /** Private bucket the object lives in — used to mint a FRESH signed URL right
   *  before opening. Defaults to the bucket implied by `doc.type`. */
  bucket?: PrivateBucket;
}

/** Which private bucket a document of each type lives in. */
const BUCKET_BY_TYPE: Record<UploadedDocument['type'], PrivateBucket> = {
  id_card: 'id-documents',
  certification: 'worker-certificates',
  contractor_license: 'contractor-licenses',
};

/** Compact, READ-ONLY view of one UploadedDocument — an image thumbnail, a
 *  file chip, or a clear "not attached" state. Shared by every admin screen
 *  that surfaces documents a user attached (ID card, certificate scans,
 *  contractor licence), so the "missing document" state is always a tidy
 *  label and never broken UI.
 *
 *  Opening: when the document has a stable `storagePath`, a fresh signed URL
 *  is minted immediately before the file is opened, so an open never fails
 *  merely because the URL handed to this screen has since expired. */
const AttachedDocument: React.FC<Props> = ({
  doc,
  emptyLabel = 'לא צורף מסמך',
  bucket,
}) => {
  const [opening, setOpening] = useState(false);

  if (!doc) {
    return (
      <View style={styles.emptyRow}>
        <Ionicons name="document-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const handleOpen = async () => {
    if (opening) return;
    setOpening(true);
    try {
      let url = doc.uri;
      const b = bucket ?? (doc.type ? BUCKET_BY_TYPE[doc.type] : undefined);
      if (doc.storagePath && b) {
        const fresh = await getSignedUrl(b, doc.storagePath, SIGNED_URL_TTL.document);
        if (fresh) url = fresh;
      }
      if (!url) {
        Alert.alert('פתיחת המסמך', 'לא ניתן להציג את המסמך במכשיר זה כרגע.');
        return;
      }
      await openDocument(url, doc.fileName);
    } finally {
      setOpening(false);
    }
  };

  if (isImageDocument(doc)) {
    return (
      <TouchableOpacity onPress={handleOpen} activeOpacity={0.85} disabled={opening}>
        <Image source={{ uri: doc.uri }} style={styles.thumb} resizeMode="cover" />
        <Text style={styles.hint}>{opening ? 'פותח…' : 'הקש לפתיחה'}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={handleOpen}
      activeOpacity={0.85}
      disabled={opening}
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
      {opening ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons name="open-outline" size={18} color={Colors.primary} />
      )}
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
