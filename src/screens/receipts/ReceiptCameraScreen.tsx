import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import ReceiptCaptureModule from '../../services/ReceiptCaptureModule';
import ImageStorageManager from '../../services/ImageStorageManager';
import ReceiptOCRProcessor from '../../services/ReceiptOCRProcessor';
import AuthenticationModule from '../../services/AuthenticationModule';

/**
 * ReceiptCameraScreen
 * Capture receipt photo with camera
 * Implements Req 5.1, 5.2, 5.3, 5.4, 5.6, 10.3, 10.4
 */
const ReceiptCameraScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
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
        Alert.alert('Error', result.error || 'Failed to capture receipt');
        navigation.goBack();
        return;
      }

      setCapturedImage(result.filePath);
    } catch (error: any) {
      Alert.alert('Error', error.message);
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

      // Upload to Firebase Storage
      const storagePath = await ImageStorageManager.uploadReceipt(
        capturedImage,
        listId,
        user.familyGroupId,
        (progress) => setUploadProgress(progress)
      );

      // Process with OCR
      const ocrResult = await ReceiptOCRProcessor.processReceipt(storagePath, listId);

      if (ocrResult.success) {
        Alert.alert('Success', 'Receipt uploaded and processed successfully!');
      } else {
        Alert.alert(
          'Partial Success',
          'Receipt uploaded but OCR processing had low confidence. You can edit the data manually.'
        );
      }

      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message);
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
    backgroundColor: '#34C759',
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
