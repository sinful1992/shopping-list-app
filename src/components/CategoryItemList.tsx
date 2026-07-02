import React, { memo, useMemo } from 'react';
import {
  NestedReorderableList,
  useReorderableDrag,
  reorderItems,
  ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { Gesture } from 'react-native-gesture-handler';
import AnimatedItemCard from './AnimatedItemCard';
import { Item } from '../models/types';

// Drag wrapper — must be a real component because useReorderableDrag is a hook.
// Renders children as a render prop, passing drag() so AnimatedItemCard can
// attach it to its own inner touchable (avoiding nested-touchable conflicts).
interface DraggableItemRowProps {
  isListLocked: boolean;
  children: (drag: (() => void) | undefined) => React.ReactNode;
}
const DraggableItemRow: React.FC<DraggableItemRowProps> = ({ isListLocked, children }) => {
  const drag = useReorderableDrag();
  return <>{children(!isListLocked ? drag : undefined)}</>;
};

interface CategoryItemListProps {
  catItems: Item[];
  predictedPrices: Record<string, number>;
  smartSuggestions: Map<string, { bestStore: string; bestPrice: number; savings: number }>;
  storeName?: string;
  isListLocked: boolean;
  onReorder: (items: Item[]) => void;
  onToggleItem: (id: string) => void;
  onItemTap: (item: Item, focusField?: 'name' | 'price' | 'measurement') => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
}

/**
 * One category's reorderable item list inside ListDetailScreen.
 * Kept memo'd: re-renders only when its own category's slice changes.
 */
const CategoryItemList = memo(({
  catItems,
  predictedPrices,
  smartSuggestions,
  storeName,
  isListLocked,
  onReorder,
  onToggleItem,
  onItemTap,
  onIncrement,
  onDecrement,
}: CategoryItemListProps) => {
  const panGesture = useMemo(() => Gesture.Pan().activateAfterLongPress(250), []);
  return (
    <NestedReorderableList
      panGesture={panGesture}
      data={catItems}
      keyExtractor={(item: Item) => item.id}
      onReorder={({ from, to }: ReorderableListReorderEvent) => onReorder(reorderItems(catItems, from, to))}
      renderItem={({ item, index }: { item: Item; index: number }) => {
        const itemPrice = item.price ?? (item.name ? predictedPrices[item.name.toLowerCase()] : undefined) ?? 0;
        const isPredicted = !item.price && !!item.name && !!predictedPrices[item.name.toLowerCase()];
        const suggestion = item.name ? smartSuggestions.get(item.name.toLowerCase()) : undefined;
        const showSuggestion = !!suggestion && !item.checked && storeName !== suggestion.bestStore;
        return (
          <DraggableItemRow isListLocked={isListLocked}>
            {(drag) => (
              <AnimatedItemCard
                key={item.id}
                index={index}
                item={item}
                itemPrice={itemPrice}
                isPredicted={isPredicted}
                showSuggestion={showSuggestion}
                suggestion={suggestion}
                isListLocked={isListLocked}
                onDrag={drag}
                onToggleItem={() => !isListLocked && onToggleItem(item.id)}
                onItemTap={(focusField) => onItemTap(item, focusField)}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
              />
            )}
          </DraggableItemRow>
        );
      }}
    />
  );
});

export default CategoryItemList;
