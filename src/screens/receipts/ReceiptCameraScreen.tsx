import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useRoute, useNavigation } from '@react-navigation/native';
import ReceiptCaptureModule from '../../services/ReceiptCaptureModule';
import ReceiptOCRService from '../../services/ReceiptOCRService';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';

/**
 * ReceiptCameraScreen
 * Capture receipt photo with camera
 * Implements Req 5.1, 5.2, 5.3, 5.4, 5.6, 10.3, 10.4
 */
const ReceiptCameraScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const { listId } = route.params as { listId: string };

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    // Auto-open camera on mount
    handleCapture();
  }, []);

  const handleCapture = async () => {
    try {
      const result = await ReceiptCaptureModule.captureReceipt();

      if (result.cancelled) {
        navigation.goBack();
        return;
      }

      if (!result.success || !result.filePath) {
        showAlert('Error', result.error || 'Failed to capture receipt', undefined, { icon: 'error' });
        navigation.goBack();
        return;
      }

      setCapturedImage(result.filePath);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      navigation.goBack();
    }
  };

  const handleConfirm = async () => {
    if (!capturedImage) return;

    setUploading(true);

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user || !user.familyGroupId) {
        throw new Error('User not authenticated');
      }

      // Save receipt image path to list
      await ShoppingListManager.updateList(listId, {
        receiptUrl: capturedImage,
      });

      // Send to OCR server
      const serverUrl = await ReceiptOCRService.getServerUrl();
      if (serverUrl) {
        setUploadProgress(30);
        const result = await ReceiptOCRService.processReceipt(capturedImage, listId);
        setUploadProgress(100);

        if (result.success) {
          showAlert('Success', 'Receipt processed successfully!', undefined, { icon: 'success' });
        } else if (result.receiptData) {
          showAlert('Processed', result.error || 'Low confidence - you can edit the data', undefined, { icon: 'warning' });
        } else {
          showAlert('Saved', result.error || 'OCR failed - photo saved, you can retry later', undefined, { icon: 'warning' });
        }
      } else {
        showAlert('Saved', 'Receipt photo saved. Set up OCR server in Settings to extract data.', undefined, { icon: 'success' });
      }

      navigation.goBack();
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    handleCapture();
  };

  return (
    <View style={styles.container}>
      {capturedImage ? (
        <>
          <Image source={{ uri: `file://${capturedImage}` }} style={styles.preview} resizeMode="contain" />

          {uploading ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.uploadingText}>
                Uploading... {Math.round(uploadProgress)}%
              </Text>
            </View>
          ) : (
            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Opening camera...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
    width: '100%',
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#000',
  },
  retakeButton: {
    flex: 1,
    padding: 15,
    backgroundColor: '#666',
    borderRadius: 8,
    marginRight: 10,
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    padding: 15,
    backgroundColor: '#30D158',
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
});

export default ReceiptCameraScreen;
