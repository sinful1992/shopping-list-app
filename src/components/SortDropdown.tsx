import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';
import Icon from 'react-native-vector-icons/Ionicons';

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
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
          <LinearGradient
            colors={[theme.gradient.modalStart, theme.gradient.modalEnd]}
            style={styles.dropdown}
          >
            <View style={styles.modalHandleContainer}>
              <View style={styles.modalHandle} />
            </View>
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
                    <Icon name="checkmark" size={16} color={theme.accent.blue} />
                  )}
                </TouchableOpacity>
              );
            })}
          </LinearGradient>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  trigger: {
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  triggerText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  triggerIcon: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: theme.text.secondary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.overlay.dark,
  },
  dropdown: {
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: theme.border.medium,
    minWidth: 280,
    maxWidth: '80%',
    padding: SPACING.md,
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
  dropdownTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
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
    borderBottomColor: theme.border.subtle,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionSelected: {
    backgroundColor: theme.accent.blueSubtle,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: theme.accent.blueDim,
  },
  optionText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
  },
  optionTextSelected: {
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  checkmark: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: theme.accent.blue,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default SortDropdown;
