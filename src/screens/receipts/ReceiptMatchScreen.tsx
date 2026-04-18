import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError, sanitizePrice } from '../../utils/sanitize';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, COMMON_STYLES } from '../../styles/theme';
import ShoppingListManager from '../../services/ShoppingListManager';
import ItemManager from '../../services/ItemManager';
import { matchReceiptToList, MatchCandidate, MatchResult } from '../../utils/receiptMatcher';
import { Item, ReceiptData, ReceiptLineItem } from '../../models/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Params = { listId: string };

const ReceiptMatchScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const { listId } = route.params as Params;

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [unmatchedReceiptOpen, setUnmatchedReceiptOpen] = useState(false);
  const [unmatchedListOpen, setUnmatchedListOpen] = useState(false);
  const applyingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await ShoppingListManager.getListById(listId);
        if (!mounted) return;
        if (!list) {
          setLoading(false);
          return;
        }
        setReceiptData(list.receiptData);

        const items = await ItemManager.getItemsForList(listId);
        if (!mounted) return;
        const eligible = items.filter(i => i.price == null);
        setEligibleCount(eligible.length);

        if (list.receiptData && eligible.length > 0) {
          setMatchResult(matchReceiptToList(list.receiptData.lineItems, eligible));
        }
      } catch (error: any) {
        showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [listId, showAlert]);

  const acceptedMatches = useMemo(() => {
    if (!matchResult) return [] as MatchCandidate[];
    return matchResult.matches.filter(m => !rejected.has(m.listItem.id));
  }, [matchResult, rejected]);

  const toggleReject = (listItemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRejected(prev => {
      const next = new Set(prev);
      if (next.has(listItemId)) next.delete(listItemId);
      else next.add(listItemId);
      return next;
    });
  };

  const handleApply = async () => {
    if (applyingRef.current) return;
    const updates = acceptedMatches
      .map(m => {
        const price = sanitizePrice(m.receiptItem.price ?? m.receiptItem.unitPrice);
        if (price == null) return null;
        const patch: Partial<Item> = { price };
        if (!m.listItem.checked) patch.checked = true;
        return { id: m.listItem.id, updates: patch };
      })
      .filter((u): u is { id: string; updates: Partial<Item> } => u !== null);

    if (updates.length === 0) return;

    applyingRef.current = true;
    setApplying(true);
    try {
      await ItemManager.updateItemsBatch(updates);
      showAlert(
        'Prices applied',
        `Updated ${updates.length} item${updates.length === 1 ? '' : 's'}`,
        undefined,
        { icon: 'success' },
      );
      navigation.goBack();
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const handleSkip = () => navigation.goBack();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent.blue} />
      </View>
    );
  }

  if (!receiptData) {
    return (
      <EmptyState
        icon="receipt-outline"
        title="No receipt data found"
        message="The list does not have OCR data attached."
        onSkip={handleSkip}
      />
    );
  }

  if (eligibleCount === 0) {
    return (
      <EmptyState
        icon="checkmark-done-outline"
        title="Nothing to price"
        message="No items are missing a price."
        onSkip={handleSkip}
      />
    );
  }

  if (!matchResult) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Could not match"
        message="The receipt has no usable line items."
        onSkip={handleSkip}
      />
    );
  }

  const currency = receiptData.currency || '£';
  const matchCount = matchResult.matches.length;
  const acceptedCount = acceptedMatches.length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.summary}>
          {matchCount === 0
            ? 'No matches found'
            : `Found ${matchCount} match${matchCount === 1 ? '' : 'es'} · ${matchResult.unmatchedList.length} unmatched`}
        </Text>

        {matchResult.matches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Matched</Text>
            {matchResult.matches.map(m => (
              <MatchRow
                key={m.listItem.id}
                match={m}
                currency={currency}
                rejected={rejected.has(m.listItem.id)}
                onToggleReject={() => toggleReject(m.listItem.id)}
              />
            ))}
          </View>
        )}

        {matchResult.unmatchedReceipt.length > 0 && (
          <CollapsibleSection
            title={`Unmatched receipt items (${matchResult.unmatchedReceipt.length})`}
            open={unmatchedReceiptOpen}
            onToggle={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setUnmatchedReceiptOpen(v => !v);
            }}
          >
            {matchResult.unmatchedReceipt.map(({ item, index }) => (
              <UnmatchedReceiptRow key={index} item={item} currency={currency} />
            ))}
          </CollapsibleSection>
        )}

        {matchResult.unmatchedList.length > 0 && (
          <CollapsibleSection
            title={`Unmatched list items (${matchResult.unmatchedList.length})`}
            open={unmatchedListOpen}
            onToggle={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setUnmatchedListOpen(v => !v);
            }}
          >
            {matchResult.unmatchedList.map(item => (
              <UnmatchedListRow key={item.id} item={item} />
            ))}
          </CollapsibleSection>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={applying}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyWrap, acceptedCount === 0 && styles.applyDisabled]}
          onPress={handleApply}
          disabled={acceptedCount === 0 || applying}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.gradient.buttonStart, COLORS.gradient.buttonEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.applyGradient}
          >
            {applying ? (
              <ActivityIndicator color={COLORS.text.primary} />
            ) : (
              <Text style={styles.applyText}>
                {acceptedCount === 0 ? 'Apply' : `Apply ${acceptedCount} price${acceptedCount === 1 ? '' : 's'}`}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface MatchRowProps {
  match: MatchCandidate;
  currency: string;
  rejected: boolean;
  onToggleReject: () => void;
}

const MatchRow: React.FC<MatchRowProps> = ({ match, currency, rejected, onToggleReject }) => {
  const price = match.receiptItem.price ?? match.receiptItem.unitPrice;
  const badge = scoreBadge(match.score);
  return (
    <View style={[styles.matchCard, rejected && styles.matchCardRejected]}>
      <View style={styles.matchTop}>
        <Text style={[styles.listName, rejected && styles.strikethrough]} numberOfLines={2}>
          {match.listItem.name}
        </Text>
        <Icon name="arrow-forward" size={16} color={COLORS.text.tertiary} style={styles.arrowIcon} />
        <Text style={[styles.receiptDesc, rejected && styles.strikethrough]} numberOfLines={2}>
          {match.receiptItem.description}
        </Text>
      </View>
      <View style={styles.matchBottom}>
        <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>
            {Math.round(match.score * 100)}% · {match.method}
          </Text>
        </View>
        <Text style={[styles.priceText, rejected && styles.strikethrough]}>
          {price != null ? `${currency}${price.toFixed(2)}` : '—'}
        </Text>
        <TouchableOpacity onPress={onToggleReject} style={styles.rejectButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon
            name={rejected ? 'add-circle-outline' : 'close-circle-outline'}
            size={22}
            color={rejected ? COLORS.accent.green : COLORS.accent.red}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const UnmatchedReceiptRow: React.FC<{ item: ReceiptLineItem; currency: string }> = ({ item, currency }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoText} numberOfLines={2}>{item.description}</Text>
    <Text style={styles.infoPrice}>
      {item.price != null ? `${currency}${item.price.toFixed(2)}` : '—'}
    </Text>
  </View>
);

const UnmatchedListRow: React.FC<{ item: Item }> = ({ item }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoText} numberOfLines={2}>{item.name}</Text>
  </View>
);

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, open, onToggle, children }) => (
  <View style={styles.section}>
    <TouchableOpacity style={styles.collapseHeader} onPress={onToggle} activeOpacity={0.7}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.secondary} />
    </TouchableOpacity>
    {open && <View>{children}</View>}
  </View>
);

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  onSkip: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, onSkip }) => (
  <View style={styles.center}>
    <Icon name={icon} size={56} color={COLORS.text.secondary} />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyMessage}>{message}</Text>
    <TouchableOpacity style={styles.emptyButton} onPress={onSkip}>
      <Text style={styles.skipButtonText}>Done</Text>
    </TouchableOpacity>
  </View>
);

