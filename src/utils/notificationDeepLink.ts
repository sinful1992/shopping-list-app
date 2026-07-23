import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

// List ids are client-generated UUIDs (see ListDetailScreen's route guard);
// anything else in the payload is dropped rather than fed into navigation.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map an FCM message to a deep-link path, or null if it shouldn't navigate.
export function notificationToDeepLink(message: FirebaseMessagingTypes.RemoteMessage | null): string | null {
  const data = message?.data;
  if (data?.type === 'urgent_item') {
    return 'familyshoppinglist://urgent';
  }
  if (data?.type === 'receipt_scanned') {
    const listId = data.listId;
    if (typeof listId === 'string' && UUID_REGEX.test(listId)) {
      return `familyshoppinglist://history/${listId}`;
    }
  }
  return null;
}
