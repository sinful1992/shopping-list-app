import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Item } from '../models/types';
import CategoryService from '../services/CategoryService';
import ModalBottomSheet from './ModalBottomSheet';
import { useAlert } from '../contexts/AlertContext';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

interface PriceEditModalProps {
  visible: boolean;
  item: Item | null;
  recentPrices: number[];
  onClose: () => void;
  onSave: (itemId: string, updates: { price?: number | null }) => Promise<void>;
  onViewPriceHistory: (itemName: string) => void;
}

const PriceEditModal: React.FC<PriceEditModalProps> = ({
  visible,
  item,
  recentPrices,
  onClose,
  onSave,
  onViewPriceHistory,
}) => {
  const { showAlert } = useAlert();
  const [price, setPrice] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (item) {
      setPrice(item.price != null ? item.price.toString() : '');
    }
  }, [item]);

  useEffect(() => {
    if (visible) {
      const id = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
  }, [visible]);

  const handleSave = async () => {
    if (!item) return;
    const priceValue = price.trim() ? parseFloat(price) : null;
    if (price.trim() && (priceValue === null || isNaN(priceValue!))) {
      showAlert('Error', 'Please enter a valid price', undefined, { icon: 'error' });
      return;
    }
    try {
      await onSave(item.id, { price: priceValue });
      onClose();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save price', undefined, { icon: 'error' });
    }
  };

  if (!item) return null;

  const category = item.category ? CategoryService.getCategory(item.category as any) : null;
  const hasMeasurement = item.measurementUnit != null;
  const priceValue = price.trim() ? parseFloat(price) : null;
  const hasValidPrice = priceValue !== null && !isNaN(priceValue);
  const saveLabel = price.trim() === ''
    ? 'Clear Price'
    : hasValidPrice
    ? `Set £${priceValue!.toFixed(2)}`
    : 'Save';

  return (
    <ModalBottomSheet visible={visible} onClose={onClose}>
      {/* Context row */}
      <View style={styles.contextRow}>
        <Text style={styles.contextEmoji}>{category?.icon ?? '📦'}</Text>
        <Text style={styles.contextName} numberOfLines={1}>{item.name}</Text>
        {hasMeasurement && (
          <View style={styles.sizeBadge}>
            <Text style={styles.sizeBadgeText}>
              {item.measurementValue != null ? `${item.measurementValue}${item.measurementUnit}` : item.measurementUnit}
            </Text>
          </View>
        )}
      </View>

      {/* Large price input */}
      <View style={styles.priceInputRow}>
        <Text style={styles.currencySymbol}>£</Text>
        <TextInput
          ref={inputRef}
          style={styles.priceInput}
          value={price}
          onChangeText={setPrice}
          placeholder="0.00"
          placeholderTextColor={COLORS.text.tertiary}
          keyboardType="numeric"
        />
      </View>

      {/* Quick-fill chips */}
      {recentPrices.length > 0 && (
        <View style={styles.chipsRow}>
          {recentPrices.map((p, i) => (
            <TouchableOpacity
              key={i}
              style={styles.chip}
              onPress={() => setPrice(p.toString())}
            >
              <Text style={styles.chipText}>£{p.toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Price history button */}
      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => onViewPriceHistory(item.name)}
      >
        <Text style={styles.historyIcon}>📊</Text>
        <Text style={styles.historyText}>View Price History</Text>
      </TouchableOpacity>

      {/* Footer */}
      <View style={styles.footer}>
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
            <Text style={styles.saveText}>{saveLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ModalBottomSheet>
  );
};

const styles = StyleSheet.create({
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  contextEmoji: {
    fontSize: 20,
  },
  contextName: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  sizeBadge: {
    backgroundColor: 'rgba(110,168,254,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(110,168,254,0.3)',
    borderRadius: RADIUS.medium,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  sizeBadgeText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: '#6EA8FE',
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.secondary,
    marginRight: SPACING.sm,
  },
  priceInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    padding: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.glass.subtle,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: RADIUS.medium,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  chipText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent.blueSubtle,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.accent.blueDim,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  historyIcon: {
    fontSize: TYPOGRAPHY.fontSize.xl,
  },
  historyText: {
    color: COLORS.accent.blue,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.medium,
    gap: SPACING.md,
  },
  cancelButton: {
    ...COMMON_STYLES.button,
  },
  cancelText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  saveButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.large,
  },
  saveText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});

export default PriceEditModal;
