import { Alert, Linking, Platform, Share } from 'react-native';

/**
 * Open a picked / attached document (PDF, image, or — later — a remote URL)
 * for viewing, in a way that actually works on iOS.
 *
 * Root cause of the "לא ניתן לפתוח את הקובץ" bug: the previous code gated on
 * `Linking.canOpenURL(uri)`, which ALWAYS resolves to `false` for a local
 * `file://` URI on iOS. Both `expo-document-picker` (copyToCacheDirectory)
 * and the camera hand back `file:///.../Caches/...` URIs, so every non-image
 * / local document hit that gate and showed the alert.
 *
 * Behaviour now:
 *  - http(s) URL           → open directly (system browser / viewer).
 *  - local file on iOS     → the system document sheet (preview / open-in),
 *                            the standard RN way to view a local file with no
 *                            extra native viewer dependency.
 *  - local file on Android → direct open if the OS allows it, otherwise the
 *                            system sheet.
 *
 * Never uploads, copies or modifies the file.
 */
export const openDocument = async (
  uri: string,
  fileName?: string
): Promise<void> => {
  if (!uri) return;
  try {
    if (/^https?:\/\//i.test(uri)) {
      await Linking.openURL(uri);
      return;
    }

    if (Platform.OS === 'ios') {
      await Share.share(
        fileName ? { url: uri, title: fileName } : { url: uri }
      );
      return;
    }

    // Android
    const canOpen = await Linking.canOpenURL(uri).catch(() => false);
    if (canOpen) {
      await Linking.openURL(uri);
      return;
    }
    await Share.share({ url: uri, message: fileName ?? uri });
  } catch {
    Alert.alert(
      'פתיחת המסמך',
      'לא ניתן להציג את המסמך במכשיר זה כרגע.'
    );
  }
};