function scoreBadge(score: number): { bg: string; border: string; fg: string } {
  if (score >= 0.9) {
    return { bg: 'rgba(48, 209, 88, 0.18)', border: COLORS.accent.greenDim, fg: COLORS.accent.green };
  }
  if (score >= 0.7) {
    return { bg: 'rgba(255, 179, 64, 0.18)', border: 'rgba(255, 179, 64, 0.35)', fg: COLORS.accent.orange };
  }
  return { bg: 'rgba(255, 214, 10, 0.18)', border: COLORS.accent.yellowDim, fg: COLORS.accent.yellow };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background.primary,
    padding: SPACING.xl,
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  summary: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    marginBottom: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    ...COMMON_STYLES.label,
    marginBottom: SPACING.md,
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  matchCard: {
    ...COMMON_STYLES.glassCard,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  matchCardRejected: {
    opacity: 0.45,
  },
  matchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  listName: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  arrowIcon: {
    marginHorizontal: SPACING.xs,
  },
  receiptDesc: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    textAlign: 'right',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  matchBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    letterSpacing: 0.5,
  },
  priceText: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.accent.green,
    marginLeft: 'auto',
  },
  rejectButton: {
    padding: SPACING.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.subtle,
    gap: SPACING.md,
  },
  infoText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
  },
  infoPrice: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.tertiary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: COLORS.background.primary,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.subtle,
  },
  skipButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    backgroundColor: COLORS.glass.subtle,
    justifyContent: 'center',
  },
  skipButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  applyWrap: {
    flex: 1,
    borderRadius: RADIUS.large,
    overflow: 'hidden',
  },
  applyDisabled: {
    opacity: 0.4,
  },
  applyGradient: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  emptyButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    backgroundColor: COLORS.glass.subtle,
  },
});

export default ReceiptMatchScreen;
