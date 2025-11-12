import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import ImageStorageManager from '../../services/ImageStorageManager';
import ReceiptOCRProcessor from '../../services/ReceiptOCRProcessor';
import LocalStorageManager from '../../services/LocalStorageManager';
import { ReceiptData, ReceiptLineItem } from '../../models/types';

/**
 * ReceiptViewScreen
 * Display receipt image and extracted OCR data
 * Implements Req 5.7, 6.6, 8.4
 */
const ReceiptViewScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { listId } = route.params as { listId: string };

  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedData, setEditedData] = useState<ReceiptData | null>(null);

  useEffect(() => {
    loadReceiptData();
  }, []);

  const loadReceiptData = async () => {
    try {
      setLoading(true);

      const list = await LocalStorageManager.getList(listId);
      if (!list) {
        Alert.alert('Error', 'List not found');
        navigation.goBack();
        return;
      }

      // Get receipt image URL
      if (list.receiptUrl) {
        const url = await ImageStorageManager.getReceiptDownloadUrl(list.receiptUrl);
        setReceiptUrl(url);
      }

      // Get receipt data
      const data = await LocalStorageManager.getReceiptData(listId);
      setReceiptData(data);
      setEditedData(data);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryOCR = async () => {
    try {
      setRetrying(true);
      const result = await ReceiptOCRProcessor.retryFailedOCR(listId);

      if (result.success) {
        Alert.alert('Success', 'Receipt processed successfully!');
        await loadReceiptData();
      } else {
        Alert.alert(
          'Low Confidence',
          `OCR processing completed with ${result.confidence}% confidence. You can edit the data manually.`
        );
        await loadReceiptData();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setRetrying(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!editedData) return;

    try {
      await LocalStorageManager.saveReceiptData(listId, editedData);
      setReceiptData(editedData);
      setEditing(false);
      Alert.alert('Success', 'Receipt data updated');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleCancelEdits = () => {
    setEditedData(receiptData);
    setEditing(false);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  if (!receiptUrl) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No receipt available</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Receipt Image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: receiptUrl }}
          style={styles.receiptImage}
          resizeMode="contain"
        />
      </View>

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
            {retrying && <ActivityIndicator size="small" color="#007AFF" />}
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
                  {receiptData.merchantName || 'N/A'}
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
                  {receiptData.purchaseDate || 'N/A'}
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
                />
              ) : (
                <Text style={styles.totalValue}>
                  {receiptData.totalAmount
                    ? `$${receiptData.totalAmount.toFixed(2)}`
                    : 'N/A'}
                </Text>
              )}
            </View>

            {/* Line Items */}
            {receiptData.lineItems && receiptData.lineItems.length > 0 && (
              <View style={styles.lineItemsContainer}>
                <Text style={styles.sectionTitle}>Items</Text>
                {receiptData.lineItems.map((item, index) => (
                  <View key={index} style={styles.lineItem}>
                    <Text style={styles.itemDescription}>
                      {item.description}
                    </Text>
                    <Text style={styles.itemPrice}>
                      ${item.price.toFixed(2)}
                    </Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#a0a0a0',
  },
  emptyText: {
    fontSize: 16,
    color: '#a0a0a0',
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 20,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
    color: '#ffffff',
  },
  editButton: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  confidenceText: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  highConfidence: {
    color: '#34C759',
  },
  lowConfidence: {
    color: '#FF9500',
  },
  fieldRow: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 5,
  },
  value: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#30D158',
  },
  input: {
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  lineItemsContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  itemDescription: {
    flex: 1,
    fontSize: 14,
    color: '#ffffff',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#30D158',
  },
  extractedText: {
    fontSize: 12,
    color: '#6E6E73',
    marginTop: 15,
    fontStyle: 'italic',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  noDataText: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 15,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
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
    color: '#FFB340',
    marginBottom: 10,
  },
  editActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#a0a0a0',
  },
  saveButton: {
    flex: 1,
    padding: 15,
    backgroundColor: 'rgba(48, 209, 88, 0.8)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.3)',
    shadowColor: '#30D158',
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
