/**
 * A quick scan creates its list at Confirm (task 49). Two presses landing
 * before the screen re-renders (a double tap) must create one list, not two:
 * Skip on the match screen discards only the list it was given, so a second
 * one stayed on Home as an empty active list.
 */
import React from 'react';
import { act, create } from 'react-test-renderer';
import ReceiptCameraScreen from '../ReceiptCameraScreen';

// A cold run transforms the whole screen tree first; the default 5 s timed
// out on the first run of the full suite (ada #3761).
jest.setTimeout(30000);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: true })) },
}));
jest.mock('@react-navigation/native', () => {
  const route = { params: { autoAddAll: true } };
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() };
  return { useRoute: () => route, useNavigation: () => navigation };
});
jest.mock('../../../contexts/AlertContext', () => {
  const alert = { showAlert: jest.fn() };
  return { useAlert: () => alert };
});
jest.mock('../../../contexts/UserContext', () => {
  const user = { uid: 'user-1', familyGroupId: 'fam-1' };
  return { useUser: () => user };
});
jest.mock('../../../contexts/AdMobContext', () => {
  const ads = { shouldShowAds: false, showRewarded: jest.fn() };
  return { useAdMob: () => ads };
});
jest.mock('../../../contexts/RevenueCatContext', () => ({ useRevenueCat: () => ({ tier: 'premium' }) }));
jest.mock('../../../services/ReceiptCaptureModule', () => ({
  __esModule: true,
  default: { captureReceipt: jest.fn(async () => ({ success: true, filePath: '/cache/r.jpg' })) },
}));
jest.mock('../../../services/ReceiptOCRService', () => ({
  __esModule: true,
  default: {
    extractReceipt: jest.fn(async () => ({ success: true, receiptData: { lineItems: [], discounts: [] } })),
    listPatchFor: jest.fn(async () => ({})),
  },
}));
jest.mock('../../../services/ImageStorageManager', () => ({
  __esModule: true,
  default: { setListReceipt: jest.fn(async () => undefined), processUploadQueue: jest.fn(async () => undefined) },
}));
jest.mock('../../../services/CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn() } }));
jest.mock('../../../services/ShoppingListManager', () => ({
  __esModule: true,
  default: {
    getListById: jest.fn(),
    createListOptimistic: jest.fn(async () => ({ id: 'new-list' })),
  },
}));
jest.mock('../../../services/ocrHints', () => ({ buildOcrHints: jest.fn(async () => null) }));
jest.mock('../../../components/ReceiptPreviewOverlay', () => 'ReceiptPreviewOverlay');

const ShoppingListManager = jest.requireMock('../../../services/ShoppingListManager').default;
const navigation = jest.requireMock('@react-navigation/native').useNavigation();

test('a double tap on Confirm creates one quick-scan list and opens it once', async () => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ReceiptCameraScreen />);
  });
  const overlay = renderer.root.findByType('ReceiptPreviewOverlay' as any);
  expect(overlay.props.state).toBe('success');

  await act(async () => {
    // Both presses go to the same render's handler, as a fast double tap does.
    const confirm = overlay.props.onConfirm;
    await Promise.all([confirm(), confirm()]);
  });

  expect(ShoppingListManager.createListOptimistic).toHaveBeenCalledTimes(1);
  expect(navigation.replace).toHaveBeenCalledTimes(1);
  expect(navigation.replace).toHaveBeenCalledWith('ReceiptMatch', { listId: 'new-list', autoAddAll: true });
});

test('a scan started on a list asks the match screen to finish the trip (task 99)', async () => {
  const route = jest.requireMock('@react-navigation/native').useRoute();
  route.params = { listId: 'list-1', completeOnApply: true };
  navigation.replace.mockClear();
  ShoppingListManager.getListById.mockResolvedValue({ id: 'list-1', storeName: 'Tesco' });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<ReceiptCameraScreen />);
  });
  await act(async () => {
    await renderer.root.findByType('ReceiptPreviewOverlay' as any).props.onConfirm();
  });
  expect(navigation.replace).toHaveBeenCalledWith('ReceiptMatch', { listId: 'list-1', completeOnApply: true });
  expect(navigation.replace.mock.calls[0][1]).toHaveProperty('completeOnApply', true);
});
