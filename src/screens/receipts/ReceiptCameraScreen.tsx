import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Image,
  Text,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useRoute, useNavigation } from '@react-navigation/native';
import ReceiptCaptureModule from '../../services/ReceiptCaptureModule';
import ReceiptOCRService from '../../services/ReceiptOCRService';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import ReceiptPreviewOverlay from '../../components/ReceiptPreviewOverlay';
import { ReceiptData } from '../../models/types';

const ReceiptCameraScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const { listId } = route.params as { listId: string };

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    handleCapture();
  }, []);

  // Auto-trigger OCR when a fresh image is set or when the user retries.
  // retryToken lets us re-run OCR on the same image (network blip recovery)
  // without forcing a rescan that would discard a good photo.
  useEffect(() => {
    if (!capturedImage) return;

    let mounted = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setOcrState('loading');
    setReceiptData(null);
    setOcrError(null);

    ReceiptOCRService.extractReceipt(capturedImage, controller.signal)
      .then((result) => {
        if (!mounted) return;
        if (result.success && result.receiptData) {
          setReceiptData(result.receiptData);
          setOcrState('success');
        } else {
          setReceiptData(result.receiptData);
          setOcrError(result.error ?? 'Failed to parse receipt');
          setOcrState('error');
        }
      })
      .catch((e: any) => {
        if (!mounted) return;
        if (e.name === 'AbortError') return;
        setOcrError(e.message || 'Failed to process receipt');
        setOcrState('error');
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [capturedImage, retryToken]);

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
    if (!capturedImage || !receiptData || confirming) return;

    setConfirming(true);
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user || !user.familyGroupId) {
        throw new Error('User not authenticated');
      }

      // Single atomic write: receipt image + OCR data
      await ShoppingListManager.updateList(listId, {
        receiptUrl: capturedImage,
        receiptData,
      });

      (navigation as any).replace('ReceiptMatch', { listId });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  const handleRetake = () => {
    abortRef.current?.abort();
    setCapturedImage(null);
    setOcrState('idle');
    setReceiptData(null);
    setOcrError(null);
    handleCapture();
  };

  const handleRetryOCR = () => {
    if (!capturedImage) return;
    setRetryToken(t => t + 1);
  };

  const handlePickGallery = async () => {
    try {
      const result = await ReceiptCaptureModule.pickFromGallery();
      if (result.cancelled) return;

      if (!result.success || !result.filePath) {
        showAlert('Error', result.error || 'Failed to pick image', undefined, { icon: 'error' });
        return;
      }

      abortRef.current?.abort();
      setOcrState('idle');
      setReceiptData(null);
      setOcrError(null);
      setCapturedImage(result.filePath);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  return (
    <View style={styles.container}>
      {capturedImage ? (
        <>
          <Image
            source={{ uri: `file://${capturedImage}` }}
            style={styles.preview}
            resizeMode="contain"
          />
          <ReceiptPreviewOverlay
            state={confirming ? 'loading' : ocrState}
            receiptData={receiptData}
            error={ocrError}
            onConfirm={handleConfirm}
            onRetake={handleRetake}
            onRetryOCR={handleRetryOCR}
            onPickGallery={handlePickGallery}
          />
        </>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6EA8FE" />
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
