import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { HistoryStackParamList } from '../../types/navigation';
import HistoryTracker from '../../services/HistoryTracker';
import LocalStorageManager from '../../services/LocalStorageManager';
import ShoppingListManager from '../../services/ShoppingListManager';
import { ShoppingList } from '../../models/types';
import { useUser } from '../../contexts/UserContext';
import FilterModal, { FilterOptions } from '../../components/FilterModal';
import SortDropdown, { SortOption } from '../../components/SortDropdown';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';
import { NUMERIC } from '../../styles/theme';
import Icon from 'react-native-vector-icons/Ionicons';

/**
 * HistoryScreen
 * Display completed shopping trips with search and filters
 * Implements Req 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
const HistoryScreen = () => {
  const navigation = useNavigation<StackNavigationProp<HistoryStackParamList>>();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const user = useUser();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lists, setLists] = useState<ShoppingList[]>([]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'with' | 'without'>('all');
  const [activeTab, setActiveTab] = useState<'recent' | 'archived'>('recent');

  // Filter modal state
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    startDate: null,
    endDate: null,
    stores: [],
    minPrice: null,
    maxPrice: null,
    categories: [],
    hasReceipt: 'all',
  });
  const [availableStores, setAvailableStores] = useState<string[]>([]);

  // Sort state
  const [currentSort, setCurrentSort] = useState<SortOption>({
    field: 'date',
    order: 'desc',
    label: 'Date (newest first)',
  });

  // Pagination
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 20;

  // Incremented by useFocusEffect to trigger a reload when the screen regains focus
  const [focusRefreshKey, setFocusRefreshKey] = useState(0);
  const initialLoadDone = useRef(false);

  // Reload when screen regains focus so totals written in HistoryDetail are immediately visible
  useFocusEffect(useCallback(() => {
    if (initialLoadDone.current) {
      setFocusRefreshKey(k => k + 1);
    }
  }, [])); // intentionally empty — just signals focus, not a data dependency

  // Auto-archive old lists on mount
  useEffect(() => {
    if (user?.familyGroupId) {
      autoArchiveOldLists();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.familyGroupId]);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const startDateMs = currentFilters.startDate?.getTime();
  const endDateMs = currentFilters.endDate?.getTime();
  const storesKey = currentFilters.stores.join(',');

  useEffect(() => {
    if (user) {
      loadHistory(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, focusRefreshKey, debouncedSearchQuery, receiptFilter, activeTab, currentSort.field, currentSort.order,
      startDateMs, endDateMs, storesKey, currentFilters.minPrice, currentFilters.maxPrice,
      currentFilters.hasReceipt]);

  // Load available stores for filter
  useEffect(() => {
    const loadStores = async () => {
      if (!user?.familyGroupId) return;
      try {
        const completedLists = await HistoryTracker.getCompletedLists(user.familyGroupId);
        const stores = [...new Set(completedLists.map(l => l.storeName).filter(Boolean))] as string[];
        setAvailableStores(stores);
      } catch {
        // Failed to load stores - filter will be unavailable
      }
    };
    loadStores();
  }, [user?.familyGroupId]);

  const autoArchiveOldLists = async () => {
    if (!user?.familyGroupId) return;

    try {
      await HistoryTracker.autoArchiveOldLists(user.familyGroupId);
    } catch {
      // Auto-archive failed - not critical
    }
  };

  const loadHistory = async (reset: boolean = false) => {
    if (!user?.familyGroupId) return;

    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      }

      const currentOffset = reset ? 0 : offset;

      // Apply filters and search
      let filteredLists: ShoppingList[];

      if (debouncedSearchQuery.trim()) {
        // Enhanced search: list names, item names, store names
        filteredLists = await HistoryTracker.searchLists(
          user.familyGroupId,
          debouncedSearchQuery
        );
        // Filter by archive status
        filteredLists = filteredLists.filter(list =>
          activeTab === 'archived' ? list.archived : !list.archived
        );
      } else if (activeTab === 'archived') {
        // Get archived lists
        filteredLists = await HistoryTracker.getArchivedLists(user.familyGroupId);
      } else {
        // Get non-archived lists
        filteredLists = await HistoryTracker.getNonArchivedLists(user.familyGroupId);

        // Apply receipt filter if needed
        if (receiptFilter === 'with') {
          filteredLists = filteredLists.filter(list => list.receiptUrl !== null);
        } else if (receiptFilter === 'without') {
          filteredLists = filteredLists.filter(list => list.receiptUrl === null);
        }
      }

      // Apply advanced filters from FilterModal
      if (currentFilters.startDate) {
        filteredLists = filteredLists.filter(list =>
          (list.completedAt || 0) >= currentFilters.startDate!.getTime()
        );
      }
      if (currentFilters.endDate) {
        filteredLists = filteredLists.filter(list =>
          (list.completedAt || 0) <= currentFilters.endDate!.getTime()
        );
      }
      if (currentFilters.stores.length > 0) {
        filteredLists = filteredLists.filter(list =>
          list.storeName && currentFilters.stores.includes(list.storeName)
        );
      }
      if (currentFilters.minPrice !== null) {
        filteredLists = filteredLists.filter(list =>
          (list.totalAmount || 0) >= currentFilters.minPrice!
        );
      }
      if (currentFilters.maxPrice !== null) {
        filteredLists = filteredLists.filter(list =>
          (list.totalAmount || 0) <= currentFilters.maxPrice!
        );
      }
      if (currentFilters.hasReceipt !== 'all') {
        filteredLists = filteredLists.filter(list =>
          currentFilters.hasReceipt === 'with'
            ? list.receiptUrl !== null
            : list.receiptUrl === null
        );
      }

      // Apply sorting
      filteredLists = filteredLists.sort((a, b) => {
        let comparison = 0;

        switch (currentSort.field) {
          case 'date':
            comparison = (a.completedAt || 0) - (b.completedAt || 0);
            break;
          case 'amount':
            const amountA = a.totalAmount || 0;
            const amountB = b.totalAmount || 0;
            comparison = amountA - amountB;
            break;
          case 'store':
            const storeA = a.storeName || '';
            const storeB = b.storeName || '';
            comparison = storeA.localeCompare(storeB);
            break;
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
        }

        return currentSort.order === 'desc' ? -comparison : comparison;
      });

      // Paginate
      const paginatedLists = filteredLists.slice(
        currentOffset,
        currentOffset + pageSize
      );

      if (reset) {
        setLists(paginatedLists);
      } else {
        setLists((prev) => [...prev, ...paginatedLists]);
      }

      setHasMore(currentOffset + pageSize < filteredLists.length);
      setOffset(currentOffset + pageSize);
      initialLoadDone.current = true;

      // Background: compute and persist totalAmount for any lists missing it
      if (user?.familyGroupId) {
        backfillMissingTotals(paginatedLists);
      }
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const backfillMissingTotals = async (displayedLists: ShoppingList[]) => {
    const listsNeedingTotal = displayedLists.filter(l => l.totalAmount == null);
    if (listsNeedingTotal.length === 0) return;

    try {
      const listIds = listsNeedingTotal.map(l => l.id);
      const allItems = await LocalStorageManager.getItemsForLists(listIds);

      const totalsByListId = new Map<string, number>();
      for (const item of allItems) {
        const prev = totalsByListId.get(item.listId) ?? 0;
        totalsByListId.set(item.listId, prev + (item.price ?? 0) * (item.unitQty ?? 1));
      }

      const updates: Promise<void>[] = [];
      for (const list of listsNeedingTotal) {
        const computed = totalsByListId.get(list.id) ?? 0;
        updates.push(ShoppingListManager.updateList(list.id, { totalAmount: computed }).then(() => {}));
      }
      await Promise.all(updates);

      // Patch state so the list refreshes without a full reload
      setLists(prev => prev.map(l => {
        if (l.totalAmount != null) return l;
        const computed = totalsByListId.get(l.id);
        return computed != null ? { ...l, totalAmount: computed } : l;
      }));
    } catch {
      // Backfill is best-effort; failures are silent
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadHistory(true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadHistory(false);
    }
  };

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
    },
    []
  );

  const handleReceiptFilterChange = (filter: 'all' | 'with' | 'without') => {
    setReceiptFilter(filter);
  };

  const handleApplyFilters = (filters: FilterOptions) => {
    setCurrentFilters(filters);
    setFilterModalVisible(false);
  };

  const handleListPress = (listId: string) => {
    navigation.navigate('HistoryDetail', { listId });
  };

  const renderListItem = ({ item }: { item: ShoppingList }) => {
    const date = new Date(item.completedAt || 0).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const dateWithStore = item.storeName ? `${date} / ${item.storeName}` : date;

    const total = item.totalAmount != null
      ? `${item.currency || '£'}${item.totalAmount.toFixed(2)}`
      : 'No total';

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => handleListPress(item.id)}
      >
        <Text style={styles.listName}>{item.name}</Text>
        <View style={styles.listItemRow}>
          <Text style={styles.listDate}>{dateWithStore}</Text>
          <Text style={styles.listTotal}>Total: {total}</Text>
        </View>
        {item.uncheckedItemsCount != null && item.uncheckedItemsCount > 0 && (
          <Text style={styles.itemsNotBought}>
            {item.uncheckedItemsCount} item{item.uncheckedItemsCount === 1 ? '' : 's'} not bought
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={theme.accent.blue} />
      </View>
    );
  };

  if (loading && lists.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.accent.blue} />
        <Text style={styles.loadingText}>Loading history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'recent' && styles.tabActive]}
          onPress={() => setActiveTab('recent')}
        >
          <Text style={[styles.tabText, activeTab === 'recent' && styles.tabTextActive]}>
            Recent
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'archived' && styles.tabActive]}
          onPress={() => setActiveTab('archived')}
        >
          <Text style={[styles.tabText, activeTab === 'archived' && styles.tabTextActive]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar with Sort */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'archived' ? "Search archived lists..." : "Search by list name, store, or item..."}
          placeholderTextColor={theme.text.tertiary}
          value={searchQuery}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
        />
        <View style={styles.searchActions}>
          <TouchableOpacity
            style={styles.filterIconButton}
            onPress={() => setFilterModalVisible(true)}
          >
            <Text style={styles.filterIconText}><Icon name="options-outline" size={14} color={theme.text.primary} /> Filter</Text>
          </TouchableOpacity>
          <SortDropdown
            currentSort={currentSort}
            onSelect={setCurrentSort}
          />
        </View>
      </View>

      {/* Receipt Filter - Only show on Recent tab */}
      {activeTab === 'recent' && (
        <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            receiptFilter === 'all' && styles.filterButtonActive,
          ]}
          onPress={() => handleReceiptFilterChange('all')}
        >
          <Text
            style={[
              styles.filterButtonText,
              receiptFilter === 'all' && styles.filterButtonTextActive,
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            receiptFilter === 'with' && styles.filterButtonActive,
          ]}
          onPress={() => handleReceiptFilterChange('with')}
        >
          <Text
            style={[
              styles.filterButtonText,
              receiptFilter === 'with' && styles.filterButtonTextActive,
            ]}
          >
            With Receipt
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterButton,
            receiptFilter === 'without' && styles.filterButtonActive,
          ]}
          onPress={() => handleReceiptFilterChange('without')}
        >
          <Text
            style={[
              styles.filterButtonText,
              receiptFilter === 'without' && styles.filterButtonTextActive,
            ]}
          >
            No Receipt
          </Text>
        </TouchableOpacity>
        </View>
      )}

      {/* List */}
      {lists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No completed shopping trips</Text>
        </View>
      ) : (
        <FlatList
          data={lists}
          renderItem={renderListItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          // Performance optimizations
          getItemLayout={(data, index) => ({
            length: 100, // Approximate list item height
            offset: 100 * index,
            index,
          })}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          initialNumToRender={15}
        />
      )}

      {/* Filter Modal */}
      <FilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        onApply={handleApplyFilters}
        currentFilters={currentFilters}
        availableStores={availableStores}
        availableCategories={[]}
      />
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: theme.text.secondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: theme.glass.subtle,
    borderBottomWidth: 1,
    borderBottomColor: theme.border.subtle,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.accent.blue,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text.tertiary,
  },
  tabTextActive: {
    color: theme.accent.blue,
  },
  searchContainer: {
    padding: 15,
  },
  searchInput: {
    backgroundColor: theme.glass.subtle,
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    color: theme.text.primary,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    marginBottom: 10,
  },
  searchActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  filterIconButton: {
    backgroundColor: theme.glass.subtle,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  filterIconText: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.glass.subtle,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  filterButtonActive: {
    backgroundColor: theme.accent.blueSubtle,
    borderColor: theme.accent.blueDim,
  },
  filterButtonText: {
    fontSize: 14,
    color: theme.text.secondary,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: theme.accent.blue,
  },
  listContent: {
    paddingBottom: 20,
  },
  listItem: {
    flexDirection: 'column',
    backgroundColor: theme.glass.subtle,
    marginHorizontal: 15,
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    padding: 15,
  },
  listName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listDate: {
    fontSize: 13,
    color: theme.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  listTotal: {
    ...NUMERIC,
    fontSize: 15,
    color: theme.accent.green,
    fontWeight: '700',
  },
  itemsNotBought: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '500',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: theme.text.secondary,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default HistoryScreen;
