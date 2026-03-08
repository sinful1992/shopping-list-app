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
import LinearGradient from 'react-native-linear-gradient';
import { Item } from '../models/types';
import CategoryPicker from './CategoryPicker';
import { CategoryType } from '../services/CategoryService';
import MeasurementService from '../services/MeasurementService';
import PriceHistoryModal from './PriceHistoryModal';
import { useAlert } from '../contexts/AlertContext';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

const UNIT_GROUPS = [
  { label: 'Volume', units: ['ml', 'L'] as const, color: '#6EA8FE' },
  { label: 'Weight', units: ['g', 'kg'] as const, color: '#A78BFA' },
];

const ALL_UNITS = ['ml', 'L', 'g', 'kg'] as const;

function parseCombinedInput(text: string): { value: number; unit: string } | null {
  const match = text.trim().match(/^(\d+\.?\d*)\s*(ml|l|g|kg)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase() === 'l' ? 'L' : match[2].toLowerCase();
  return { value, unit };
}

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
  const [combinedInput, setCombinedInput] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
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
      // Pre-fill combined input if item has measurement
      if (item.measurementUnit && item.measurementValue != null) {
        setCombinedInput(`${item.measurementValue}${item.measurementUnit}`);
      } else {
        setCombinedInput('');
      }
      originalUnitRef.current = item.measurementUnit ?? null;
      originalValueRef.current = item.measurementValue ?? null;
      setSuggestion(null);
      setShowSuggestion(false);
    }
  }, [item]);

  // Focus the correct field when modal opens
  useEffect(() => {
    if (visible && focusField === 'price') {
      const timeoutId = setTimeout(() => priceInputRef.current?.focus(), 100);
      return () => clearTimeout(timeoutId);
    }
  }, [visible, focusField]);

  // Show suggestion when category or name changes and no unit is set
  useEffect(() => {
    if (!priceOnly && measurementUnit === null && (name || category)) {
      const staticDefault = MeasurementService.getStaticDefault(name, category);
      if (staticDefault) {
        const suggested = staticDefault.value != null
          ? `${staticDefault.value}${staticDefault.unit}`
          : staticDefault.unit;
        setSuggestion(suggested);
        setShowSuggestion(true);
      } else {
        setSuggestion(null);
        setShowSuggestion(false);
      }
    } else {
      setSuggestion(null);
      setShowSuggestion(false);
    }
  }, [name, category, measurementUnit, priceOnly]);

  const handleCombinedInputChange = (text: string) => {
    setCombinedInput(text);
    const parsed = parseCombinedInput(text);
    if (parsed) {
      setMeasurementUnit(parsed.unit);
      setMeasurementValueText(parsed.value.toString());
    } else if (text.trim() === '') {
      // Clear measurement if combined input is cleared
      setMeasurementUnit(null);
      setMeasurementValueText('');
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestion) return;
    const parsed = parseCombinedInput(suggestion);
    if (parsed) {
      setMeasurementUnit(parsed.unit);
      setMeasurementValueText(parsed.value.toString());
      setCombinedInput(suggestion);
    } else {
      // Unit-only suggestion
      setMeasurementUnit(suggestion);
      setCombinedInput(suggestion);
    }
    setShowSuggestion(false);
    setSuggestion(null);
  };

  const handleDismissSuggestion = () => {
    setShowSuggestion(false);
    setSuggestion(null);
  };

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
        <LinearGradient
          colors={['#1E1E2E', '#181825']}
          style={styles.modal}
        >
          {/* Handle bar */}
          <View style={COMMON_STYLES.modalHandleContainer}>
            <View style={COMMON_STYLES.modalHandle} />
          </View>

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

                {/* Combined input field */}
                <View style={styles.combinedInputRow}>
                  <TextInput
                    style={[styles.input, styles.combinedInput]}
                    value={combinedInput}
                    onChangeText={handleCombinedInputChange}
                    placeholder='e.g. 500ml, 2.5kg'
                    placeholderTextColor={COLORS.text.tertiary}
                    autoCapitalize="none"
                  />
                  {measurementUnit && (
                    <View style={[
                      styles.unitBadge,
                      UNIT_GROUPS[0].units.includes(measurementUnit as any)
                        ? styles.unitBadgeBlue
                        : styles.unitBadgePurple,
                    ]}>
                      <Text style={[
                        styles.unitBadgeText,
                        UNIT_GROUPS[0].units.includes(measurementUnit as any)
                          ? styles.unitBadgeTextBlue
                          : styles.unitBadgeTextPurple,
                      ]}>
                        {measurementUnit}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Suggestion chip */}
                {showSuggestion && suggestion && (
                  <View style={styles.suggestionChip}>
                    <Text style={styles.suggestionChipText}>Suggested: {suggestion}</Text>
                    <TouchableOpacity onPress={handleAcceptSuggestion} style={styles.suggestionAction}>
                      <Text style={styles.suggestionActionAccept}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDismissSuggestion} style={styles.suggestionAction}>
                      <Text style={styles.suggestionActionDismiss}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Unit pills in two columns: Volume (blue) and Weight (purple) */}
                <View style={styles.pillGroups}>
                  {UNIT_GROUPS.map(group => (
                    <View key={group.label} style={styles.pillGroup}>
                      <Text style={[styles.pillGroupLabel, { color: group.color }]}>{group.label}</Text>
                      <View style={styles.pillRow}>
                        {group.units.map(unit => (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              styles.pill,
                              measurementUnit === unit && { borderColor: group.color, backgroundColor: `${group.color}20` },
                            ]}
                            onPress={() => {
                              const newUnit = measurementUnit === unit ? null : unit;
                              setMeasurementUnit(newUnit);
                              if (!newUnit) {
                                setMeasurementValueText('');
                                setCombinedInput('');
                              } else if (measurementValueText) {
                                setCombinedInput(`${measurementValueText}${newUnit}`);
                              }
                            }}
                          >
                            <Text style={[
                              styles.pillText,
                              measurementUnit === unit && { color: group.color, fontWeight: TYPOGRAPHY.fontWeight.semibold },
                            ]}>
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ))}
                  {measurementUnit && (
                    <TouchableOpacity
                      style={styles.pillClear}
                      onPress={() => {
                        setMeasurementUnit(null);
                        setMeasurementValueText('');
                        setCombinedInput('');
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
                    onChangeText={(text) => {
                      setMeasurementValueText(text);
                      if (text.trim() && measurementUnit) {
                        setCombinedInput(`${text}${measurementUnit}`);
                      }
                    }}
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

              <TouchableOpacity onPress={handleSave}>
                <LinearGradient
                  colors={['#6EA8FE', '#A78BFA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveButton}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

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
    borderTopLeftRadius: RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
    backgroundColor: COLORS.glass.subtle,
    borderWidth: 1.5,
    borderColor: COLORS.border.medium,
    borderRadius: RADIUS.large,
    color: COLORS.text.primary,
    padding: 14,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
  combinedInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  combinedInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.lg,
  },
  unitBadge: {
    marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.medium,
  },
  unitBadgeBlue: {
    backgroundColor: 'rgba(110,168,254,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(110,168,254,0.3)',
  },
  unitBadgePurple: {
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  unitBadgeText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  unitBadgeTextBlue: {
    color: '#6EA8FE',
  },
  unitBadgeTextPurple: {
    color: '#A78BFA',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderStyle: 'dashed',
    borderRadius: RADIUS.medium,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  suggestionChipText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  suggestionAction: {
    padding: SPACING.xs,
  },
  suggestionActionAccept: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.accent.blue,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  suggestionActionDismiss: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.tertiary,
  },
  measurementSection: {
    marginBottom: SPACING.xl,
  },
  pillGroups: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  pillGroup: {
    flex: 1,
  },
  pillGroupLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    marginBottom: SPACING.xs,
  },
  pillRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    backgroundColor: 'transparent',
  },
  pillText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  pillClear: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
    alignSelf: 'flex-end',
    marginBottom: SPACING.xs,
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
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.large,
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
