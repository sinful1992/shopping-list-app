import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

export type SortField = 'date' | 'amount' | 'store' | 'name';
export type SortOrder = 'asc' | 'desc';

export interface SortOption {
  field: SortField;
  order: SortOrder;
  label: string;
}

interface SortDropdownProps {
  currentSort: SortOption;
  onSelect: (sort: SortOption) => void;
}

const SORT_OPTIONS: SortOption[] = [
  { field: 'date', order: 'desc', label: 'Date (newest first)' },
  { field: 'date', order: 'asc', label: 'Date (oldest first)' },
  { field: 'amount', order: 'desc', label: 'Amount (highest first)' },
  { field: 'amount', order: 'asc', label: 'Amount (lowest first)' },
  { field: 'store', order: 'asc', label: 'Store (A-Z)' },
  { field: 'store', order: 'desc', label: 'Store (Z-A)' },
  { field: 'name', order: 'asc', label: 'Name (A-Z)' },
  { field: 'name', order: 'desc', label: 'Name (Z-A)' },
];

const SortDropdown: React.FC<SortDropdownProps> = ({
  currentSort,
  onSelect,
}) => {
  const [visible, setVisible] = useState(false);

  const handleSelect = (option: SortOption) => {
    onSelect(option);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
      >
        <Text style={styles.triggerText}>Sort: {currentSort.label}</Text>
        <Text style={styles.triggerIcon}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>Sort By</Text>
            {SORT_OPTIONS.map((option, index) => {
              const isSelected =
                option.field === currentSort.field &&
                option.order === currentSort.order;

              return (
                <TouchableOpacity
                  key={`${option.field}-${option.order}`}
                  style={[
                    styles.option,
                    isSelected && styles.optionSelected,
                    index === SORT_OPTIONS.length - 1 && styles.optionLast,
                  ]}
                  onPress={() => handleSelect(option)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    ...COMMON_STYLES.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  triggerText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  triggerIcon: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.text.secondary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.overlay.dark,
  },
  dropdown: {
    ...COMMON_STYLES.glassCardElevated,
    minWidth: 280,
    maxWidth: '80%',
    padding: SPACING.md,
  },
  dropdownTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionSelected: {
    backgroundColor: COLORS.glass.elevated,
    borderRadius: RADIUS.medium,
  },
  optionText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  optionTextSelected: {
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  checkmark: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.accent.blue,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default SortDropdown;
