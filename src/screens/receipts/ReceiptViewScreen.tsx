import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';
import { NUMERIC, RECEIPT_FONT } from '../../styles/theme';
import { sanitizeError, sanitizePrice } from '../../utils/sanitize';
import { isReceiptStoragePath, toFileUri } from '../../utils/uri';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { ListsStackParamList } from '../../types/navigation';
import ReceiptOCRService from '../../services/ReceiptOCRService';
import ImageStorageManager from '../../services/ImageStorageManager';
import LocalStorageManager from '../../services/LocalStorageManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import { ReceiptData, ShoppingList } from '../../models/types';
import { useAdMob } from '../../contexts/AdMobContext';
import { useRevenueCat } from '../../contexts/RevenueCatContext';
import { formatDateTime } from '../../utils/date';
import ReceiptCard, { ReceiptRule } from '../../components/ReceiptCard';

type EditableReceipt = ReceiptData & {
  merchantName: string | null;
  purchaseDate: string | null;
  totalAmount: number | null;
  currency: string | null;
};

/**
 * ReceiptViewScreen
 * Display receipt image and extracted OCR data
 * Implements Req 5.7, 6.6, 8.4
 */
const ReceiptViewScreen = () => {
  const route = useRoute<RouteProp<ListsStackParamList, 'ReceiptView'>>();
  const navigation = useNavigation<StackNavigationProp<ListsStackParamList>>();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const { listId } = route.params;

  const { shouldShowAds, showRewarded } = useAdMob();
  const { tier } = useRevenueCat();

  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  // The list's stored image path that already failed to load. The screen
  // reloads on every focus, and without this it would retry the dead path
  // and raise the same alert each time the user came back to it.
  const missingImageRef = useRef<string | null>(null);
  // The path the image on screen came from: the list's own, or this phone's
  // capture of a rescan that has not uploaded yet.
  const shownPathRef = useRef<string | null>(null);
  // Download URL per Storage path. The screen reloads on every focus, and an
  // uploaded image's URL does not change, so it is fetched once.
  const downloadUrlRef = useRef<{ path: string; url: string } | null>(null);
  const [list, setList] = useState<ShoppingList | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedData, setEditedData] = useState<EditableReceipt | null>(null);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const needsReviewCount = useMemo(
    () => receiptData?.lineItems.filter(item => item.needsReview).length ?? 0,
    [receiptData],
  );

  // Reloaded on every focus, not just mount: the match screen opened from
  // here can save corrected lines back into this receipt.
  useFocusEffect(
    useCallback(() => {
      loadReceiptData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const loadReceiptData = async () => {
    try {
      setLoading(true);

      const fetchedList = await LocalStorageManager.getList(listId);
      if (!fetchedList) {
        showAlert('Error', 'List not found', undefined, { icon: 'error' });
        navigation.goBack();
        return;
      }

      setList(fetchedList);

      // A rescan still uploading shows here as taken, not as the image it
      // replaces, which the rest of the family keeps seeing until then.
      const pending = await ImageStorageManager.pendingCapture(listId).catch(() => null);
      const pendingShown = !!pending && pending !== fetchedList.receiptUrl && pending !== missingImageRef.current;
      shownPathRef.current = pendingShown ? pending : fetchedList.receiptUrl;

      if (pendingShown) {
        setReceiptUrl(toFileUri(pending));
      } else if (fetchedList.receiptUrl && fetchedList.receiptUrl === missingImageRef.current) {
        setReceiptUrl(null);
      } else if (isReceiptStoragePath(fetchedList.receiptUrl)) {
        // Uploaded: a Cloud Storage path, loaded over the network.
        const path = fetchedList.receiptUrl;
        if (downloadUrlRef.current?.path !== path) {
          const url = await ImageStorageManager.getReceiptDownloadUrl(path).catch(() => null);
          downloadUrlRef.current = url ? { path, url } : null;
        }
        setReceiptUrl(downloadUrlRef.current?.url ?? null);
      } else if (fetchedList.receiptUrl) {
        setReceiptUrl(toFileUri(fetchedList.receiptUrl));
      }

      const data = await LocalStorageManager.getReceiptData(listId);
      setReceiptData(data);
      setEditedData(data ? {
        ...data,
        merchantName: fetchedList.merchantName,
        purchaseDate: fetchedList.purchaseDate,
        totalAmount: fetchedList.totalAmount,
        currency: fetchedList.currency,
      } : null);
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const performRetryOCR = async () => {
    try {
      setRetrying(true);
      const result = await ReceiptOCRService.retryOCR(listId);

      if (result.success) {
        showAlert('Success', 'Receipt processed successfully!', undefined, { icon: 'success' });
        await loadReceiptData();
      } else {
        showAlert(
          'Low Confidence',
          `OCR processing completed with ${result.confidence}% confidence. You can edit the data manually.`,
          undefined,
          { icon: 'warning' }
        );
        await loadReceiptData();
      }
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      setRetrying(false);
    }
  };

  const handleRetryOCR = () => {
    if (tier !== 'free') {
      performRetryOCR();
      return;
    }
    if (!shouldShowAds) {
      showAlert(
        'Upgrade Required',
        'Accept ads or upgrade to Premium to retry OCR.',
        undefined,
        { icon: 'warning' },
      );
      return;
    }
    const shown = showRewarded(
      () => { performRetryOCR(); },
      () => {
        showAlert(
          'Ad Skipped',
          'Watch the full ad to retry OCR.',
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
  };

  const handleSaveEdits = async () => {
    if (!editedData) return;

    try {
      const { merchantName, purchaseDate, totalAmount, currency, ...slimmedReceiptData } = editedData;
      await ShoppingListManager.updateList(listId, {
        receiptData: slimmedReceiptData,
        merchantName,
        purchaseDate,
        totalAmount,
        currency,
      });
      setReceiptData(slimmedReceiptData);
      setList(prev => prev ? { ...prev, merchantName, purchaseDate, totalAmount, currency } : prev);
      setEditing(false);
      showAlert('Success', 'Receipt data updated', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleCancelEdits = () => {
    setEditedData(receiptData ? {
      ...receiptData,
      merchantName: list?.merchantName ?? null,
      purchaseDate: list?.purchaseDate ?? null,
      totalAmount: list?.totalAmount ?? null,
      currency: list?.currency ?? null,
    } : null);
    setEditing(false);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.accent.blue} />
        <Text style={styles.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Receipt Image Section */}
      {receiptUrl && (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: receiptUrl }}
            style={styles.receiptImage}
            resizeMode="contain"
            onError={() => {
              if (list && shownPathRef.current !== list.receiptUrl) {
                // This phone's pending capture is gone: show the list's own.
                missingImageRef.current = shownPathRef.current;
                loadReceiptData();
                return;
              }
              missingImageRef.current = list?.receiptUrl ?? null;
              // A path into a phone's cache that is not here is most often a
              // receipt another family member scanned and has not uploaded
              // yet, which is not an error worth an alert.
              if (isReceiptStoragePath(list?.receiptUrl)) {
                showAlert('Error', 'Receipt image not found. It may have been deleted.', undefined, { icon: 'error' });
              }
              setReceiptUrl(null);
            }}
          />
        </View>
      )}
      {!receiptUrl && !!list?.receiptUrl && list.receiptUrl === missingImageRef.current
        && !isReceiptStoragePath(list.receiptUrl) && (
        <Text style={styles.imageNote}>
          The photo of this receipt is not on this phone. It shows here once the phone that scanned it has uploaded it.
        </Text>
      )}

      {/* OCR Data Section — styled as the till receipt it came from */}
      <ReceiptCard>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Receipt Data</Text>
          {!editing && receiptData && (
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Text style={styles.editButton}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {!receiptData ? (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>
              {retrying
                ? 'Processing receipt...'
                : 'Receipt data not available'}
            </Text>
            {!retrying && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={handleRetryOCR}
              >
                <Text style={styles.retryButtonText}>Process Receipt</Text>
              </TouchableOpacity>
            )}
            {retrying && <ActivityIndicator size="small" color={theme.accent.blue} />}
          </View>
        ) : (
          <>
            {/* Confidence Score */}
            {receiptData.confidence && (
              <View style={styles.confidenceRow}>
                <Text style={styles.label}>Confidence:</Text>
                <Text
                  style={[
                    styles.confidenceText,
                    receiptData.confidence >= 70
                      ? styles.highConfidence
                      : styles.lowConfidence,
                  ]}
                >
                  {receiptData.confidence}%
                </Text>
              </View>
            )}

            {/* Merchant Name */}
            <View style={styles.fieldRow}>
              <Text style={styles.label}>Merchant:</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editedData?.merchantName || ''}
                  onChangeText={(text) =>
                    setEditedData((prev) =>
                      prev ? { ...prev, merchantName: text } : null
                    )
                  }
                  placeholder="Enter merchant name"
                />
              ) : (
                <Text style={styles.value}>
                  {list?.merchantName || 'N/A'}
                </Text>
              )}
            </View>

            {/* Purchase Date */}
            <View style={styles.fieldRow}>
              <Text style={styles.label}>Date:</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editedData?.purchaseDate || ''}
                  onChangeText={(text) =>
                    setEditedData((prev) =>
                      prev ? { ...prev, purchaseDate: text } : null
                    )
                  }
                  placeholder="MM/DD/YYYY"
                />
              ) : (
                <Text style={styles.value}>
                  {list?.purchaseDate || 'N/A'}
                </Text>
              )}
            </View>

            {/* Line Items */}
            {receiptData.lineItems && receiptData.lineItems.length > 0 && (
              <View style={styles.lineItemsContainer}>
                <Text style={styles.sectionTitle}>Items ({receiptData.lineItems.length})</Text>
                {receiptData.lineItems.map((item, index) => (
                  <View
                    key={index}
                    style={[styles.lineItem, item.needsReview && styles.lineItemNeedsReview]}
                  >
                    {editing ? (
                      <>
                        <TextInput
                          style={[styles.input, styles.itemDescInput]}
                          value={editedData?.lineItems[index]?.description || ''}
                          onChangeText={(text) => {
                            setEditedData(prev => {
                              if (!prev) return null;
                              const updatedItems = [...prev.lineItems];
                              updatedItems[index] = { ...updatedItems[index], description: text };
                              return { ...prev, lineItems: updatedItems };
                            });
                          }}
                          placeholder={item.needsReview ? 'Check this item' : 'Item name'}
                          placeholderTextColor={item.needsReview ? theme.accent.yellow : theme.text.tertiary}
                        />
                        <TextInput
                          style={[styles.input, styles.itemPriceInput]}
                          value={editedData?.lineItems[index]?.price?.toString() || ''}
                          onChangeText={(text) => {
                            setEditedData(prev => {
                              if (!prev) return null;
                              const updatedItems = [...prev.lineItems];
                              updatedItems[index] = { ...updatedItems[index], price: sanitizePrice(text) };
                              return { ...prev, lineItems: updatedItems };
                            });
                          }}
                          placeholder="0.00"
                          keyboardType="decimal-pad"
                          placeholderTextColor={theme.text.tertiary}
                        />
                      </>
                    ) : (
                      <>
                        <View style={styles.itemDescRow}>
                          {item.needsReview && (
                            <Icon name="alert-circle" size={12} color={theme.accent.orange} />
                          )}
                          <Text
                            style={[styles.itemDescription, item.needsReview && styles.itemTextNeedsReview]}
                          >
                            {item.description || '(check this item)'}
                          </Text>
                        </View>
                        <Text
                          style={[styles.itemPrice, item.needsReview && styles.itemTextNeedsReview]}
                        >
                          {list?.currency || '£'}{item.price?.toFixed(2) || '0.00'}
                        </Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Total — below the items behind a dashed rule, the way a
                till prints it */}
            <ReceiptRule />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              {editing ? (
                <TextInput
                  style={[styles.input, styles.itemPriceInput]}
                  value={editedData?.totalAmount?.toString() || ''}
                  onChangeText={(text) =>
                    setEditedData((prev) =>
                      prev
                        ? { ...prev, totalAmount: sanitizePrice(text) }
                        : null
                    )
                  }
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.text.tertiary}
                />
              ) : (
                <Text style={styles.totalValue}>
                  {list?.totalAmount
                    ? `${list.currency || '£'}${list.totalAmount.toFixed(2)}`
                    : 'N/A'}
                </Text>
              )}
            </View>

            {/* Items Needing Review */}
            {needsReviewCount > 0 && (
              <View style={styles.warningContainer}>
                <View style={styles.warningRow}>
                  <Icon name="alert-circle-outline" size={18} color={theme.accent.orange} />
                  <Text style={styles.warningText}>
                    Check the highlighted item{needsReviewCount > 1 ? 's' : ''} above — the
                    scanner wasn't sure about the description or price.
                  </Text>
                </View>
              </View>
            )}

            {/* Extracted At */}
            <Text style={styles.extractedText}>
              Processed:{' '}
              {formatDateTime(new Date(receiptData.extractedAt))}
            </Text>

            {/* Low Confidence Warning */}
            {receiptData.confidence && receiptData.confidence < 70 && (
              <View style={styles.warningContainer}>
                <View style={styles.warningRow}>
                  <Icon name="alert-circle-outline" size={18} color={theme.accent.orange} />
                  <Text style={styles.warningText}>
                    Low confidence OCR result. Please verify the data is
                    correct.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetryOCR}
                  disabled={retrying}
                >
                  <Text style={styles.retryButtonText}>
                    {retrying ? 'Processing...' : 'Retry OCR'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Edit Actions */}
            {editing && (
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelEdits}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveEdits}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ReceiptCard>

      {/* The match screen used to be reachable only straight after a scan;
          a skipped or half-done match could never be picked up again. */}
      {!editing && !!receiptData?.lineItems?.length && (
        <TouchableOpacity
          style={[styles.retryButton, styles.matchAgainButton]}
          onPress={() => navigation.navigate('ReceiptMatch', { listId })}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Match to list items</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: theme.text.secondary,
  },
  emptyText: {
    fontSize: 16,
    color: theme.text.secondary,
  },
  imageContainer: {
    backgroundColor: '#000',
    minHeight: 300,
  },
  imageNote: {
    fontSize: 14,
    color: theme.text.secondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  receiptImage: {
    width: '100%',
    height: 400,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.text.primary,
  },
  editButton: {
    fontSize: 16,
    color: theme.accent.blue,
    fontWeight: '600',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  confidenceText: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  highConfidence: {
    color: theme.accent.green,
  },
  lowConfidence: {
    color: theme.accent.orange,
  },
  fieldRow: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    color: theme.text.secondary,
    marginBottom: 5,
  },
  value: {
    fontSize: 14,
    color: theme.text.primary,
    fontWeight: '600',
    fontFamily: RECEIPT_FONT,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
    letterSpacing: 1,
  },
  totalValue: {
    ...NUMERIC,
    fontSize: 20,
    fontWeight: '700',
    color: theme.accent.green,
    fontFamily: RECEIPT_FONT,
  },
  input: {
    fontSize: 16,
    color: theme.text.primary,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    borderRadius: 14,
    padding: 12,
    backgroundColor: theme.glass.subtle,
  },
  lineItemsContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.medium,
    gap: 10,
  },
  lineItemNeedsReview: {
    // Yellow, not orange: matches this app's own severity ladder
    // (BudgetAlertService: safe=green, warning=yellow, caution=orange,
    // danger=red). A single suspect field is a minor, one-tap fix — it
    // shouldn't outrank the orange "low confidence" banner for the whole
    // receipt a tier below it.
    backgroundColor: theme.accent.yellowSubtle,
    borderLeftWidth: 4, // matches BudgetScreen's alertCard left-accent pattern
    borderLeftColor: theme.accent.yellow,
    paddingLeft: 8,
    marginLeft: -8,
  },
  itemDescRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemDescription: {
    flex: 1,
    fontSize: 12,
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
  },
  itemTextNeedsReview: {
    color: theme.accent.yellow,
    fontWeight: '600',
  },
  itemPrice: {
    ...NUMERIC,
    fontSize: 12,
    fontWeight: '600',
    color: theme.accent.green,
    minWidth: 60,
    textAlign: 'right',
    fontFamily: RECEIPT_FONT,
  },
  itemDescInput: {
    flex: 1,
    marginBottom: 0,
  },
  itemPriceInput: {
    width: 80,
    marginBottom: 0,
    textAlign: 'right',
  },
  extractedText: {
    fontSize: 12,
    color: theme.text.tertiary,
    marginTop: 15,
    fontStyle: 'italic',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  noDataText: {
    fontSize: 16,
    color: theme.text.secondary,
    marginBottom: 15,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: theme.accent.blue,
    borderRadius: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
    shadowColor: theme.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  matchAgainButton: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 32,
  },
  retryButtonText: {
    color: theme.text.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  warningContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: theme.accent.orangeSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.accent.orangeDim,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: theme.accent.orange,
  },
  editActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 15,
    backgroundColor: theme.glass.subtle,
    borderRadius: 14,
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text.secondary,
  },
  saveButton: {
    flex: 1,
    padding: 15,
    backgroundColor: theme.accent.green,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.accent.greenDim,
    shadowColor: theme.accent.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text.onAccent,
  },
});

export default ReceiptViewScreen;
