/**
 * ReceiptCaptureModule: camera permission, the document scanner and the
 * gallery pick behind "Scan receipt". Was 0 % covered (Fable audit task 137).
 */
const mockScan = jest.fn();
const mockPick = jest.fn();
jest.mock('react-native-document-scanner-plugin', () => ({ __esModule: true, default: { scanDocument: (...a: unknown[]) => mockScan(...a) } }));
jest.mock('react-native-image-picker', () => ({ launchImageLibrary: (...a: unknown[]) => mockPick(...a) }));

import { Platform, PermissionsAndroid } from 'react-native';
import ReceiptCaptureModule from '../ReceiptCaptureModule';

const fail = (error: string | null, cancelled: boolean) => ({ success: false, filePath: null, base64: null, error, cancelled });
const ok = (filePath: string) => ({ success: true, filePath, base64: null, error: null, cancelled: false });
let check: jest.SpyInstance;
let request: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED as any);
  mockScan.mockResolvedValue({ scannedImages: ['file:///data/scan1.jpg'], status: 'success' });
});
afterEach(() => jest.restoreAllMocks());

describe('permissions', () => {
  it('android asks for the camera and reports the answer', async () => {
    expect(await ReceiptCaptureModule.requestCameraPermission()).toBe(true);
    request.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED as any);
    expect(await ReceiptCaptureModule.requestCameraPermission()).toBe(false);
    request.mockRejectedValue(new Error('x'));
    expect(await ReceiptCaptureModule.requestCameraPermission()).toBe(false);
  });

  it('android check; a failing check is false', async () => {
    expect(await ReceiptCaptureModule.hasCameraPermission()).toBe(true);
    check.mockRejectedValue(new Error('x'));
    expect(await ReceiptCaptureModule.hasCameraPermission()).toBe(false);
  });

  it('iOS needs no prompt here', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    expect(await ReceiptCaptureModule.hasCameraPermission()).toBe(true);
    expect(await ReceiptCaptureModule.requestCameraPermission()).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });
});

describe('captureReceipt', () => {
  it('scans one page at quality 92 and strips file://', async () => {
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(ok('/data/scan1.jpg'));
    expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ maxNumDocuments: 1, croppedImageQuality: 92 }));
  });

  it('a content:// result is kept as it is', async () => {
    mockScan.mockResolvedValue({ scannedImages: ['content://media/1'], status: 'success' });
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(ok('content://media/1'));
  });

  it('no permission: asks; denied stops before the scanner', async () => {
    check.mockResolvedValue(false);
    request.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED as any);
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(fail('Camera permission denied', false));
    expect(mockScan).not.toHaveBeenCalled();
    request.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED as any);
    expect((await ReceiptCaptureModule.captureReceipt()).success).toBe(true);
  });

  it('cancel, or no pages: cancelled, no error', async () => {
    mockScan.mockResolvedValue({ scannedImages: ['file:///x.jpg'], status: 'cancel' });
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(fail(null, true));
    mockScan.mockResolvedValue({ scannedImages: [], status: 'success' });
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(fail(null, true));
    mockScan.mockResolvedValue({ status: 'success' });
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(fail(null, true));
  });

  it('a scanner error is returned as the message, or a default', async () => {
    mockScan.mockRejectedValueOnce(new Error('camera busy'));
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(fail('camera busy', false));
    mockScan.mockRejectedValueOnce({});
    expect(await ReceiptCaptureModule.captureReceipt()).toEqual(fail('Failed to capture receipt', false));
  });
});

describe('pickFromGallery', () => {
  it('one photo, capped at 4096 px, quality 0.9, file:// stripped', async () => {
    mockPick.mockResolvedValue({ assets: [{ uri: 'file:///pics/r.jpg' }] });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(ok('/pics/r.jpg'));
    expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 1, quality: 0.9, maxWidth: 4096, maxHeight: 4096, includeBase64: false }));
  });

  it('a non-file uri is kept', async () => {
    mockPick.mockResolvedValue({ assets: [{ uri: 'content://x' }] });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(ok('content://x'));
  });

  it('cancel, or nothing picked: cancelled', async () => {
    mockPick.mockResolvedValue({ didCancel: true });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail(null, true));
    mockPick.mockResolvedValue({ assets: [] });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail(null, true));
    mockPick.mockResolvedValue({ assets: [{}] });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail(null, true));
  });

  it('a picker error gives its message, else its code; a throw gives the message or a default', async () => {
    mockPick.mockResolvedValue({ errorCode: 'permission', errorMessage: 'No access' });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail('No access', false));
    mockPick.mockResolvedValue({ errorCode: 'others' });
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail('others', false));
    mockPick.mockRejectedValueOnce(new Error('boom'));
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail('boom', false));
    mockPick.mockRejectedValueOnce(null);
    expect(await ReceiptCaptureModule.pickFromGallery()).toEqual(fail('Failed to pick image', false));
  });
});
