import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

export interface FilterOptions {
  startDate: Date | null;
  endDate: Date | null;
  stores: string[];
  minPrice: number | null;
  maxPrice: number | null;
  categories: string[];
  hasReceipt: 'all' | 'with' | 'without';
}

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FilterOptions) => void;
  availableStores: string[];
  availableCategories: string[];
  currentFilters: FilterOptions;
}

const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  onApply,
  availableStores,
  availableCategories,
  currentFilters,
}) => {
  const [startDate, setStartDate] = useState<Date | null>(currentFilters.startDate);
  const [endDate, setEndDate] = useState<Date | null>(currentFilters.endDate);
  const [selectedStores, setSelectedStores] = useState<string[]>(currentFilters.stores);
  const [minPrice, setMinPrice] = useState<string>(currentFilters.minPrice?.toString() || '');
  const [maxPrice, setMaxPrice] = useState<string>(currentFilters.maxPrice?.toString() || '');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(currentFilters.categories);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'with' | 'without'>(currentFilters.hasReceipt);

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      // Reset to current filters when modal opens
      setStartDate(currentFilters.startDate);
      setEndDate(currentFilters.endDate);
      setSelectedStores(currentFilters.stores);
      setMinPrice(currentFilters.minPrice?.toString() || '');
      setMaxPrice(currentFilters.maxPrice?.toString() || '');
      setSelectedCategories(currentFilters.categories);
      setReceiptFilter(currentFilters.hasReceipt);
    }
  }, [visible, currentFilters]);

  const toggleStore = (store: string) => {
    if (selectedStores.includes(store)) {
      setSelectedStores(selectedStores.filter(s => s !== store));
    } else {
      setSelectedStores([...selectedStores, store]);
    }
  };

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const handleClearFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedStores([]);
    setMinPrice('');
    setMaxPrice('');
    setSelectedCategories([]);
    setReceiptFilter('all');
  };

  const handleApply = () => {
    const filters: FilterOptions = {
      startDate,
      endDate,
      stores: selectedStores,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      categories: selectedCategories,
      hasReceipt: receiptFilter,
    };
    onApply(filters);
    onClose();
  };

  const activeFilterCount = [
    startDate !== null,
    endDate !== null,
    selectedStores.length > 0,
    minPrice !== '',
    maxPrice !== '',
    selectedCategories.length > 0,
    receiptFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            {activeFilterCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeFilterCount}</Text>
              </View>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Date Range */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date Range</Text>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Text style={styles.dateLabel}>Start Date</Text>
                <Text style={styles.dateValue}>
                  {startDate ? startDate.toLocaleDateString('en-GB') : 'Select date'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Text style={styles.dateLabel}>End Date</Text>
                <Text style={styles.dateValue}>
                  {endDate ? endDate.toLocaleDateString('en-GB') : 'Select date'}
                </Text>
              </TouchableOpacity>

              {showStartDatePicker && (
                <DateTimePicker
                  value={startDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    setShowStartDatePicker(Platform.OS === 'ios');
                    if (date) setStartDate(date);
                  }}
                />
              )}

              {showEndDatePicker && (
                <DateTimePicker
                  value={endDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, date) => {
                    setShowEndDatePicker(Platform.OS === 'ios');
                    if (date) setEndDate(date);
                  }}
                />
              )}
            </View>

            {/* Stores */}
            {availableStores.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Stores</Text>
                <View style={styles.chipContainer}>
                  {availableStores.map(store => (
                    <TouchableOpacity
                      key={store}
                      style={[
                        styles.chip,
                        selectedStores.includes(store) && styles.chipSelected,
                      ]}
                      onPress={() => toggleStore(store)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedStores.includes(store) && styles.chipTextSelected,
                        ]}
                      >
                        {store}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Price Range */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Price Range</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceInput}>
                  <Text style={styles.priceLabel}>Min</Text>
                  <TextInput
                    style={styles.input}
                    value={minPrice}
                    onChangeText={setMinPrice}
                    placeholder="£0"
                    placeholderTextColor={COLORS.text.tertiary}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.priceSeparator}>-</Text>
                <View style={styles.priceInput}>
                  <Text style={styles.priceLabel}>Max</Text>
                  <TextInput
                    style={styles.input}
                    value={maxPrice}
                    onChangeText={setMaxPrice}
                    placeholder="£999"
                    placeholderTextColor={COLORS.text.tertiary}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Categories */}
            {availableCategories.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Categories</Text>
                <View style={styles.chipContainer}>
                  {availableCategories.map(category => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.chip,
                        selectedCategories.includes(category) && styles.chipSelected,
                      ]}
                      onPress={() => toggleCategory(category)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selectedCategories.includes(category) && styles.chipTextSelected,
                        ]}
                      >
                        {category}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Receipt Filter */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Receipt</Text>
              <View style={styles.receiptRow}>
                <TouchableOpacity
                  style={[
                    styles.receiptButton,
                    receiptFilter === 'all' && styles.receiptButtonActive,
                  ]}
                  onPress={() => setReceiptFilter('all')}
                >
                  <Text
                    style={[
                      styles.receiptButtonText,
                      receiptFilter === 'all' && styles.receiptButtonTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.receiptButton,
                    receiptFilter === 'with' && styles.receiptButtonActive,
                  ]}
                  onPress={() => setReceiptFilter('with')}
                >
                  <Text
                    style={[
                      styles.receiptButtonText,
                      receiptFilter === 'with' && styles.receiptButtonTextActive,
                    ]}
                  >
                    With Receipt
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.receiptButton,
                    receiptFilter === 'without' && styles.receiptButtonActive,
                  ]}
                  onPress={() => setReceiptFilter('without')}
                >
                  <Text
                    style={[
                      styles.receiptButtonText,
                      receiptFilter === 'without' && styles.receiptButtonTextActive,
                    ]}
                  >
                    No Receipt
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearFilters}
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApply}
            >
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
  badge: {
    backgroundColor: COLORS.accent.blueLight,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
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
  section: {
    marginBottom: SPACING.xxl,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  dateButton: {
    ...COMMON_STYLES.button,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  dateLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  dateValue: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    ...COMMON_STYLES.button,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  chipSelected: {
    ...COMMON_STYLES.buttonActive,
  },
  chipText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  chipTextSelected: {
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  priceInput: {
    flex: 1,
  },
  priceLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.xs,
  },
  priceSeparator: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.text.tertiary,
    paddingTop: 20,
  },
  input: {
    ...COMMON_STYLES.input,
  },
  receiptRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  receiptButton: {
    flex: 1,
    ...COMMON_STYLES.button,
    alignItems: 'center',
  },
  receiptButtonActive: {
    ...COMMON_STYLES.buttonActive,
  },
  receiptButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  receiptButtonTextActive: {
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.medium,
  },
  clearButton: {
    flex: 1,
    ...COMMON_STYLES.button,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  applyButton: {
    flex: 1,
    ...COMMON_STYLES.buttonActive,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default FilterModal;
