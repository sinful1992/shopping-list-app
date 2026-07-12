import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import CategoryService from '../services/CategoryService';
import { SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

interface CategoryConflictModalProps {
  visible: boolean;
  itemName: string;
  categories: Array<{
    category: string;
    usageCount: number;
    lastUsedAt: number;
  }>;
  onSelectCategory: (category: string) => void;
  onCancel: () => void;
}

const CategoryConflictModal: React.FC<CategoryConflictModalProps> = ({
  visible,
  itemName,
  categories,
  onSelectCategory,
  onCancel,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Which category?</Text>
          <Text style={styles.subtitle}>
            You've used "{itemName}" in multiple categories before:
          </Text>

          <ScrollView style={styles.categoriesContainer}>
            {categories.map((cat) => {
              const categoryInfo = CategoryService.getCategory(cat.category);
              return (
                <TouchableOpacity
                  key={cat.category}
                  style={styles.categoryOption}
                  onPress={() => onSelectCategory(cat.category)}
                  activeOpacity={0.7}
                >
                  <View style={styles.categoryContent}>
                    <Text style={styles.categoryIcon}>
                      {categoryInfo?.icon || '📦'}
                    </Text>
                    <Text style={styles.categoryName}>
                      {categoryInfo?.name || cat.category}
                    </Text>
                  </View>
                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modal: {
    backgroundColor: theme.glass.elevated,
    borderRadius: RADIUS.large,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    ...SHADOWS.medium,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    textAlign: 'center',
    marginTop: SPACING.lg,
    marginHorizontal: SPACING.lg,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  categoriesContainer: {
    maxHeight: 400,
    paddingHorizontal: SPACING.lg,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.medium,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  categoryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    fontSize: 28,
    marginRight: SPACING.md,
  },
  categoryName: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: theme.text.primary,
    flex: 1,
  },
  arrow: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    color: theme.text.secondary,
    marginLeft: SPACING.sm,
  },
  cancelButton: {
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: theme.text.secondary,
  },
});

export default CategoryConflictModal;
