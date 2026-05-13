import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import CategoryService, { CategoryType } from '../services/CategoryService';
import { RADIUS } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

interface CategoryPickerProps {
  selectedCategory: CategoryType | null | undefined;
  onSelectCategory: (category: CategoryType | null) => void;
}

/**
 * CategoryPicker
 * Allows user to select a category for an item
 * Sprint 6: Category Organization
 */
const CategoryPicker: React.FC<CategoryPickerProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const categories = CategoryService.getCategories();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Category</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      >
        {/* None/Clear option */}
        <TouchableOpacity
          style={[
            styles.categoryChip,
            !selectedCategory && styles.categoryChipSelected,
          ]}
          onPress={() => onSelectCategory(null)}
        >
          <Text style={styles.categoryIcon}>✖️</Text>
          <Text
            style={[
              styles.categoryText,
              !selectedCategory && styles.categoryTextSelected,
            ]}
          >
            None
          </Text>
        </TouchableOpacity>

        {/* Category options */}
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryChip,
              selectedCategory === category.id && styles.categoryChipSelected,
              { borderColor: category.color },
            ]}
            onPress={() => onSelectCategory(category.id)}
          >
            <Text style={styles.categoryIcon}>{category.icon}</Text>
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category.id && styles.categoryTextSelected,
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.text.primary,
    marginBottom: 8,
  },
  categoriesContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.glass.subtle,
    borderRadius: RADIUS.xxlarge,
    borderWidth: 2,
    borderColor: theme.border.medium,
  },
  categoryChipSelected: {
    backgroundColor: theme.accent.blueSubtle,
    borderColor: theme.accent.blue,
  },
  categoryIcon: {
    fontSize: 16,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.text.primary,
  },
  categoryTextSelected: {
    color: theme.accent.blue,
    fontWeight: '600',
  },
});

export default CategoryPicker;
