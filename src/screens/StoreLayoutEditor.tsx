import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import ReorderableList, {
  ReorderableListReorderEvent,
  reorderItems,
  useReorderableDrag,
  useIsActive,
} from 'react-native-reorderable-list';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CategoryService, { CategoryType } from '../services/CategoryService';
import StoreLayoutService from '../services/StoreLayoutService';

type RouteParams = {
  storeName: string;
  familyGroupId: string;
  createdBy: string;
};

// Must be a real component because useReorderableDrag/useIsActive are hooks
const CategoryRow: React.FC<{ item: CategoryType }> = ({ item }) => {
  const drag = useReorderableDrag();
  const isActive = useIsActive();
  const category = CategoryService.getCategory(item);
  return (
    <TouchableOpacity
      onLongPress={drag}
      disabled={isActive}
      style={[styles.categoryRow, isActive && styles.categoryRowActive]}
      activeOpacity={1}
    >
      <Text style={styles.categoryIcon}>{category?.icon || '📦'}</Text>
      <Text style={styles.categoryName}>{category?.name || item}</Text>
      <Text style={styles.dragHandle}>☰</Text>
    </TouchableOpacity>
  );
};

const StoreLayoutEditor = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { storeName, familyGroupId, createdBy } = route.params as RouteParams;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoryOrder, setCategoryOrder] = useState<CategoryType[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      StoreLayoutService.getLayoutForStore(storeName, familyGroupId)
        .then(layout => {
          if (!cancelled) {
            if (layout) {
              setCategoryOrder(layout.categoryOrder);
            } else {
              setCategoryOrder(CategoryService.getCategories().map(c => c.id as CategoryType));
            }
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCategoryOrder(CategoryService.getCategories().map(c => c.id as CategoryType));
            setLoading(false);
          }
        });

      return () => { cancelled = true; };
    }, [storeName, familyGroupId])
  );

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await StoreLayoutService.saveLayout(storeName, familyGroupId, categoryOrder, createdBy);
      navigation.goBack();
    } catch {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: CategoryType }) => <CategoryRow item={item} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {storeName}
        </Text>
        <TouchableOpacity onPress={handleSave} style={styles.headerButton} disabled={saving || loading}>
          <Text style={[styles.headerButtonText, styles.headerSaveText]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Long-press and drag to reorder categories</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <ReorderableList
          data={categoryOrder}
          renderItem={renderItem}
          keyExtractor={cat => cat}
          onReorder={({ from, to }: ReorderableListReorderEvent) => setCategoryOrder(prev => reorderItems(prev, from, to))}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerButton: {
    minWidth: 60,
    paddingVertical: 4,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  headerSaveText: {
    fontWeight: '600',
    textAlign: 'right',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#6E6E73',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  categoryRowActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderColor: 'rgba(0, 122, 255, 0.5)',
  },
  categoryIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  dragHandle: {
    fontSize: 18,
    color: '#6E6E73',
    paddingLeft: 8,
  },
});

export default StoreLayoutEditor;
