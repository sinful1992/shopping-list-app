import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ReceiptData } from '../models/types';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, ANIMATION, COMMON_STYLES } from '../styles/theme';

interface ReceiptPreviewOverlayProps {
  state: 'idle' | 'loading' | 'success' | 'error';
  receiptData: ReceiptData | null;
  error: string | null;
  onConfirm: () => void;
  onRetake: () => void;
  onRetryOCR?: () => void;
  onPickGallery?: () => void;
}

const ReceiptPreviewOverlay: React.FC<ReceiptPreviewOverlayProps> = ({
  state,
  receiptData,
  error,
  onConfirm,
  onRetake,
  onRetryOCR,
  onPickGallery,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = React.useRef(new Animated.Value(300)).current;

  React.useEffect(() => {
    if (state === 'idle') {
      slideAnim.setValue(300);
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: ANIMATION.normal,
        useNativeDriver: true,
      }).start();
    }
  }, [state, slideAnim]);

  if (state === 'idle') return null;

  const confidenceBadgeColor =
    receiptData && receiptData.confidence >= 70
      ? COLORS.accent.green
      : COLORS.accent.orange;

  return (
    <Animated.View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, SPACING.lg), transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.card}>
        {state === 'loading' && (
          <>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.accent.blue} />
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
              <Icon name="warning-outline" size={22} color={COLORS.accent.orange} />
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
                <Icon name="images-outline" size={14} color={COLORS.text.tertiary} />
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
                value={receiptData.merchantName}
                icon="storefront-outline"
              />
              <FieldRow
                label="Date"
                value={receiptData.purchaseDate}
                icon="calendar-outline"
              />
              <FieldRow
                label="Total"
                value={
                  receiptData.totalAmount != null
                    ? `£${receiptData.totalAmount.toFixed(2)}`
                    : null
                }
                icon="cash-outline"
                bold
              />
              <FieldRow
                label="Items"
                value={
                  receiptData.lineItems.length > 0
                    ? `${receiptData.lineItems.length} found`
                    : null
                }
                icon="list-outline"
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
      </View>
    </Animated.View>
  );
};

interface FieldRowProps {
  label: string;
  value: string | null;
  icon: string;
  bold?: boolean;
}

const FieldRow: React.FC<FieldRowProps> = ({ label, value, icon, bold }) => (
  <View style={styles.fieldRow}>
    <View style={styles.fieldLeft}>
      <Icon
        name={value ? 'checkmark-circle' : icon}
        size={16}
        color={value ? COLORS.accent.green : COLORS.text.tertiary}
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

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.lg,
  },
  card: {
    ...COMMON_STYLES.glassCardElevated,
    backgroundColor: 'rgba(18, 18, 28, 0.92)',
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
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  errorText: {
    color: COLORS.text.secondary,
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
    color: COLORS.text.secondary,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  fieldValue: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
    maxWidth: '55%',
    textAlign: 'right',
  },
  fieldValueMissing: {
    color: COLORS.text.tertiary,
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
    backgroundColor: COLORS.glass.medium,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    alignItems: 'center',
  },
  retakeButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.accent.green,
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
    color: COLORS.text.tertiary,
    fontSize: TYPOGRAPHY.fontSize.sm,
    textDecorationLine: 'underline',
  },
});

export default ReceiptPreviewOverlay;
