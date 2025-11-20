import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import HistoryTracker from '../../services/HistoryTracker';
import AuthenticationModule from '../../services/AuthenticationModule';
import { ShoppingList, User } from '../../models/types';
import FilterModal, { FilterOptions } from '../../components/FilterModal';
import SortDropdown, { SortOption } from '../../components/SortDropdown';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, SHADOWS } from '../../styles/theme';

/**
 * HistoryScreen
 * Display completed shopping trips with search and filters
 * Implements Req 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
const HistoryScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [user, setUser] = useState<User | null>(null);

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

  useEffect(() => {
    loadUser();
  }, []);

  // Auto-archive old lists on mount
  useEffect(() => {
    if (user?.familyGroupId) {
      autoArchiveOldLists();
    }
  }, [user?.familyGroupId]);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (user) {
      loadHistory(true);
    }
  }, [user, debouncedSearchQuery, receiptFilter, activeTab, currentSort, currentFilters]);

  // Load available stores for filter
  useEffect(() => {
    const loadStores = async () => {
      if (!user?.familyGroupId) return;
      try {
        const lists = await HistoryTracker.getCompletedLists(user.familyGroupId);
        const stores = [...new Set(lists.map(l => l.storeName).filter(Boolean))] as string[];
        setAvailableStores(stores);
      } catch (error) {
        console.error('Failed to load stores:', error);
      }
    };
    loadStores();
  }, [user?.familyGroupId]);

  const autoArchiveOldLists = async () => {
    if (!user?.familyGroupId) return;

    try {
      const archivedCount = await HistoryTracker.autoArchiveOldLists(user.familyGroupId);
      if (archivedCount > 0) {
        console.log(`Auto-archived ${archivedCount} old lists`);
      }
    } catch (error) {
      console.error('Auto-archive failed:', error);
    }
  };

  const loadUser = async () => {
    try {
      const currentUser = await AuthenticationModule.getCurrentUser();
      setUser(currentUser);
    } catch (error: any) {
      Alert.alert('Error', error.message);
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
          (list.receiptData?.totalAmount || 0) >= currentFilters.minPrice!
        );
      }
      if (currentFilters.maxPrice !== null) {
        filteredLists = filteredLists.filter(list =>
          (list.receiptData?.totalAmount || 0) <= currentFilters.maxPrice!
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
            const amountA = a.receiptData?.totalAmount || 0;
            const amountB = b.receiptData?.totalAmount || 0;
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
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
    navigation.navigate('HistoryDetail' as never, { listId } as never);
  };

  const renderListItem = ({ item }: { item: ShoppingList }) => {
    const date = new Date(item.completedAt || 0).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const dateWithStore = item.storeName ? `${date} / ${item.storeName}` : date;

    const total = item.receiptData?.totalAmount
      ? `${item.receiptData.currency || '£'}${item.receiptData.totalAmount.toFixed(2)}`
      : 'No total';

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => handleListPress(item.id)}
      >
        <Text style={styles.listDate}>{dateWithStore}</Text>
        <Text style={styles.listTotal}>Total: {total}</Text>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loading) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

  if (loading && lists.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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
          placeholderTextColor="#6E6E73"
          value={searchQuery}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
        />
        <View style={styles.searchActions}>
          <TouchableOpacity
            style={styles.filterIconButton}
            onPress={() => setFilterModalVisible(true)}
          >
            <Text style={styles.filterIconText}>⚙️ Filter</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#a0a0a0',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6E6E73',
  },
  tabTextActive: {
    color: '#007AFF',
  },
  searchContainer: {
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 10,
  },
  searchActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  filterIconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  filterIconText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  filterButtonText: {
    fontSize: 14,
    color: '#a0a0a0',
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingBottom: 20,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 15,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 15,
  },
  listDate: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  listTotal: {
    fontSize: 16,
    color: '#30D158',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default HistoryScreen;
