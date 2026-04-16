import { Platform, PermissionsAndroid } from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { launchImageLibrary } from 'react-native-image-picker';
import { CaptureResult } from '../models/types';

/**
 * JPEG quality for captured receipts. Thermal print is pixel-sensitive —
 * aggressive compression erodes dim characters that the OCR parser needs.
 * 92 is a deliberate tradeoff: ~30% larger upload than 85, measurably
 * better OCR on faded Lidl/Aldi receipts per the server-side contrast work.
 */
const CAPTURE_JPEG_QUALITY = 92;

class ReceiptCaptureModule {
  async requestCameraPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Family Shopping List needs access to your camera to capture receipts',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true;
    } catch {
      return false;
    }
  }

  async hasCameraPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Capture receipt via the native document scanner (with boundary detection).
   */
  async captureReceipt(): Promise<CaptureResult> {
    try {
      const hasPermission = await this.hasCameraPermission();
      if (!hasPermission) {
        const granted = await this.requestCameraPermission();
        if (!granted) {
          return {
            success: false,
            filePath: null,
            base64: null,
            error: 'Camera permission denied',
            cancelled: false,
          };
        }
      }

      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        responseType: 'imageFilePath' as any,
        croppedImageQuality: CAPTURE_JPEG_QUALITY,
      });

      // Status enum string value is 'cancel' — see ScanDocumentResponseStatus
      // in the plugin's NativeDocumentScanner types. Keeping as a string literal
      // because the enum isn't re-exported from the package root.
      if (status && String(status) === 'cancel') {
        return { success: false, filePath: null, base64: null, error: null, cancelled: true };
      }

      if (!scannedImages || scannedImages.length === 0) {
        return { success: false, filePath: null, base64: null, error: null, cancelled: true };
      }

      return {
        success: true,
        filePath: scannedImages[0],
        base64: null,
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      return {
        success: false,
        filePath: null,
        base64: null,
        error: error?.message || 'Failed to capture receipt',
        cancelled: false,
      };
    }
  }

  /**
   * Pick an existing receipt photo from the gallery. Escape hatch for when
   * the scanner fails to detect boundaries on creased/curled receipts or
   * when the user took the photo before opening the app.
   */
  async pickFromGallery(): Promise<CaptureResult> {
    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        // react-native-image-picker quantises quality to 0.1 steps.
        // 0.9 is the closest match to the scanner's JPEG quality (92).
        quality: 0.9,
        includeBase64: false,
      });

      if (response.didCancel) {
        return { success: false, filePath: null, base64: null, error: null, cancelled: true };
      }

      if (response.errorCode) {
        return {
          success: false,
          filePath: null,
          base64: null,
          error: response.errorMessage || response.errorCode,
          cancelled: false,
        };
      }

      const asset = response.assets?.[0];
      if (!asset?.uri) {
        return { success: false, filePath: null, base64: null, error: null, cancelled: true };
      }

      // react-native-image-picker returns file:// URIs on both platforms;
      // strip the scheme so the OCR service's existing file:// prefix logic works.
      const path = asset.uri.startsWith('file://') ? asset.uri.slice(7) : asset.uri;

      return {
        success: true,
        filePath: path,
        base64: null,
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      return {
        success: false,
        filePath: null,
        base64: null,
        error: error?.message || 'Failed to pick image',
        cancelled: false,
      };
    }
  }
}

export default new ReceiptCaptureModule();
