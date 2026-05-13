import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Item } from '../models/types';
import CategoryService, { CategoryType } from '../services/CategoryService';
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

  const categories = CategoryService.getCategories();

  return (
    <ModalBottomSheet visible={visible} onClose={onClose}>
      <View style={styles.content}>
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
          {categories.map(cat => {
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
                  isSelected && { color: cat.color, fontWeight: TYPOGRAPHY.fontWeight.semibold },
                ]} numberOfLines={1}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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
              colors={['#6EA8FE', '#A78BFA']}
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
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
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
  saveText: {
    color: theme.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});

export default DetailsEditModal;
