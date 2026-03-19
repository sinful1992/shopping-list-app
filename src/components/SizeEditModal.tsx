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
import { parseCombinedInput } from '../utils/measurement';
import { useAlert } from '../contexts/AlertContext';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

const UNIT_GROUPS = [
  { label: 'Volume', units: ['ml', 'L'] as const, color: '#6EA8FE' },
  { label: 'Weight', units: ['g', 'kg'] as const, color: '#A78BFA' },
];

interface SizeEditModalProps {
  visible: boolean;
  item: Item | null;
  onClose: () => void;
  onSave: (
    itemId: string,
    updates: { measurementUnit?: string | null; measurementValue?: number | null },
  ) => Promise<void>;
}

const SizeEditModal: React.FC<SizeEditModalProps> = ({ visible, item, onClose, onSave }) => {
  const { showAlert } = useAlert();
  const [combinedInput, setCombinedInput] = useState('');
  const [measurementUnit, setMeasurementUnit] = useState<string | null>(null);
  const [measurementValueText, setMeasurementValueText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const originalUnitRef = useRef<string | null>(null);

  useEffect(() => {
    if (item) {
      setMeasurementUnit(item.measurementUnit ?? null);
      setMeasurementValueText(item.measurementValue != null ? item.measurementValue.toString() : '');
      if (item.measurementUnit && item.measurementValue != null) {
        setCombinedInput(`${item.measurementValue}${item.measurementUnit}`);
      } else {
        setCombinedInput('');
      }
      originalUnitRef.current = item.measurementUnit ?? null;
    }
  }, [item]);

  useEffect(() => {
    if (visible) {
      const id = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(id);
    }
  }, [visible]);

  const handleCombinedInputChange = (text: string) => {
    setCombinedInput(text);
    const parsed = parseCombinedInput(text);
    if (parsed) {
      setMeasurementUnit(parsed.unit);
      setMeasurementValueText(parsed.value.toString());
    } else if (text.trim() === '') {
      setMeasurementUnit(null);
      setMeasurementValueText('');
    } else if (measurementUnit) {
      // Unit already selected via pill — treat plain number as the value
      const num = parseFloat(text.trim());
      if (!isNaN(num)) {
        setMeasurementValueText(num.toString());
      }
    }
  };

  const handleSave = async () => {
    if (!item) return;
    try {
      const measurementValue = measurementValueText.trim() ? parseFloat(measurementValueText) : null;
      await onSave(item.id, { measurementUnit, measurementValue });
      onClose();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save measurement', undefined, { icon: 'error' });
    }
  };

  const handleClear = async () => {
    if (!item) return;
    try {
      await onSave(item.id, { measurementUnit: null, measurementValue: null });
      onClose();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to clear measurement', undefined, { icon: 'error' });
    }
  };

  if (!item) return null;

  const category = item.category ? CategoryService.getCategory(item.category as any) : null;
  const hasExistingMeasurement = originalUnitRef.current !== null;

  const saveLabel = (measurementUnit && measurementValueText.trim())
    ? `Set ${measurementValueText.trim()}${measurementUnit}`
    : 'Done';

  return (
    <ModalBottomSheet visible={visible} onClose={onClose}>
      {/* Context row */}
      <View style={styles.contextRow}>
        <Text style={styles.contextEmoji}>{category?.icon ?? '📦'}</Text>
        <Text style={styles.contextName} numberOfLines={1}>{item.name}</Text>
        {item.price != null && (
          <Text style={styles.contextPrice}>£{item.price.toFixed(2)}</Text>
        )}
      </View>

      <View style={styles.content}>
        {/* Combined input */}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={combinedInput}
            onChangeText={handleCombinedInputChange}
            placeholder="e.g. 500ml, 1.5kg"
            placeholderTextColor={COLORS.text.tertiary}
            autoCapitalize="none"
          />
          {measurementUnit && (
            <View style={[
              styles.unitBadge,
              UNIT_GROUPS[0].units.includes(measurementUnit as any) ? styles.unitBadgeBlue : styles.unitBadgePurple,
            ]}>
              <Text style={[
                styles.unitBadgeText,
                UNIT_GROUPS[0].units.includes(measurementUnit as any) ? styles.unitBadgeTextBlue : styles.unitBadgeTextPurple,
              ]}>
                {measurementUnit}
              </Text>
            </View>
          )}
        </View>

        {/* Unit pills */}
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
                      } else {
                        // Type-first path: user typed a number before selecting pill
                        const num = parseFloat(combinedInput.trim());
                        if (!isNaN(num)) {
                          setMeasurementValueText(num.toString());
                          setCombinedInput(`${num}${newUnit}`);
                        }
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
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {hasExistingMeasurement && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearText}>Clear</Text>
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
              <Text style={styles.saveText}>{saveLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
  contextPrice: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.glass.subtle,
    borderWidth: 1.5,
    borderColor: COLORS.border.medium,
    borderRadius: RADIUS.large,
    color: COLORS.text.primary,
    padding: 14,
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
  pillGroups: {
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
    alignItems: 'flex-start',
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.medium,
  },
  clearButton: {
    backgroundColor: COLORS.accent.redSubtle,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.medium,
    borderWidth: 1,
    borderColor: COLORS.accent.redDim,
  },
  clearText: {
    color: COLORS.accent.red,
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

export default SizeEditModal;
