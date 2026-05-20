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
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { ListsStackParamList } from '../../types/navigation';
import ReceiptCaptureModule from '../../services/ReceiptCaptureModule';
import ReceiptOCRService from '../../services/ReceiptOCRService';
import ShoppingListManager from '../../services/ShoppingListManager';
import AuthenticationModule from '../../services/AuthenticationModule';
import ReceiptPreviewOverlay from '../../components/ReceiptPreviewOverlay';
import { OCRResult } from '../../models/types';
import { useAdMob } from '../../contexts/AdMobContext';
import { useRevenueCat } from '../../contexts/RevenueCatContext';

const ReceiptCameraScreen = () => {
  const route = useRoute<RouteProp<ListsStackParamList, 'ReceiptCamera'>>();
  const navigation = useNavigation<StackNavigationProp<ListsStackParamList>>();
  const { showAlert } = useAlert();
  const { listId } = route.params;

  const { shouldShowAds, showRewarded } = useAdMob();
  const { tier } = useRevenueCat();

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [adGatePassed, setAdGatePassed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    handleCapture();
  }, []);

  // Reset the gate each time a new image is captured so every retake requires a fresh ad.
  useEffect(() => {
    setAdGatePassed(false);
  }, [capturedImage]);

  // Ad gate: free users must earn a reward before OCR fires.
  useEffect(() => {
    if (adGatePassed || !capturedImage) return;
    if (tier !== 'free') {
      setAdGatePassed(true);
      return;
    }
    if (!shouldShowAds) {
      showAlert(
        'Upgrade Required',
        'Accept ads or upgrade to Premium to scan receipts.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
        { icon: 'warning' },
      );
      return;
    }
    const shown = showRewarded(
      () => { setAdGatePassed(true); },
      () => {
        showAlert(
          'Ad Skipped',
          'Watch the full ad to scan your receipt.',
          undefined,
          { icon: 'info' },
        );
      },
    );
    if (!shown) {
      showAlert(
        'Ad Not Ready',
        'Please wait a moment and try again.',
        undefined,
        { icon: 'info' },
      );
    }
  }, [adGatePassed, capturedImage, tier, shouldShowAds, showRewarded, showAlert, navigation]);

  // Auto-trigger OCR when a fresh image is set or when the user retries.
  // retryToken lets us re-run OCR on the same image (network blip recovery)
  // without forcing a rescan that would discard a good photo.
  useEffect(() => {
    if (!capturedImage || !adGatePassed) return;

    let mounted = true;
    const controller = new AbortController();
    abortRef.current = controller;

    setOcrState('loading');
    setOcrResult(null);
    setOcrError(null);

    ReceiptOCRService.extractReceipt(capturedImage, controller.signal)
      .then((result) => {
        if (!mounted) return;
        if (result.success && result.receiptData) {
          setOcrResult(result);
          setOcrState('success');
        } else {
          setOcrResult(result);
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
  }, [capturedImage, retryToken, adGatePassed]);

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
    if (!capturedImage || !ocrResult || confirming) return;

    setConfirming(true);
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user || !user.familyGroupId) {
        throw new Error('User not authenticated');
      }

      await ShoppingListManager.updateList(listId, {
        receiptUrl: capturedImage,
        receiptData: ocrResult.receiptData,
        totalAmount: ocrResult.totalAmount,
        merchantName: ocrResult.merchantName,
        purchaseDate: ocrResult.purchaseDate,
        currency: ocrResult.currency,
      });

      navigation.replace('ReceiptMatch', { listId });
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
    setOcrResult(null);
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
      setOcrResult(null);
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
            source={{ uri: capturedImage.startsWith('content://') ? capturedImage : `file://${capturedImage}` }}
            style={styles.preview}
            resizeMode="contain"
          />
          <ReceiptPreviewOverlay
            state={confirming ? 'loading' : ocrState}
            receiptData={ocrResult?.receiptData ?? null}
            totalAmount={ocrResult?.totalAmount}
            merchantName={ocrResult?.merchantName}
            purchaseDate={ocrResult?.purchaseDate}
            currency={ocrResult?.currency}
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
