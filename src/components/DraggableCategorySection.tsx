import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useReorderableDrag, useIsActive } from 'react-native-reorderable-list';

interface DraggableCategorySectionProps {
  category: { icon: string; name: string } | null;
  categoryKey: string;
  canDrag: boolean;
  children: React.ReactNode;
}

const DraggableCategorySection: React.FC<DraggableCategorySectionProps> = ({
  category,
  categoryKey,
  canDrag,
  children,
}) => {
  const drag = useReorderableDrag();
  const isActive = useIsActive();

  return (
    <View style={[styles.container, isActive && styles.containerActive]}>
      <View style={styles.categoryHeader}>
        {canDrag && (
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={150}
            style={styles.dragHandle}
            activeOpacity={0.6}
          >
            <Text style={styles.dragHandleText}>☰</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.categoryIcon}>{category?.icon || '📦'}</Text>
        <Text style={styles.categoryName}>{category?.name || categoryKey}</Text>
      </View>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  containerActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.5)',
    borderRadius: 10,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  dragHandle: {
    paddingHorizontal: 10,
    minWidth: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandleText: {
    fontSize: 18,
    color: '#6E6E73',
    paddingRight: 4,
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default DraggableCategorySection;
