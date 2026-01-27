import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Item } from '../models/types';
import CategoryPicker from './CategoryPicker';
import { CategoryType } from '../services/CategoryService';
import PriceHistoryModal from './PriceHistoryModal';
import { useAlert } from '../contexts/AlertContext';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

interface ItemEditModalProps {
  visible: boolean;
  item: Item | null;
  storeName?: string | null;
  onRequestStoreSelection?: () => void;
  onClose: () => void;
  onSave: (itemId: string, updates: { name?: string; price?: number | null; category?: string | null }) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
  focusField?: 'name' | 'price';
}

const ItemEditModal: React.FC<ItemEditModalProps> = ({
  visible,
  item,
  storeName,
  onRequestStoreSelection,
  onClose,
  onSave,
  onDelete,
  focusField = 'name',
}) => {
  const { showAlert } = useAlert();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<CategoryType | null>(null);
  const [priceHistoryVisible, setPriceHistoryVisible] = useState(false);
  const priceInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setPrice(item.price ? item.price.toString() : '');
      setCategory((item.category as CategoryType) || null);
    }
  }, [item]);

  // Focus the correct field when modal opens
  useEffect(() => {
    if (visible && focusField === 'price') {
      const timeoutId = setTimeout(() => priceInputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible, focusField]);

  const performSave = async (priceValue: number | null) => {
    if (!item) return;
    try {
      await onSave(item.id, {
        name: name.trim(),
        price: priceValue,
        category: category,
      });
      onClose();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save item', undefined, { icon: 'error' });
    }
  };

  const handleSave = async () => {
    if (!item) return;

    if (!name.trim()) {
      showAlert('Error', 'Item name cannot be empty', undefined, { icon: 'error' });
      return;
    }

    const priceValue = price.trim() ? parseFloat(price) : null;
    if (price.trim() && (priceValue === null || isNaN(priceValue))) {
      showAlert('Error', 'Please enter a valid price', undefined, { icon: 'error' });
      return;
    }

    // Check if entering price without store selected
    if (priceValue && priceValue > 0 && !storeName) {
      showAlert(
        'Store Required',
        'Please select a store before entering prices. This helps track price history accurately.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Select Store',
            onPress: () => {
              onClose();
              onRequestStoreSelection?.();
            },
          },
          {
            text: 'Save Anyway',
            style: 'destructive',
            onPress: () => performSave(priceValue),
          },
        ],
        { icon: 'warning' }
      );
      return;
    }

    await performSave(priceValue);
  };

  const handleDelete = () => {
    if (!item) return;

    showAlert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await onDelete(item.id);
              onClose();
            } catch (error: any) {
              showAlert('Error', error.message || 'Failed to delete item', undefined, { icon: 'error' });
            }
          },
        },
      ],
      { icon: 'confirm' }
    );
  };

  if (!item) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit Item</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {!storeName && (
              <View style={styles.storeWarningBanner}>
                <Text style={styles.storeWarningText}>
                  No store selected. Prices won't be tracked in history.
                </Text>
                {onRequestStoreSelection && (
                  <TouchableOpacity
                    style={styles.selectStoreLink}
                    onPress={() => {
                      onClose();
                      onRequestStoreSelection();
                    }}
                  >
                    <Text style={styles.selectStoreLinkText}>Select Store</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Item name"
                placeholderTextColor={COLORS.text.tertiary}
                autoFocus={focusField === 'name'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Price</Text>
              <TextInput
                ref={priceInputRef}
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                placeholder="£0.00"
                placeholderTextColor={COLORS.text.tertiary}
                keyboardType="numeric"
              />
            </View>

            <CategoryPicker
              selectedCategory={category}
              onSelectCategory={setCategory}
            />

            {/* Price History Button */}
            <TouchableOpacity
              style={styles.priceHistoryButton}
              onPress={() => setPriceHistoryVisible(true)}
            >
              <Text style={styles.priceHistoryIcon}>📊</Text>
              <Text style={styles.priceHistoryText}>View Price History</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Price History Modal */}
        <PriceHistoryModal
          visible={priceHistoryVisible}
          itemName={item?.name || ''}
          onClose={() => setPriceHistoryVisible(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay.dark,
  },
  modal: {
    ...COMMON_STYLES.modal,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.medium,
  },
  title: {
    ...COMMON_STYLES.sectionHeader,
    marginBottom: 0,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: 24,
    color: COLORS.text.tertiary,
    fontWeight: '300',
  },
  content: {
    padding: SPACING.xl,
  },
  inputGroup: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  input: {
    ...COMMON_STYLES.input,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.medium,
  },
  deleteButton: {
    backgroundColor: COLORS.accent.redSubtle,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.accent.redDim,
  },
  deleteButtonText: {
    color: COLORS.accent.red,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  cancelButton: {
    ...COMMON_STYLES.button,
    marginRight: SPACING.md,
  },
  cancelButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  saveButton: {
    ...COMMON_STYLES.buttonActive,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  saveButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  priceHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent.blueSubtle,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.accent.blueDim,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  priceHistoryIcon: {
    fontSize: TYPOGRAPHY.fontSize.xl,
  },
  priceHistoryText: {
    color: COLORS.accent.blue,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  storeWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent.yellowSubtle,
    padding: SPACING.md,
    borderRadius: RADIUS.small,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accent.yellowDim,
  },
  storeWarningText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.accent.yellow,
  },
  selectStoreLink: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },
  selectStoreLinkText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.accent.blue,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    textDecorationLine: 'underline',
  },
});

export default ItemEditModal;
