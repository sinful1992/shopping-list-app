import { notificationToDeepLink } from '../notificationDeepLink';
import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

const msg = (data: Record<string, string> | undefined) =>
  ({ data } as unknown as FirebaseMessagingTypes.RemoteMessage);

const LIST_ID = '4f9a2c1e-8b3d-4e5f-9a1b-2c3d4e5f6a7b';

describe('notificationToDeepLink', () => {
  it('returns null for a null message', () => {
    expect(notificationToDeepLink(null)).toBeNull();
  });

  it('returns null for a message without data', () => {
    expect(notificationToDeepLink(msg(undefined))).toBeNull();
  });

  it('returns null for an unknown type', () => {
    expect(notificationToDeepLink(msg({ type: 'something_else' }))).toBeNull();
  });

  it('maps urgent_item to the urgent tab', () => {
    expect(notificationToDeepLink(msg({ type: 'urgent_item' }))).toBe(
      'familyshoppinglist://urgent'
    );
  });

  it('maps receipt_scanned to the completed list in History', () => {
    expect(notificationToDeepLink(msg({ type: 'receipt_scanned', listId: LIST_ID }))).toBe(
      `familyshoppinglist://history/${LIST_ID}`
    );
  });

  it('rejects receipt_scanned without a listId', () => {
    expect(notificationToDeepLink(msg({ type: 'receipt_scanned' }))).toBeNull();
  });

  it('rejects receipt_scanned with a non-UUID listId', () => {
    expect(
      notificationToDeepLink(msg({ type: 'receipt_scanned', listId: '../evil/path' }))
    ).toBeNull();
  });
});
