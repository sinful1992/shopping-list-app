import React, { useState, useEffect, useMemo } from 'react';
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
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';
import { sanitizeError } from '../../utils/sanitize';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { ListsStackParamList } from '../../types/navigation';
import ReceiptOCRService from '../../services/ReceiptOCRService';
import LocalStorageManager from '../../services/LocalStorageManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import { ReceiptData, ShoppingList } from '../../models/types';
import { useAdMob } from '../../contexts/AdMobContext';
import { useRevenueCat } from '../../contexts/RevenueCatContext';

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
  const [list, setList] = useState<ShoppingList | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedData, setEditedData] = useState<EditableReceipt | null>(null);
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    loadReceiptData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (fetchedList.receiptUrl) {
        const raw = fetchedList.receiptUrl;
        setReceiptUrl(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `file://${raw}`);
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
              showAlert('Error', 'Receipt image not found. It may have been deleted.', undefined, { icon: 'error' });
              setReceiptUrl(null);
            }}
          />
        </View>
      )}

      {/* OCR Data Section */}
      <View style={styles.dataContainer}>
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

            {/* Total Amount */}
            <View style={styles.fieldRow}>
              <Text style={styles.label}>Total:</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  value={editedData?.totalAmount?.toString() || ''}
                  onChangeText={(text) =>
                    setEditedData((prev) =>
                      prev
                        ? { ...prev, totalAmount: parseFloat(text) || null }
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

            {/* Line Items */}
            {receiptData.lineItems && receiptData.lineItems.length > 0 && (
              <View style={styles.lineItemsContainer}>
                <Text style={styles.sectionTitle}>Items ({receiptData.lineItems.length})</Text>
                {receiptData.lineItems.map((item, index) => (
                  <View key={index} style={styles.lineItem}>
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
                          placeholder="Item name"
                          placeholderTextColor={theme.text.tertiary}
                        />
                        <TextInput
                          style={[styles.input, styles.itemPriceInput]}
                          value={editedData?.lineItems[index]?.price?.toString() || ''}
                          onChangeText={(text) => {
                            setEditedData(prev => {
                              if (!prev) return null;
                              const updatedItems = [...prev.lineItems];
                              updatedItems[index] = { ...updatedItems[index], price: parseFloat(text) || 0 };
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
                        <Text style={styles.itemDescription}>
                          {item.description}
                        </Text>
                        <Text style={styles.itemPrice}>
                          {list?.currency || '£'}{item.price?.toFixed(2) || '0.00'}
                        </Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Extracted At */}
            <Text style={styles.extractedText}>
              Processed:{' '}
              {new Date(receiptData.extractedAt).toLocaleString()}
            </Text>

            {/* Low Confidence Warning */}
            {receiptData.confidence && receiptData.confidence < 70 && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningText}>
                  ⚠️ Low confidence OCR result. Please verify the data is
                  correct.
                </Text>
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
      </View>
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
  receiptImage: {
    width: '100%',
    height: 400,
  },
  dataContainer: {
    padding: 20,
    backgroundColor: theme.glass.subtle,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: 16,
    marginHorizontal: 10,
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
    fontSize: 16,
    color: theme.text.primary,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.accent.green,
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
  itemDescription: {
    flex: 1,
    fontSize: 14,
    color: theme.text.primary,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accent.green,
    minWidth: 60,
    textAlign: 'right',
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
    backgroundColor: theme.accent.blueLight,
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
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  warningContainer: {
    marginTop: 20,
    padding: 15,
    backgroundColor: 'rgba(255, 159, 10, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.3)',
  },
  warningText: {
    fontSize: 14,
    color: theme.accent.orange,
    marginBottom: 10,
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
    color: '#ffffff',
  },
});

export default ReceiptViewScreen;
