import { Alert, Linking } from 'react-native';

/** Places a phone call via the OS dialer, only in direct response to an
 *  explicit user tap (never call this automatically). Checks the number
 *  exists and that the device can actually place calls before dialing, and
 *  surfaces a clear message instead of failing silently. */
export const callPhone = (phone?: string): void => {
  const trimmed = phone?.trim();
  if (!trimmed) {
    Alert.alert('אין מספר טלפון', 'לא נמצא מספר טלפון זמין ליצירת קשר.');
    return;
  }
  const url = `tel:${trimmed}`;
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert(
          'לא ניתן לבצע שיחה',
          'המכשיר הזה אינו תומך בחיוג ישיר. אפשר להעתיק את המספר ולהתקשר ידנית.'
        );
      }
    })
    .catch(() => {
      Alert.alert('שגיאה', 'לא ניתן היה לפתוח את חייגן המכשיר.');
    });
};
