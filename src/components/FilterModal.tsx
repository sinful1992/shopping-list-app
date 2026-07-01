import React, { useState, useEffect, useMemo } from 'react';
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
import LinearGradient from 'react-native-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateShort } from '../utils/date';

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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
        <LinearGradient
          colors={[theme.gradient.modalStart, theme.gradient.modalEnd]}
          style={styles.modal}
        >
          <View style={styles.modalHandleContainer}>
            <View style={styles.modalHandle} />
          </View>
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
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Date Range</Text>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowStartDatePicker(true)}
              >
                <Text style={styles.dateLabel}>Start Date</Text>
                <Text style={styles.dateValue}>
                  {startDate ? formatDateShort(startDate) : 'Select date'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowEndDatePicker(true)}
              >
                <Text style={styles.dateLabel}>End Date</Text>
                <Text style={styles.dateValue}>
                  {endDate ? formatDateShort(endDate) : 'Select date'}
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
                    placeholderTextColor={theme.text.tertiary}
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
                    placeholderTextColor={theme.text.tertiary}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

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

            <TouchableOpacity onPress={handleApply} style={styles.applyButtonWrapper}>
              <LinearGradient
                colors={['#6EA8FE', '#A78BFA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.applyButton}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.overlay.dark,
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
  modalHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.medium,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    marginBottom: 0,
  },
  badge: {
    backgroundColor: theme.accent.blueLight,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: theme.text.primary,
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  closeButtonText: {
    fontSize: 24,
    color: theme.text.tertiary,
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
    color: theme.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  dateButton: {
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  dateLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
  },
  dateValue: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  chipSelected: {
    backgroundColor: theme.accent.blueLight,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
    borderRadius: RADIUS.large,
    shadowColor: theme.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  chipText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
  },
  chipTextSelected: {
    color: theme.text.primary,
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
    color: theme.text.secondary,
    marginBottom: SPACING.xs,
  },
  priceSeparator: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: theme.text.tertiary,
    paddingTop: 20,
  },
  input: {
    backgroundColor: theme.glass.subtle,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    color: theme.text.primary,
    padding: 14,
  },
  receiptRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  receiptButton: {
    flex: 1,
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  receiptButtonActive: {
    backgroundColor: theme.accent.blueLight,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
    borderRadius: RADIUS.large,
    shadowColor: theme.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  receiptButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
  },
  receiptButtonTextActive: {
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: theme.border.medium,
  },
  clearButton: {
    flex: 1,
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  applyButtonWrapper: {
    flex: 1,
  },
  applyButton: {
    alignItems: 'center',
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  applyButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default FilterModal;
