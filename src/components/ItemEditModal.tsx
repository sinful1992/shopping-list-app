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
import { MeasurementService } from '../services/MeasurementService';
import PriceHistoryModal from './PriceHistoryModal';
import { useAlert } from '../contexts/AlertContext';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

const MEASUREMENT_UNITS = ['ml', 'L', 'g', 'kg'] as const;

interface ItemEditModalProps {
  visible: boolean;
  item: Item | null;
  onClose: () => void;
  onSave: (
    itemId: string,
    updates: { name?: string; price?: number | null; category?: string | null; measurementUnit?: string | null; measurementValue?: number | null },
    measurementChanged: boolean
  ) => Promise<void>;
  onDelete?: (itemId: string) => Promise<void>;
  focusField?: 'name' | 'price';
  priceOnly?: boolean;
}

const ItemEditModal: React.FC<ItemEditModalProps> = ({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
  focusField = 'name',
  priceOnly = false,
}) => {
  const { showAlert } = useAlert();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<CategoryType | null>(null);
  const [measurementUnit, setMeasurementUnit] = useState<string | null>(null);
  const [measurementValueText, setMeasurementValueText] = useState('');
  const [priceHistoryVisible, setPriceHistoryVisible] = useState(false);
  const priceInputRef = useRef<TextInput>(null);

  // Track original measurement values to detect explicit user changes
  const originalUnitRef = useRef<string | null>(null);
  const originalValueRef = useRef<number | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setPrice(item.price ? item.price.toString() : '');
      setCategory((item.category as CategoryType) || null);
      setMeasurementUnit(item.measurementUnit ?? null);
      setMeasurementValueText(item.measurementValue != null ? item.measurementValue.toString() : '');
      originalUnitRef.current = item.measurementUnit ?? null;
      originalValueRef.current = item.measurementValue ?? null;
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
      const measurementValue = measurementValueText.trim() ? parseFloat(measurementValueText) : null;
      const measurementChanged =
        measurementUnit !== originalUnitRef.current ||
        (measurementValue ?? null) !== originalValueRef.current;

      const updates = priceOnly
        ? { price: priceValue }
        : {
            name: name.trim(),
            price: priceValue,
            category: category,
            measurementUnit: measurementUnit,
            measurementValue: measurementValue,
          };
      await onSave(item.id, updates, measurementChanged);
      onClose();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save item', undefined, { icon: 'error' });
    }
  };

  const handleSave = async () => {
    if (!item) return;

    if (!priceOnly && !name.trim()) {
      showAlert('Error', 'Item name cannot be empty', undefined, { icon: 'error' });
      return;
    }

    const priceValue = price.trim() ? parseFloat(price) : null;
    if (price.trim() && (priceValue === null || isNaN(priceValue))) {
      showAlert('Error', 'Please enter a valid price', undefined, { icon: 'error' });
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
            <Text style={styles.title}>{priceOnly ? 'Set Price' : 'Edit Item'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {!priceOnly && (
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
            )}

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

            {!priceOnly && (
              <CategoryPicker
                selectedCategory={category}
                onSelectCategory={(newCategory) => {
                  setCategory(newCategory);
                  if (measurementUnit === null) {
                    const suggested = MeasurementService.getStaticDefault(name, newCategory);
                    if (suggested) {
                      setMeasurementUnit(suggested.unit);
                    }
                  }
                }}
              />
            )}

            {!priceOnly && (
              <View style={styles.measurementSection}>
                <Text style={styles.label}>Measurement</Text>
                <View style={styles.measurementPills}>
                  {MEASUREMENT_UNITS.map(unit => (
                    <TouchableOpacity
                      key={unit}
                      style={[styles.pill, measurementUnit === unit && styles.pillActive]}
                      onPress={() => setMeasurementUnit(measurementUnit === unit ? null : unit)}
                    >
                      <Text style={[styles.pillText, measurementUnit === unit && styles.pillTextActive]}>
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {measurementUnit && (
                    <TouchableOpacity
                      style={styles.pillClear}
                      onPress={() => {
                        setMeasurementUnit(null);
                        setMeasurementValueText('');
                      }}
                    >
                      <Text style={styles.pillClearText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {measurementUnit && (
                  <TextInput
                    style={[styles.input, styles.measurementInput]}
                    value={measurementValueText}
                    onChangeText={setMeasurementValueText}
                    placeholder={`Amount in ${measurementUnit} (optional)`}
                    placeholderTextColor={COLORS.text.tertiary}
                    keyboardType="numeric"
                  />
                )}
              </View>
            )}

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
            {onDelete && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDelete}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            )}

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
  measurementSection: {
    marginBottom: SPACING.xl,
  },
  measurementPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    backgroundColor: 'transparent',
  },
  pillActive: {
    borderColor: COLORS.accent.blue,
    backgroundColor: COLORS.accent.blueSubtle,
  },
  pillText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  pillTextActive: {
    color: COLORS.accent.blue,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  pillClear: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  pillClearText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.tertiary,
  },
  measurementInput: {
    marginTop: SPACING.sm,
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
});

export default ItemEditModal;
