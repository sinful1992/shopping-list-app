import { Platform, PermissionsAndroid, Alert } from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { CaptureResult } from '../models/types';

/**
 * ReceiptCaptureModule
 * Interfaces with device camera to capture receipt photos
 * Implements Requirements: 5.1, 5.2, 5.3, 10.3, 10.4
 */
class ReceiptCaptureModule {
  /**
   * Request camera permission
   * Implements Req 10.3, 10.4
   */
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
      } else {
        // iOS permissions are handled via Info.plist
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check if camera permission is granted
   */
  async hasCameraPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        return hasPermission;
      } else {
        // For iOS, assume permission is granted if app is running
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Capture receipt photo with automatic boundary detection
   * Implements Req 5.1, 5.2, 5.3
   */
  async captureReceipt(): Promise<CaptureResult> {
    try {
      // Check permission first
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

      // Scan document with automatic boundary detection
      const { scannedImages } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
        responseType: 'imageFilePath', // Get file path, not base64
        croppedImageQuality: 85, // 0-100 scale
      });

      if (!scannedImages || scannedImages.length === 0) {
        return {
          success: false,
          filePath: null,
          base64: null,
          error: null,
          cancelled: true,
        };
      }

      return {
        success: true,
        filePath: scannedImages[0],
        base64: null,
        error: null,
        cancelled: false,
      };
    } catch (error: any) {
      if (error.message && error.message.includes('cancel')) {
        return {
          success: false,
          filePath: null,
          base64: null,
          error: null,
          cancelled: true,
        };
      }

      return {
        success: false,
        filePath: null,
        base64: null,
        error: error.message || 'Failed to capture receipt',
        cancelled: false,
      };
    }
  }
}

export default new ReceiptCaptureModule();
