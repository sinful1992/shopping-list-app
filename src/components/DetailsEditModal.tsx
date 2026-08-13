import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Item } from '../models/types';
import CategoryService, { Category, CategoryGroup, CategoryType } from '../services/CategoryService';
import ModalBottomSheet from './ModalBottomSheet';
import { useAlert } from '../contexts/AlertContext';
import { RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

interface DetailsEditModalProps {
  visible: boolean;
  item: Item | null;
  onClose: () => void;
  onSave: (
    itemId: string,
    updates: { name?: string; category?: string | null }
  ) => Promise<void>;
  onDelete?: (itemId: string) => Promise<void>;
}

const DetailsEditModal: React.FC<DetailsEditModalProps> = ({
  visible,
  item,
  onClose,
  onSave,
  onDelete,
}) => {
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryType | null>(null);

  // Retired categories are deliberately absent: existing items keep theirs, but
  // nothing new gets filed under a bucket that has since been split up.
  const groupedCategories = useMemo(() => {
    const groups = new Map<CategoryGroup, Category[]>();
    for (const cat of CategoryService.getPickerCategories()) {
      const existing = groups.get(cat.group);
      if (existing) existing.push(cat);
      else groups.set(cat.group, [cat]);
    }
    return [...groups.entries()];
  }, []);

  // An item filed under a retired category has nothing selected in the grid
  // below, which reads as "uncategorised" when it isn't. Show it its own
  // category so the selection is visible and stays pickable until it's changed.
  const retiredCurrent = useMemo(() => {
    if (!category) return null;
    const current = CategoryService.getCategory(category);
    return current?.legacy ? current : null;
  }, [category]);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setCategory((item.category as CategoryType) || null);
    }
  }, [item]);

  const handleSave = async () => {
    if (!item) return;
    if (!name.trim()) {
      showAlert('Error', 'Item name cannot be empty', undefined, { icon: 'error' });
      return;
    }
    try {
      await onSave(item.id, { name: name.trim(), category });
      onClose();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save item', undefined, { icon: 'error' });
    }
  };

  const handleDelete = () => {
    if (!item || !onDelete) return;
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

  const renderCell = (cat: Category) => {
    const isSelected = category === cat.id;
    return (
      <TouchableOpacity
        key={cat.id}
        style={[
          styles.categoryCell,
          isSelected && {
            borderColor: cat.color,
            backgroundColor: `${cat.color}20`,
          },
        ]}
        onPress={() => setCategory(cat.id as CategoryType)}
      >
        <Text style={styles.categoryEmoji}>{cat.icon}</Text>
        <Text style={[
          styles.categoryText,
          // The category hex tints the cell, but never the label — as
          // text on a light cell most of the palette fails contrast.
          isSelected && { color: theme.text.primary, fontWeight: TYPOGRAPHY.fontWeight.semibold },
        ]} numberOfLines={1}>
          {cat.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ModalBottomSheet visible={visible} onClose={onClose}>
      {/* Scrolls because the picker outgrew the sheet: two columns of 20-odd
          categories no longer fit under maxHeight, and the footer below must
          stay reachable. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="Item name"
          placeholderTextColor={theme.text.tertiary}
        />

        <Text style={styles.categoryLabel}>Category</Text>
        <View style={styles.categoryGrid}>
          <TouchableOpacity
            style={[styles.categoryCell, !category && styles.categoryCellSelected]}
            onPress={() => setCategory(null)}
          >
            <Text style={styles.categoryEmoji}>✖️</Text>
            <Text style={[styles.categoryText, !category && styles.categoryTextSelected]}>None</Text>
          </TouchableOpacity>
        </View>

        {retiredCurrent && (
          <View>
            <Text style={styles.groupLabel}>Currently</Text>
            <View style={styles.categoryGrid}>{renderCell(retiredCurrent)}</View>
          </View>
        )}

        {/* Grouped rather than one flat run — 20-odd cells is a lot to scan,
            and the groups match the order you walk the shop in. */}
        {groupedCategories.map(([group, cats]) => (
          <View key={group}>
            <Text style={styles.groupLabel}>{group}</Text>
            <View style={styles.categoryGrid}>{cats.map(renderCell)}</View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {onDelete && (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        )}
        <View style={styles.footerRight}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave}>
            <LinearGradient
              colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveButton}
            >
              <Text style={styles.saveText}>Save</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </ModalBottomSheet>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  // flexShrink lets the sheet's maxHeight bound the scroll instead of the
  // content pushing the footer off the bottom of the screen.
  scroll: {
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  groupLabel: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    backgroundColor: theme.glass.subtle,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    padding: 14,
    marginBottom: SPACING.xl,
  },
  categoryLabel: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.text.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  categoryCell: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.medium,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  categoryCellSelected: {
    borderColor: theme.accent.blue,
    backgroundColor: theme.accent.blueSubtle,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
  },
  categoryTextSelected: {
    color: theme.accent.blue,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: theme.border.medium,
  },
  deleteButton: {
    backgroundColor: theme.accent.redSubtle,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: theme.accent.redDim,
  },
  deleteText: {
    color: theme.accent.red,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginLeft: 'auto',
  },
  cancelButton: {
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  cancelText: {
    color: theme.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  saveButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.large,
  },
  // Sits on the button gradient, not on the sheet, so it takes the on-accent
  // ink. text.primary inverts with the surface and failed both themes.
  saveText: {
    color: theme.text.onAccent,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});

export default DetailsEditModal;
