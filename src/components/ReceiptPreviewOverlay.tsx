import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ReceiptData } from '../models/types';
import { SPACING, RADIUS, TYPOGRAPHY, ANIMATION } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

interface ReceiptPreviewOverlayProps {
  state: 'idle' | 'loading' | 'success' | 'error';
  receiptData: ReceiptData | null;
  totalAmount?: number | null;
  merchantName?: string | null;
  purchaseDate?: string | null;
  currency?: string | null;
  error: string | null;
  onConfirm: () => void;
  onRetake: () => void;
  onRetryOCR?: () => void;
  onPickGallery?: () => void;
}

interface FieldRowProps {
  label: string;
  value: string | null;
  icon: string;
  bold?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}

const FieldRow: React.FC<FieldRowProps> = ({ label, value, icon, bold, styles, theme }) => (
  <View style={styles.fieldRow}>
    <View style={styles.fieldLeft}>
      <Icon
        name={value ? 'checkmark-circle' : icon}
        size={16}
        color={value ? theme.accent.green : theme.text.tertiary}
      />
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
    <Text
      style={[
        styles.fieldValue,
        !value && styles.fieldValueMissing,
        bold && styles.fieldValueBold,
      ]}
      numberOfLines={1}
    >
      {value || '—'}
    </Text>
  </View>
);

const ReceiptPreviewOverlay: React.FC<ReceiptPreviewOverlayProps> = ({
  state,
  receiptData,
  totalAmount,
  merchantName,
  purchaseDate,
  currency,
  error,
  onConfirm,
  onRetake,
  onRetryOCR,
  onPickGallery,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const isVisible = state !== 'idle';

  const confidenceBadgeColor =
    receiptData && receiptData.confidence >= 70
      ? theme.accent.green
      : theme.accent.orange;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, SPACING.lg),
          transform: [{ translateY: isVisible ? 0 : 300 }],
          transitionProperty: 'transform',
          transitionDuration: `${ANIMATION.normal}ms`,
        } as any,
      ]}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      {isVisible && <View style={styles.card}>
        {state === 'loading' && (
          <>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.accent.blue} />
              <Text style={styles.loadingText}>Reading receipt…</Text>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.retakeButton} onPress={onRetake}>
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {state === 'error' && (
          <>
            <View style={styles.errorRow}>
              <Icon name="warning-outline" size={22} color={theme.accent.orange} />
              <Text style={styles.errorText} numberOfLines={3}>
                {error || 'Failed to process receipt'}
              </Text>
            </View>
            <View style={styles.buttonRow}>
              {onRetryOCR && (
                <TouchableOpacity style={styles.retakeButton} onPress={onRetryOCR}>
                  <Text style={styles.retakeButtonText}>Try again</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.retakeButton} onPress={onRetake}>
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
            {onPickGallery && (
              <TouchableOpacity style={styles.galleryLink} onPress={onPickGallery}>
                <Icon name="images-outline" size={14} color={theme.text.tertiary} />
                <Text style={styles.galleryLinkText}>or pick from gallery</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {state === 'success' && receiptData && (
          <>
            <View style={styles.fieldsContainer}>
              <FieldRow
                label="Merchant"
                value={merchantName ?? null}
                icon="storefront-outline"
                styles={styles}
                theme={theme}
              />
              <FieldRow
                label="Date"
                value={purchaseDate ?? null}
                icon="calendar-outline"
                styles={styles}
                theme={theme}
              />
              <FieldRow
                label="Total"
                value={
                  totalAmount != null
                    ? `${currency || '£'}${totalAmount.toFixed(2)}`
                    : null
                }
                icon="cash-outline"
                bold
                styles={styles}
                theme={theme}
              />
              <FieldRow
                label="Items"
                value={
                  receiptData.lineItems.length > 0
                    ? `${receiptData.lineItems.length} found`
                    : null
                }
                icon="list-outline"
                styles={styles}
                theme={theme}
              />
              <View style={styles.confidenceRow}>
                <Text style={styles.fieldLabel}>Confidence</Text>
                <View
                  style={[
                    styles.confidenceBadge,
                    { backgroundColor: confidenceBadgeColor + '30' },
                  ]}
                >
                  <Text
                    style={[styles.confidenceText, { color: confidenceBadgeColor }]}
                  >
                    {receiptData.confidence}%
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.retakeButton} onPress={onRetake}>
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>}
    </Animated.View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
  },
  card: {
    backgroundColor: 'rgba(18, 18, 30, 0.94)',
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    padding: SPACING.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  loadingText: {
    color: '#fff',
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  errorText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: TYPOGRAPHY.fontSize.md,
    flex: 1,
  },
  fieldsContainer: {
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  fieldLabel: {
    color: 'rgba(255, 255, 255, 0.60)',
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  fieldValue: {
    color: '#fff',
    fontSize: TYPOGRAPHY.fontSize.md,
    maxWidth: '55%',
    textAlign: 'right',
  },
  fieldValueMissing: {
    color: 'rgba(255, 255, 255, 0.38)',
  },
  fieldValueBold: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confidenceBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.small,
  },
  confidenceText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  retakeButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    backgroundColor: theme.accent.green,
    borderRadius: RADIUS.large,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  galleryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  galleryLinkText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: TYPOGRAPHY.fontSize.sm,
    textDecorationLine: 'underline',
  },
});

export default ReceiptPreviewOverlay;
