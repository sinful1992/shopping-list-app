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
import { SPACING, TYPOGRAPHY, RADIUS, NUMERIC } from '../../styles/theme';
import type { Theme } from '../../styles/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ShoppingListManager from '../../services/ShoppingListManager';
import ItemManager from '../../services/ItemManager';
import { useUser } from '../../contexts/UserContext';
import { matchReceiptToList, MatchCandidate, MatchResult } from '../../utils/receiptMatcher';
import { Item, ReceiptData, ReceiptLineItem } from '../../models/types';

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
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [currency, setCurrency] = useState('£');
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [manualMatches, setManualMatches] = useState<MatchCandidate[]>([]);
  const [pickerReceiptIndex, setPickerReceiptIndex] = useState<number | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [unmatchedReceiptOpen, setUnmatchedReceiptOpen] = useState(false);
  const [unmatchedListOpen, setUnmatchedListOpen] = useState(false);
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
            setUnmatchedReceiptOpen(true);
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
      const parts: string[] = [];
      if (updates.length > 0) parts.push(`Updated ${updates.length} price${updates.length === 1 ? '' : 's'}`);
      if (newItems.length > 0) parts.push(`Added ${newItems.length} item${newItems.length === 1 ? '' : 's'}`);
      showAlert('Done', parts.join(' · '), undefined, { icon: 'success' });
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

  const matchCount = allMatches.length;
  const acceptedCount = acceptedMatches.length;
  const canPickFor = visibleUnmatchedList.length > 0;
  const canApply = acceptedCount > 0 || toAdd.size > 0;

  const applyLabel = (() => {
    const parts: string[] = [];
    if (acceptedCount > 0) parts.push(`Apply ${acceptedCount} price${acceptedCount === 1 ? '' : 's'}`);
    if (toAdd.size > 0) parts.push(`Add ${toAdd.size} item${toAdd.size === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'Apply';
  })();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.summary}>
          {matchCount === 0
            ? 'No matches found'
            : `Found ${matchCount} match${matchCount === 1 ? '' : 'es'} · ${visibleUnmatchedList.length} unmatched`}
        </Text>

        {allMatches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Matched</Text>
            {allMatches.map(m => {
              const isManual = m.method === 'manual';
              return (
                <MatchRow
                  key={m.listItem.id}
                  match={m}
                  currency={currency}
                  rejected={!isManual && rejected.has(m.listItem.id)}
                  isManual={isManual}
                  onToggleReject={() => (isManual ? removeManual(m.listItem.id) : toggleReject(m.listItem.id))}
                />
              );
            })}
          </View>
        )}

        {visibleUnmatchedReceipt.length > 0 && (
          <CollapsibleSection
            title={`Unmatched receipt items (${visibleUnmatchedReceipt.length})`}
            open={unmatchedReceiptOpen}
            onToggle={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setUnmatchedReceiptOpen(v => !v);
            }}
          >
            <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll} activeOpacity={0.7}>
              <Text style={styles.selectAllText}>
                {allUnmatchedSelected ? 'Deselect all' : 'Select all'}
              </Text>
              <Icon
                name={allUnmatchedSelected ? 'checkmark-circle' : 'add-circle-outline'}
                size={22}
                color={allUnmatchedSelected ? theme.accent.green : theme.text.tertiary}
              />
            </TouchableOpacity>
            {visibleUnmatchedReceipt.map(({ item, index }) => (
              <UnmatchedReceiptRow
                key={index}
                item={item}
                currency={currency}
                inToAdd={toAdd.has(index)}
                editedName={editingNames[index] ?? item.description}
                onToggleAdd={() => toggleToAdd(index, item.description)}
                onNameChange={name => setEditingNames(prev => ({ ...prev, [index]: name }))}
                onAssign={canPickFor ? () => setPickerReceiptIndex(index) : undefined}
              />
            ))}
          </CollapsibleSection>
        )}

        {visibleUnmatchedList.length > 0 && (
          <CollapsibleSection
            title={`Unmatched list items (${visibleUnmatchedList.length})`}
            open={unmatchedListOpen}
            onToggle={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setUnmatchedListOpen(v => !v);
            }}
          >
            {visibleUnmatchedList.map(item => (
              <UnmatchedListRow key={item.id} item={item} />
            ))}
          </CollapsibleSection>
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
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={applying}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyWrap, !canApply && styles.applyDisabled]}
          onPress={handleApply}
          disabled={!canApply || applying}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.applyGradient}
          >
            {applying ? (
              <ActivityIndicator color={theme.text.primary} />
            ) : (
              <Text style={styles.applyText}>{applyLabel}</Text>
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
  isManual: boolean;
  onToggleReject: () => void;
}

const MatchRow: React.FC<MatchRowProps> = ({ match, currency, rejected, isManual, onToggleReject }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const price = match.receiptItem.price ?? match.receiptItem.unitPrice;
  const badge = badgeStyle(match, theme);
  return (
    <View style={[styles.matchCard, rejected && styles.matchCardRejected]}>
      <View style={styles.matchTop}>
        <Text style={[styles.listName, rejected && styles.strikethrough]} numberOfLines={2}>
          {match.listItem.name}
        </Text>
        <Icon name="arrow-forward" size={16} color={theme.text.tertiary} style={styles.arrowIcon} />
        <Text style={[styles.receiptDesc, rejected && styles.strikethrough]} numberOfLines={2}>
          {match.receiptItem.description}
        </Text>
      </View>
      <View style={styles.matchBottom}>
        <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>
            {isManual ? 'manual' : `${Math.round(match.score * 100)}% · ${match.method}`}
          </Text>
        </View>
        <Text style={[styles.priceText, rejected && styles.strikethrough]}>
          {price != null ? `${currency}${price.toFixed(2)}` : '—'}
        </Text>
        <TouchableOpacity onPress={onToggleReject} style={styles.rejectButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon
            name={isManual ? 'close-circle-outline' : (rejected ? 'add-circle-outline' : 'close-circle-outline')}
            size={22}
            color={isManual ? theme.text.secondary : (rejected ? theme.accent.green : theme.accent.red)}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface UnmatchedReceiptRowProps {
  item: ReceiptLineItem;
  currency: string;
  inToAdd: boolean;
  editedName: string;
  onToggleAdd: () => void;
  onNameChange: (name: string) => void;
  onAssign?: () => void;
}

const UnmatchedReceiptRow: React.FC<UnmatchedReceiptRowProps> = ({
  item, currency, inToAdd, editedName, onToggleAdd, onNameChange, onAssign,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.infoRow, inToAdd && styles.infoRowSelected]}>
      {inToAdd ? (
        <TextInput
          style={styles.nameInput}
          value={editedName}
          onChangeText={onNameChange}
          placeholder="Item name"
          placeholderTextColor={theme.text.tertiary}
          autoCorrect={false}
        />
      ) : (
        <Text style={styles.infoText} numberOfLines={2}>{item.description}</Text>
      )}
      <Text style={styles.infoPrice}>
        {item.price != null ? `${currency}${item.price.toFixed(2)}` : '—'}
      </Text>
      {onAssign && !inToAdd && (
        <TouchableOpacity onPress={onAssign} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Assign to a list item">
          <Icon name="link-outline" size={20} color={theme.accent.blue} style={styles.assignIcon} />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onToggleAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={inToAdd ? 'Remove from items to add' : 'Add to list'}>
        <Icon
          name={inToAdd ? 'checkmark-circle' : 'add-circle-outline'}
          size={22}
          color={inToAdd ? theme.accent.green : theme.text.tertiary}
          style={styles.assignIcon}
        />
      </TouchableOpacity>
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

const UnmatchedListRow: React.FC<{ item: Item }> = ({ item }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoText} numberOfLines={2}>{item.name}</Text>
    </View>
  );
};

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, open, onToggle, children }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.collapseHeader} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.sectionLabel}>{title}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.text.secondary} />
      </TouchableOpacity>
      {open && <View>{children}</View>}
    </View>
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

function badgeStyle(match: MatchCandidate, theme: Theme): { bg: string; border: string; fg: string } {
  if (match.method === 'manual') {
    return { bg: theme.accent.blueSubtle, border: theme.accent.blueDim, fg: theme.accent.blue };
  }
  if (match.score >= 0.9) {
    return { bg: 'rgba(48, 209, 88, 0.18)', border: theme.accent.greenDim, fg: theme.accent.green };
  }
  if (match.score >= 0.7) {
    return { bg: 'rgba(255, 179, 64, 0.18)', border: 'rgba(255, 179, 64, 0.35)', fg: theme.accent.orange };
  }
  return { bg: 'rgba(255, 214, 10, 0.18)', border: theme.accent.yellowDim, fg: theme.accent.yellow };
}

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
  summary: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    marginBottom: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    color: theme.text.tertiary,
    marginBottom: SPACING.md,
  },
  collapseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  matchCard: {
    backgroundColor: theme.background.secondary,
    borderRadius: RADIUS.xlarge,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
    color: theme.text.primary,
  },
  arrowIcon: {
    marginHorizontal: SPACING.xs,
  },
  receiptDesc: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
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
    ...NUMERIC,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.accent.green,
    marginLeft: 'auto',
  },
  rejectButton: {
    padding: SPACING.xs,
  },
  selectAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  selectAllText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
    gap: SPACING.md,
  },
  infoRowSelected: {
    backgroundColor: 'rgba(48, 209, 88, 0.08)',
  },
  infoText: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
  },
  nameInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    borderBottomWidth: 1,
    borderBottomColor: theme.accent.green,
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  infoPrice: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.tertiary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  assignIcon: {
    marginLeft: SPACING.xs,
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
    color: theme.text.primary,
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
