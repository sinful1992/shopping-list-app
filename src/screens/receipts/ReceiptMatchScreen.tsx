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
import { matchReceiptToList } from '../../utils/receiptMatcher';
import {
  groupLinesByItem, planItemUpdates, priceFromLines, ReceiptLink as Link, ReceiptLinks,
} from '../../utils/receiptLinks';
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
  const [listItems, setListItems] = useState<Item[]>([]);
  // Lines the matcher can act on: both a price and a description were read.
  const [actionable, setActionable] = useState<Set<number>>(new Set());
  const [links, setLinks] = useState<ReceiptLinks>({});
  const [pickerReceiptIndex, setPickerReceiptIndex] = useState<number | null>(null);
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
        setListItems(items);

        if (list.receiptData?.lineItems?.length) {
          // Every item is a candidate, priced or not: an item priced while
          // shopping is still what that receipt line paid for, and leaving it
          // out made the line look unlisted and offered to add it twice.
          const result = matchReceiptToList(list.receiptData.lineItems, items);

          const initial: ReceiptLinks = {};
          result.matches.forEach(m => {
            // A fuzzy match that would overwrite a price the user already
            // entered starts ignored, so the overwrite is a choice they make
            // with the old price in view rather than something done for them.
            const disputed =
              m.listItem.price != null &&
              m.score < 1 &&
              priceFromLines([m.receiptItem], m.listItem) !== m.listItem.price;
            initial[m.receiptIndex] = {
              listItemId: m.listItem.id,
              method: m.method,
              score: m.score,
              ignored: disputed,
            };
          });
          setLinks(initial);
          setActionable(new Set([
            ...result.matches.map(m => m.receiptIndex),
            ...result.unmatchedReceipt.map(e => e.index),
          ]));

          if (autoAddAll) {
            setToAdd(new Set(result.unmatchedReceipt.map(e => e.index)));
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

  const lineItems = useMemo(() => receiptData?.lineItems ?? [], [receiptData]);

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    listItems.forEach(i => map.set(i.id, i));
    return map;
  }, [listItems]);

  const linesByItem = useMemo(() => groupLinesByItem(links), [links]);

  const pendingPriceByItem = useMemo(() => {
    const map = new Map<string, number | null>();
    linesByItem.forEach((indices, itemId) => {
      const item = itemsById.get(itemId);
      if (!item) return;
      map.set(itemId, priceFromLines(indices.map(i => lineItems[i]), item));
    });
    return map;
  }, [linesByItem, itemsById, lineItems]);

  const unlinkedLines = useMemo(
    () => lineItems
      .map((item, index) => ({ item, index }))
      .filter(e => actionable.has(e.index) && links[e.index] == null),
    [lineItems, actionable, links],
  );

  const itemsNotOnReceipt = useMemo(
    () => listItems.filter(i => !linesByItem.has(i.id)),
    [listItems, linesByItem],
  );

  const setLink = (index: number, link: Link | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLinks(prev => {
      const next = { ...prev };
      if (link) next[index] = link;
      else delete next[index];
      return next;
    });
    if (link) {
      setToAdd(prev => {
        if (!prev.has(index)) return prev;
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const toggleIgnored = (index: number) => {
    const link = links[index];
    if (!link) return;
    setLink(index, { ...link, ignored: !link.ignored });
  };

  const assignManual = (listItem: Item) => {
    if (pickerReceiptIndex == null) return;
    setLink(pickerReceiptIndex, { listItemId: listItem.id, method: 'manual', score: 1, ignored: false });
    setPickerReceiptIndex(null);
  };

  const removeLink = () => {
    if (pickerReceiptIndex == null) return;
    setLink(pickerReceiptIndex, null);
    setPickerReceiptIndex(null);
  };

  const allUnlinkedSelected =
    unlinkedLines.length > 0 && unlinkedLines.every(e => toAdd.has(e.index));

  const toggleSelectAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (allUnlinkedSelected) {
      setToAdd(prev => {
        const next = new Set(prev);
        unlinkedLines.forEach(e => next.delete(e.index));
        return next;
      });
      setEditingNames(prev => {
        const next = { ...prev };
        unlinkedLines.forEach(e => { delete next[e.index]; });
        return next;
      });
    } else {
      setToAdd(prev => {
        const next = new Set(prev);
        unlinkedLines.forEach(e => next.add(e.index));
        return next;
      });
      setEditingNames(prev => {
        const next = { ...prev };
        unlinkedLines.forEach(e => {
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

    const updates = planItemUpdates(linesByItem, lineItems, itemsById);

    const newItems = Array.from(toAdd)
      .filter(idx => links[idx] == null && actionable.has(idx))
      .map(idx => {
        const line = lineItems[idx];
        const name = (editingNames[idx] ?? line.description).trim();
        if (!name) return null;
        const price = sanitizePrice(line.price ?? line.unitPrice);
        return { name, price: price ?? undefined, checked: true };
      })
      .filter((x): x is { name: string; price: number | undefined; checked: true } => x !== null);

    if (updates.length === 0 && newItems.length === 0) return;

    applyingRef.current = true;
    setApplying(true);
    try {
      const written: Item[] = [];
      if (newItems.length > 0) {
        if (!userId) throw new Error('User not authenticated');
        written.push(...await ItemManager.addItemsBatch(listId, newItems, userId));
      }
      if (updates.length > 0) {
        written.push(...await ItemManager.updateItemsBatch(updates));
      }
      // The receipt is the most exact price source the app gets; without this
      // it never reached price history, only a check-off in the shop did.
      written.filter(i => i.checked).forEach(i => ItemManager.recordPurchase(i));
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
      if (updates.length > 0) parts.push(`Updated ${updates.length} item${updates.length === 1 ? '' : 's'}`);
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

  if (lineItems.length === 0) {
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

  const linkCount = Object.keys(links).length;
  const acceptedLineCount = Object.values(links).filter(l => !l.ignored).length;
  const canApply = linesByItem.size > 0 || toAdd.size > 0;

  const applyLabel = (() => {
    const parts: string[] = [];
    if (linesByItem.size > 0) parts.push(`Apply ${linesByItem.size} price${linesByItem.size === 1 ? '' : 's'}`);
    if (toAdd.size > 0) parts.push(`Add ${toAdd.size} item${toAdd.size === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'Apply';
  })();

  const pickerLink = pickerReceiptIndex != null ? links[pickerReceiptIndex] ?? null : null;

  // The receipt is the document being reconciled, so it is rendered in its own
  // printed order rather than split into matched/unmatched buckets: a line's
  // position on the paper is how the user finds it again while holding the
  // real thing. Everything below is a lookup keyed by that line's index.
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
            {/* Counted off every link, not the accepted ones: ignoring every
                match should not read as the scan having found none. */}
            {linkCount > 0
              ? `${acceptedLineCount} of ${lineItems.length} lines matched to your list`
              : `${lineItems.length} line${lineItems.length === 1 ? '' : 's'} · none matched yet`}
          </Text>

          <ReceiptRule />

          {lineItems.map((item, index) => {
            const link = links[index] ?? null;
            const linkedItem = link ? itemsById.get(link.listItemId) ?? null : null;
            const siblingCount = link && !link.ignored
              ? linesByItem.get(link.listItemId)?.length ?? 1
              : 1;
            // Accepted: the price this item will get from all its lines.
            // Ignored: what this line alone would have set it to.
            const nextPrice = linkedItem
              ? (link!.ignored
                  ? priceFromLines([item], linkedItem)
                  : pendingPriceByItem.get(linkedItem.id) ?? null)
              : null;
            const previousPrice =
              linkedItem && linkedItem.price != null && nextPrice !== linkedItem.price
                ? linkedItem.price
                : null;
            return (
              <ReconciledLine
                key={index}
                item={item}
                currency={currency}
                link={link}
                linkedItem={linkedItem}
                siblingCount={siblingCount}
                previousPrice={previousPrice}
                isActionable={actionable.has(index)}
                inToAdd={toAdd.has(index)}
                editedName={editingNames[index] ?? item.description}
                onToggleLink={() => toggleIgnored(index)}
                onToggleAdd={() => toggleToAdd(index, item.description)}
                onNameChange={name => setEditingNames(prev => ({ ...prev, [index]: name }))}
                onPick={listItems.length > 0 ? () => setPickerReceiptIndex(index) : undefined}
                styles={styles}
                theme={theme}
              />
            );
          })}

          <ReceiptRule />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>
              {shoppingList?.totalAmount != null
                ? `${currency}${shoppingList.totalAmount.toFixed(2)}`
                : '—'}
            </Text>
          </View>

          {unlinkedLines.length > 1 && (
            <TouchableOpacity style={styles.selectAllRow} onPress={toggleSelectAll} activeOpacity={0.7}>
              <Text style={styles.selectAllText}>
                {allUnlinkedSelected
                  ? 'Clear the new items'
                  : `Add all ${unlinkedLines.length} unlisted lines`}
              </Text>
            </TouchableOpacity>
          )}
        </ReceiptCard>

        {/* A second slip: these are on the list but the till never printed
            them, so they have no line to sit beside on the receipt above. */}
        {itemsNotOnReceipt.length > 0 && (
          <ReceiptCard>
            <Text style={styles.slipTitle}>NOT ON THIS RECEIPT</Text>
            <Text style={styles.slipHint}>
              Still on your list. Match one to a line above, or leave it for next time.
            </Text>
            <ReceiptRule />
            {itemsNotOnReceipt.map(item => (
              <Text key={item.id} style={styles.slipItem} numberOfLines={2}>
                {item.name}
              </Text>
            ))}
          </ReceiptCard>
        )}
      </ScrollView>

      <AssignPickerModal
        visible={pickerReceiptIndex != null}
        receiptItem={pickerReceiptIndex != null ? lineItems[pickerReceiptIndex] ?? null : null}
        currency={currency}
        options={listItems}
        currentItemId={pickerLink?.listItemId ?? null}
        linesByItem={linesByItem}
        lineItems={lineItems}
        pickerIndex={pickerReceiptIndex}
        onPick={assignManual}
        onRemove={pickerLink ? removeLink : undefined}
        onClose={() => setPickerReceiptIndex(null)}
        styles={styles}
        theme={theme}
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
  link: Link | null;
  linkedItem: Item | null;
  siblingCount: number;
  previousPrice: number | null;
  isActionable: boolean;
  inToAdd: boolean;
  editedName: string;
  onToggleLink: () => void;
  onToggleAdd: () => void;
  onNameChange: (name: string) => void;
  onPick?: () => void;
  // Handed down rather than rebuilt per row, the way EmptyState already takes
  // them: this component renders once per printed line, and the corpus has a
  // 36-line receipt. Calling useTheme + StyleSheet.create in here would mean
  // 36 stylesheets per render for one screen.
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}

/**
 * One printed receipt line, with what it resolved to written underneath it
 * the way you would annotate a paper till roll.
 *
 * Only one control is visible per line — the trailing toggle — because a
 * receipt with four icons on every row stops reading as a receipt. Choosing
 * or changing which list item the line pays for lives on the annotation text
 * itself, which opens the picker on every line that can be matched.
 */
const ReconciledLine: React.FC<ReconciledLineProps> = ({
  item, currency, link, linkedItem, siblingCount, previousPrice, isActionable, inToAdd,
  editedName, onToggleLink, onToggleAdd, onNameChange, onPick,
  styles, theme,
}) => {
  const price = item.price ?? item.unitPrice;
  const ignored = link?.ignored ?? false;
  const linked = link != null && linkedItem != null;

  // matchReceiptToList only considers lines that have both a price and a
  // description. A line missing either still belongs on the paper — it was
  // printed — but nothing here can act on it, so it shows without a control.
  const toggle = linked ? onToggleLink : onToggleAdd;
  const active = linked ? !ignored : inToAdd;
  const toggleLabel = linked
    ? (ignored ? 'Use this match after all' : 'Ignore this match')
    : (inToAdd ? 'Do not add this line' : 'Add this line to the list');

  const linkedNote = linked
    ? [
        linkedItem!.name,
        link!.method !== 'manual' && !ignored ? `${Math.round(link!.score * 100)}%` : '',
        siblingCount > 1 ? `${siblingCount} lines` : '',
        previousPrice != null ? `was ${currency}${previousPrice.toFixed(2)}` : '',
      ].filter(Boolean).join('  ')
    : '';

  return (
    <View style={styles.line}>
      <View style={styles.lineTop}>
        <Text
          style={[styles.lineDesc, ignored && styles.struck]}
          numberOfLines={3}
        >
          {item.description || '(unreadable line)'}
        </Text>
        <Text style={[styles.linePrice, ignored && styles.struck]}>
          {price != null ? `${currency}${price.toFixed(2)}` : '—'}
        </Text>
      </View>

      <View style={styles.lineNote}>
        {!isActionable ? (
          <Text style={styles.noteIdle} numberOfLines={1}>
            {price == null ? 'No price read on this line' : 'No name read on this line'}
          </Text>
        ) : inToAdd && !linked ? (
          <TextInput
            style={styles.nameInput}
            value={editedName}
            onChangeText={onNameChange}
            placeholder="Name this item"
            placeholderTextColor={theme.text.tertiary}
            autoCorrect={false}
          />
        ) : linked ? (
          <Text
            style={[styles.noteMatched, ignored && styles.noteIgnored, ignored && styles.struck]}
            numberOfLines={2}
            onPress={onPick}
            accessibilityRole={onPick ? 'button' : undefined}
            accessibilityLabel={onPick ? `Change the list item matched to "${item.description}"` : undefined}
          >
            {linkedNote}
          </Text>
        ) : onPick ? (
          <Text
            style={styles.noteAction}
            numberOfLines={1}
            onPress={onPick}
            accessibilityRole="button"
            accessibilityLabel={`Match "${item.description}" to an item on your list`}
          >
            Match to a list item
          </Text>
        ) : (
          <Text style={styles.noteIdle} numberOfLines={1}>
            Not on your list
          </Text>
        )}

        {isActionable && (
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
  currentItemId: string | null;
  linesByItem: Map<string, number[]>;
  lineItems: ReceiptLineItem[];
  pickerIndex: number | null;
  onPick: (item: Item) => void;
  onRemove?: () => void;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}

/**
 * Every list item is offered, not only the unmatched ones: a wrong match is
 * corrected by picking the right item here, and an item already matched
 * elsewhere can take this line too (the same product rung up twice). Items
 * with no line yet are listed first because they are the likely answer.
 */
const AssignPickerModal: React.FC<AssignPickerModalProps> = ({
  visible, receiptItem, currency, options, currentItemId, linesByItem, lineItems, pickerIndex,
  onPick, onRemove, onClose, styles, theme,
}) => {
  const sorted = useMemo(() => {
    const free = options.filter(i => !linesByItem.has(i.id));
    const taken = options.filter(i => linesByItem.has(i.id));
    return [...free, ...taken];
  }, [options, linesByItem]);

  return (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose}>
      <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={2}>
            {currentItemId ? 'Change match' : 'Match to a list item'}
          </Text>
          {receiptItem && (
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {receiptItem.description}
              {receiptItem.price != null ? `  ·  ${currency}${receiptItem.price.toFixed(2)}` : ''}
            </Text>
          )}
        </View>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
          {sorted.length === 0 ? (
            <Text style={styles.modalEmpty}>This list has no items to pick from.</Text>
          ) : (
            sorted.map(item => {
              const isCurrent = item.id === currentItemId;
              const otherLines = (linesByItem.get(item.id) ?? []).filter(i => i !== pickerIndex);
              const note = otherLines.length > 0
                ? `Also on: ${otherLines.map(i => lineItems[i]?.description || '(unreadable line)').join(', ')}`
                : null;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.modalOption}
                  onPress={() => (isCurrent ? onClose() : onPick(item))}
                  activeOpacity={0.7}
                  accessibilityState={{ selected: isCurrent }}
                >
                  <View style={styles.modalOptionBody}>
                    <Text style={styles.modalOptionText} numberOfLines={2}>{item.name}</Text>
                    {note && (
                      <Text style={styles.modalOptionNote} numberOfLines={1}>{note}</Text>
                    )}
                  </View>
                  <Icon
                    name={isCurrent ? 'checkmark' : 'chevron-forward'}
                    size={18}
                    color={isCurrent ? theme.accent.green : theme.text.tertiary}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
        {onRemove && (
          <TouchableOpacity style={styles.modalRemove} onPress={onRemove} activeOpacity={0.7}>
            <Text style={styles.modalRemoveText}>Remove match</Text>
          </TouchableOpacity>
        )}
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
  modalOptionBody: {
    flex: 1,
  },
  modalOptionText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  modalOptionNote: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: theme.text.tertiary,
    marginTop: 2,
  },
  modalRemove: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
  },
  modalRemoveText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: theme.accent.red,
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
