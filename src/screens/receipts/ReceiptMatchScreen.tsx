import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Modal,
  Platform,
  UIManager,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { ListsStackParamList } from '../../types/navigation';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError, sanitizePrice } from '../../utils/sanitize';
import { SPACING, TYPOGRAPHY, RADIUS, NUMERIC, RECEIPT_FONT } from '../../styles/theme';
import type { Theme } from '../../styles/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ReceiptCard, { ReceiptRule } from '../../components/ReceiptCard';
import ShoppingListManager from '../../services/ShoppingListManager';
import ItemManager from '../../services/ItemManager';
import NotificationManager from '../../services/NotificationManager';
import CrashReporting from '../../services/CrashReporting';
import { useUser } from '../../contexts/UserContext';
import { matchReceiptToList, MatchCandidate, MatchResult } from '../../utils/receiptMatcher';
import { Item, ReceiptData, ReceiptLineItem, ShoppingList } from '../../models/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ReceiptMatchScreen = () => {
  const route = useRoute<RouteProp<ListsStackParamList, 'ReceiptMatch'>>();
  const navigation = useNavigation<StackNavigationProp<ListsStackParamList>>();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { listId, autoAddAll } = route.params;

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [currency, setCurrency] = useState('£');
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [manualMatches, setManualMatches] = useState<MatchCandidate[]>([]);
  const [pickerReceiptIndex, setPickerReceiptIndex] = useState<number | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [toAdd, setToAdd] = useState<Set<number>>(new Set());
  const [editingNames, setEditingNames] = useState<Record<number, string>>({});
  const user = useUser();
  const userId = user?.uid ?? null;
  const applyingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [list, items] = await Promise.all([
          ShoppingListManager.getListById(listId),
          ItemManager.getItemsForList(listId),
        ]);
        if (!mounted) return;
        if (!list) {
          setLoading(false);
          return;
        }
        setReceiptData(list.receiptData);
        setShoppingList(list);
        setCurrency(list.currency || '£');

        if (list.receiptData?.lineItems?.length) {
          const eligible = items.filter(i => i.price == null);
          const result: MatchResult = eligible.length > 0
            ? matchReceiptToList(list.receiptData.lineItems, eligible)
            : {
                matches: [],
                unmatchedReceipt: list.receiptData.lineItems.map((item, index) => ({ item, index })),
                unmatchedList: [],
              };
          setMatchResult(result);

          if (autoAddAll) {
            const allIndices = new Set(result.unmatchedReceipt.map(e => e.index));
            setToAdd(allIndices);
            const names: Record<number, string> = {};
            result.unmatchedReceipt.forEach(e => { names[e.index] = e.item.description; });
            setEditingNames(names);
          }
        }
      } catch (error: any) {
        showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [listId, showAlert, autoAddAll]);

  const allMatches = useMemo(() => {
    if (!matchResult) return [] as MatchCandidate[];
    return [...matchResult.matches, ...manualMatches];
  }, [matchResult, manualMatches]);

  const visibleUnmatchedReceipt = useMemo(() => {
    if (!matchResult) return [];
    const takenIndices = new Set(manualMatches.map(m => m.receiptIndex));
    return matchResult.unmatchedReceipt.filter(e => !takenIndices.has(e.index));
  }, [matchResult, manualMatches]);

  const visibleUnmatchedList = useMemo(() => {
    if (!matchResult) return [] as Item[];
    const takenIds = new Set(manualMatches.map(m => m.listItem.id));
    return matchResult.unmatchedList.filter(i => !takenIds.has(i.id));
  }, [matchResult, manualMatches]);

  const acceptedMatches = useMemo(() => {
    return allMatches.filter(m => !rejected.has(m.listItem.id));
  }, [allMatches, rejected]);

  const pickerReceiptItem = useMemo(() => {
    if (pickerReceiptIndex == null || !matchResult) return null;
    return matchResult.unmatchedReceipt.find(e => e.index === pickerReceiptIndex)?.item ?? null;
  }, [pickerReceiptIndex, matchResult]);

  const toggleReject = (listItemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRejected(prev => {
      const next = new Set(prev);
      if (next.has(listItemId)) next.delete(listItemId);
      else next.add(listItemId);
      return next;
    });
  };

  const assignManual = (listItem: Item) => {
    if (pickerReceiptIndex == null || !matchResult) return;
    const entry = matchResult.unmatchedReceipt.find(e => e.index === pickerReceiptIndex);
    if (!entry) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setManualMatches(prev => [
      ...prev,
      {
        listItem,
        receiptItem: entry.item,
        receiptIndex: entry.index,
        score: 1,
        method: 'manual',
      },
    ]);
    setPickerReceiptIndex(null);
  };

  const removeManual = (listItemId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setManualMatches(prev => prev.filter(m => m.listItem.id !== listItemId));
    setRejected(prev => {
      if (!prev.has(listItemId)) return prev;
      const next = new Set(prev);
      next.delete(listItemId);
      return next;
    });
  };

  const allUnmatchedSelected =
    visibleUnmatchedReceipt.length > 0 && visibleUnmatchedReceipt.every(e => toAdd.has(e.index));

  const toggleSelectAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (allUnmatchedSelected) {
      setToAdd(prev => {
        const next = new Set(prev);
        visibleUnmatchedReceipt.forEach(e => next.delete(e.index));
        return next;
      });
      setEditingNames(prev => {
        const next = { ...prev };
        visibleUnmatchedReceipt.forEach(e => { delete next[e.index]; });
        return next;
      });
    } else {
      setToAdd(prev => {
        const next = new Set(prev);
        visibleUnmatchedReceipt.forEach(e => next.add(e.index));
        return next;
      });
      setEditingNames(prev => {
        const next = { ...prev };
        visibleUnmatchedReceipt.forEach(e => {
          if (next[e.index] === undefined) next[e.index] = e.item.description;
        });
        return next;
      });
    }
  };

  const toggleToAdd = (index: number, defaultName: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setToAdd(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        setEditingNames(names => { const n = { ...names }; delete n[index]; return n; });
      } else {
        next.add(index);
        setEditingNames(names => ({ ...names, [index]: defaultName }));
      }
      return next;
    });
  };

  const handleApply = async () => {
    if (applyingRef.current) return;

    const updates = acceptedMatches
      .map(m => {
        const line = m.receiptItem;
        const unitQty = m.listItem.unitQty ?? 1;
        // Item.price is per-unit app-wide (totals multiply by unitQty), but a
        // receipt line's price is the line total — derive per-unit when qty > 1
        let raw = line.price ?? line.unitPrice;
        if (unitQty > 1) {
          const lineQty = line.quantity != null && line.quantity > 0 ? line.quantity : unitQty;
          raw = line.unitPrice ?? (line.price != null ? line.price / lineQty : null);
        }
        const price = sanitizePrice(raw);
        if (price == null) return null;
        const patch: Partial<Item> = { price };
        if (!m.listItem.checked) patch.checked = true;
        return { id: m.listItem.id, updates: patch };
      })
      .filter((u): u is { id: string; updates: Partial<Item> } => u !== null);

    const newItems = matchResult
      ? Array.from(toAdd).map(idx => {
          const entry = matchResult.unmatchedReceipt.find(e => e.index === idx);
          if (!entry) return null;
          const name = (editingNames[idx] ?? entry.item.description).trim();
          if (!name) return null;
          const price = sanitizePrice(entry.item.price ?? entry.item.unitPrice);
          return { name, price: price ?? undefined, checked: true };
        }).filter((x): x is { name: string; price: number | undefined; checked: true } => x !== null)
      : [];

    if (updates.length === 0 && newItems.length === 0) return;

    applyingRef.current = true;
    setApplying(true);
    try {
      if (newItems.length > 0) {
        if (!userId) throw new Error('User not authenticated');
        await ItemManager.addItemsBatch(listId, newItems, userId);
      }
      if (updates.length > 0) {
        await ItemManager.updateItemsBatch(updates);
      }
      // Quick-scan is a post-shop flow: everything applied from the receipt is
      // already bought, so finish the trip instead of leaving an active list.
      // The receipt total/merchant were attached to the list at confirm time.
      if (autoAddAll) {
        await ShoppingListManager.updateList(listId, {
          status: 'completed',
          completedAt: Date.now(),
          completedBy: userId,
          uncheckedItemsCount: 0,
        });
        // Tell the family what was just bought (fire-and-forget); the
        // notification tap deep-links to this now-completed list in History.
        if (shoppingList?.familyGroupId && userId) {
          NotificationManager.notifyReceiptScanned({
            familyGroupId: shoppingList.familyGroupId,
            userId,
            userName: user?.displayName || user?.email || 'A family member',
            listId,
            storeName: shoppingList.merchantName,
            listName: shoppingList.name,
            itemCount: updates.length + newItems.length,
            totalAmount: shoppingList.totalAmount,
            currency: shoppingList.currency,
          }).catch(err => CrashReporting.recordError(err as Error, 'ReceiptMatchScreen notifyReceiptScanned'));
        }
      }
      const parts: string[] = [];
      if (updates.length > 0) parts.push(`Updated ${updates.length} price${updates.length === 1 ? '' : 's'}`);
      if (newItems.length > 0) parts.push(`Added ${newItems.length} item${newItems.length === 1 ? '' : 's'}`);
      if (autoAddAll) parts.push('Shopping completed');
      showAlert('Done', parts.join(' · '), undefined, { icon: 'success' });
      navigation.goBack();
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const handleSkip = async () => {
    if (applyingRef.current || skipping) return;
    // Quick-scan created the list solely for this receipt; skipping means the
    // user abandoned the import, so discard the list instead of leaving an
    // empty active one on Home.
    if (autoAddAll) {
      setSkipping(true);
      try {
        await ShoppingListManager.deleteList(listId);
      } catch (error: any) {
        showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
        setSkipping(false);
        return;
      }
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.accent.blue} />
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
        styles={styles}
        textSecondary={theme.text.secondary}
      />
    );
  }

  if (!matchResult) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="No items found in receipt"
        message="The receipt has no usable line items."
        onSkip={handleSkip}
        styles={styles}
        textSecondary={theme.text.secondary}
      />
    );
  }

  const acceptedCount = acceptedMatches.length;
  const canPickFor = visibleUnmatchedList.length > 0;
  const canApply = acceptedCount > 0 || toAdd.size > 0;

  const applyLabel = (() => {
    const parts: string[] = [];
    if (acceptedCount > 0) parts.push(`Apply ${acceptedCount} price${acceptedCount === 1 ? '' : 's'}`);
    if (toAdd.size > 0) parts.push(`Add ${toAdd.size} item${toAdd.size === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'Apply';
  })();

  // The receipt is the document being reconciled, so it is rendered in its own
  // printed order rather than split into matched/unmatched buckets: a line's
  // position on the paper is how the user finds it again while holding the
  // real thing. Everything below is a lookup keyed by that line's index.
  const lineItems = receiptData.lineItems ?? [];
  const matchByReceiptIndex = new Map<number, MatchCandidate>();
  allMatches.forEach(m => matchByReceiptIndex.set(m.receiptIndex, m));
  const unmatchedIndices = new Set(visibleUnmatchedReceipt.map(e => e.index));

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ReceiptCard>
          <Text style={styles.merchant}>
            {shoppingList?.merchantName || 'RECEIPT'}
          </Text>
          <Text style={styles.receiptMeta}>
            {shoppingList?.purchaseDate || 'Date not read'}
          </Text>
          <Text style={styles.receiptMeta}>
            {acceptedCount > 0
              ? `${acceptedCount} of ${lineItems.length} lines matched to your list`
              : `${lineItems.length} line${lineItems.length === 1 ? '' : 's'} · none matched yet`}
          </Text>

          <ReceiptRule />

          {lineItems.map((item, index) => (
            <ReconciledLine
              key={index}
              item={item}
              currency={currency}
              match={matchByReceiptIndex.get(index) ?? null}
              rejected={
                matchByReceiptIndex.has(index) &&
                rejected.has(matchByReceiptIndex.get(index)!.listItem.id)
              }
              isUnmatched={unmatchedIndices.has(index)}
              inToAdd={toAdd.has(index)}
              editedName={editingNames[index] ?? item.description}
              onToggleMatch={() => {
                const m = matchByReceiptIndex.get(index);
                if (!m) return;
                if (m.method === 'manual') removeManual(m.listItem.id);
                else toggleReject(m.listItem.id);
              }}
              onToggleAdd={() => toggleToAdd(index, item.description)}
              onNameChange={name => setEditingNames(prev => ({ ...prev, [index]: name }))}
              onAssign={canPickFor ? () => setPickerReceiptIndex(index) : undefined}
            />
          ))}

          <ReceiptRule />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>
              {shoppingList?.totalAmount != null
                ? `${currency}${shoppingList.totalAmount.toFixed(2)}`
                : '—'}
            </Text>
          </View>

          {visibleUnmatchedReceipt.length > 1 && (
            <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll} activeOpacity={0.7}>
              <Text style={styles.selectAllText}>
                {allUnmatchedSelected
                  ? 'Clear the new items'
                  : `Add all ${visibleUnmatchedReceipt.length} unlisted lines`}
              </Text>
            </TouchableOpacity>
          )}
        </ReceiptCard>

        {/* A second slip: these are on the list but the till never printed
            them, so they have no line to sit beside on the receipt above. */}
        {visibleUnmatchedList.length > 0 && (
          <ReceiptCard>
            <Text style={styles.slipTitle}>NOT ON THIS RECEIPT</Text>
            <Text style={styles.slipHint}>
              Still on your list. Match one to a line above, or leave it for next time.
            </Text>
            <ReceiptRule />
            {visibleUnmatchedList.map(item => (
              <Text key={item.id} style={styles.slipItem} numberOfLines={2}>
                {item.name}
              </Text>
            ))}
          </ReceiptCard>
        )}
      </ScrollView>

      <AssignPickerModal
        visible={pickerReceiptIndex != null}
        receiptItem={pickerReceiptItem}
        currency={currency}
        options={visibleUnmatchedList}
        onPick={assignManual}
        onClose={() => setPickerReceiptIndex(null)}
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={applying || skipping}>
          {skipping ? (
            <ActivityIndicator size="small" color={theme.text.primary} />
          ) : (
            <Text style={styles.skipButtonText}>Skip</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyWrap, !canApply && styles.applyDisabled]}
          onPress={handleApply}
          disabled={!canApply || applying || skipping}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.applyGradient}
          >
            {applying ? (
              <ActivityIndicator color={theme.text.onAccent} />
            ) : (
              <Text style={styles.applyText}>{applyLabel}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface ReconciledLineProps {
  item: ReceiptLineItem;
  currency: string;
  match: MatchCandidate | null;
  rejected: boolean;
  isUnmatched: boolean;
  inToAdd: boolean;
  editedName: string;
  onToggleMatch: () => void;
  onToggleAdd: () => void;
  onNameChange: (name: string) => void;
  onAssign?: () => void;
}

/**
 * One printed receipt line, with what it resolved to written underneath it
 * the way you would annotate a paper till roll.
 *
 * Only one control is visible per line — the trailing toggle — because a
 * receipt with four icons on every row stops reading as a receipt. The
 * second, rarer action (pairing a line with an item already on the list)
 * lives on the annotation text itself, which is a tap target on unmatched
 * lines and inert everywhere else.
 */
const ReconciledLine: React.FC<ReconciledLineProps> = ({
  item, currency, match, rejected, isUnmatched, inToAdd,
  editedName, onToggleMatch, onToggleAdd, onNameChange, onAssign,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const price = item.price ?? item.unitPrice;

  // matchReceiptToList only considers lines that have both a price and a
  // description, so a line missing either is in neither bucket. It still
  // belongs on the paper — it was printed — but nothing here can act on it,
  // and handleApply would silently drop it. Show it without a control rather
  // than offering a toggle that does nothing.
  const actionable = match != null || isUnmatched;

  const toggle = match ? onToggleMatch : onToggleAdd;
  const active = match ? !rejected : inToAdd;
  const toggleLabel = match
    ? (rejected ? 'Use this match after all' : 'Ignore this match')
    : (inToAdd ? 'Do not add this line' : 'Add this line to the list');

  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Text
          style={[styles.lineDesc, rejected && styles.struck]}
          numberOfLines={3}
        >
          {item.description || '(unreadable line)'}
        </Text>
        <Text style={[styles.linePrice, rejected && styles.struck]}>
          {price != null ? `${currency}${price.toFixed(2)}` : '—'}
        </Text>
      </View>

      <View style={styles.lineNote}>
        {inToAdd ? (
          <TextInput
            style={styles.nameInput}
            value={editedName}
            onChangeText={onNameChange}
            placeholder="Name this item"
            placeholderTextColor={theme.text.tertiary}
            autoCorrect={false}
          />
        ) : match ? (
          <Text
            style={[styles.noteMatched, rejected && styles.noteIgnored, rejected && styles.struck]}
            numberOfLines={2}
          >
            {match.listItem.name}
            {match.method !== 'manual' && !rejected
              ? `  ${Math.round(match.score * 100)}%`
              : ''}
          </Text>
        ) : !actionable ? (
          <Text style={styles.noteIdle} numberOfLines={1}>
            {price == null ? 'No price read on this line' : 'No name read on this line'}
          </Text>
        ) : onAssign ? (
          <Text style={styles.noteAction} numberOfLines={1} onPress={onAssign}>
            Match to a list item
          </Text>
        ) : (
          <Text style={styles.noteIdle} numberOfLines={1}>
            Not on your list
          </Text>
        )}

        {actionable && (
          <TouchableOpacity
            onPress={toggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={toggleLabel}
          >
            <Icon
              name={active ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={active ? theme.accent.green : theme.text.tertiary}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

interface AssignPickerModalProps {
  visible: boolean;
  receiptItem: ReceiptLineItem | null;
  currency: string;
  options: Item[];
  onPick: (item: Item) => void;
  onClose: () => void;
}

const AssignPickerModal: React.FC<AssignPickerModalProps> = ({ visible, receiptItem, currency, options, onPick, onClose }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
      <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={2}>
            Assign to list item
          </Text>
          {receiptItem && (
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {receiptItem.description}
              {receiptItem.price != null ? `  ·  ${currency}${receiptItem.price.toFixed(2)}` : ''}
            </Text>
          )}
        </View>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
          {options.length === 0 ? (
            <Text style={styles.modalEmpty}>No unmatched list items to pick from.</Text>
          ) : (
            options.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.modalOption}
                onPress={() => onPick(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalOptionText} numberOfLines={2}>{item.name}</Text>
                <Icon name="chevron-forward" size={18} color={theme.text.tertiary} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
        <TouchableOpacity style={styles.modalCancel} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
  );
};

interface EmptyStateProps {
  icon: string;
  title: string;
  message: string;
  onSkip: () => void;
  styles: ReturnType<typeof createStyles>;
  textSecondary: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, message, onSkip, styles, textSecondary }) => (
  <View style={styles.center}>
    <Icon name={icon} size={56} color={textSecondary} />
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyMessage}>{message}</Text>
    <TouchableOpacity style={styles.emptyButton} onPress={onSkip}>
      <Text style={styles.skipButtonText}>Done</Text>
    </TouchableOpacity>
  </View>
);

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
    padding: SPACING.xl,
  },
  scroll: {
    padding: SPACING.lg,
    paddingBottom: 120,
  },
  // --- the receipt itself -------------------------------------------------
  // Sizes and the monospace face are deliberately the same as
  // ReceiptViewScreen's: the two screens show the same document, and the user
  // recognises the paper before they read a word of it.
  merchant: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
    letterSpacing: 1,
    textAlign: 'center',
  },
  receiptMeta: {
    fontSize: 11,
    color: theme.text.secondary,
    fontFamily: RECEIPT_FONT,
    textAlign: 'center',
    marginTop: 3,
  },
  line: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.medium,
  },
  lineTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  lineDesc: {
    flex: 1,
    fontSize: 12,
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
  },
  linePrice: {
    ...NUMERIC,
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.accent.green,
    minWidth: 60,
    textAlign: 'right',
    fontFamily: RECEIPT_FONT,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  // The annotation under a line. Tied to the line above by an indent and a
  // left rule rather than a glyph: RECEIPT_FONT is plain `monospace` on
  // Android (Droid Sans Mono), which has no U+21B3 and would draw a tofu box
  // on every row. A border cannot fail to render.
  lineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 4,
    marginLeft: SPACING.sm,
    paddingLeft: SPACING.md,
    borderLeftWidth: 2,
    borderLeftColor: theme.border.medium,
  },
  noteMatched: {
    flex: 1,
    fontSize: 12,
    color: theme.accent.green,
    fontFamily: RECEIPT_FONT,
  },
  noteIgnored: {
    color: theme.text.tertiary,
  },
  noteAction: {
    flex: 1,
    fontSize: 12,
    color: theme.accent.blue,
    fontFamily: RECEIPT_FONT,
  },
  noteIdle: {
    flex: 1,
    fontSize: 12,
    color: theme.text.tertiary,
    fontFamily: RECEIPT_FONT,
  },
  nameInput: {
    flex: 1,
    fontSize: 12,
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
    borderBottomWidth: 1,
    borderBottomColor: theme.accent.green,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
    letterSpacing: 1,
  },
  totalValue: {
    ...NUMERIC,
    fontSize: 20,
    fontWeight: '700' as const,
    color: theme.accent.green,
    fontFamily: RECEIPT_FONT,
  },
  selectAllRow: {
    alignItems: 'center',
    paddingTop: SPACING.md,
  },
  selectAllText: {
    fontSize: 12,
    color: theme.accent.blue,
    fontFamily: RECEIPT_FONT,
  },
  // --- the second slip ----------------------------------------------------
  slipTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: theme.text.primary,
    fontFamily: RECEIPT_FONT,
    letterSpacing: 1,
    textAlign: 'center',
  },
  slipHint: {
    fontSize: 11,
    color: theme.text.tertiary,
    fontFamily: RECEIPT_FONT,
    textAlign: 'center',
    marginTop: 4,
  },
  slipItem: {
    fontSize: 12,
    color: theme.text.secondary,
    fontFamily: RECEIPT_FONT,
    paddingVertical: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.overlay.dark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: theme.background.secondary,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
  },
  modalSubtitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: theme.text.secondary,
    marginTop: SPACING.xs,
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalScrollContent: {
    paddingVertical: SPACING.xs,
  },
  modalEmpty: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    textAlign: 'center',
    padding: SPACING.xl,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    gap: SPACING.md,
  },
  modalOptionText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  modalCancel: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    backgroundColor: theme.glass.subtle,
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.text.primary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: SPACING.lg,
    gap: SPACING.md,
    backgroundColor: theme.background.primary,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  skipButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: theme.border.strong,
    backgroundColor: theme.glass.strong,
    justifyContent: 'center',
  },
  skipButtonText: {
    color: theme.text.primary,
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
    // On the button gradient — see modalButtonText in HomeScreen.styles.ts.
    color: theme.text.onAccent,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  emptyButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: RADIUS.large,
    borderWidth: 1,
    borderColor: theme.border.medium,
    backgroundColor: theme.glass.subtle,
  },
});

export default ReceiptMatchScreen;
