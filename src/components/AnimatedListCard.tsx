import React from 'react';
import { Animated, TouchableOpacity, View, Text, StyleProp, ViewStyle } from 'react-native';
import { useColorShiftingBorder } from './ColorShiftingCard';

// Create animated version of TouchableOpacity
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface AnimatedListCardProps {
  index: number;
  listId: string;
  listName: string;
  isCompleted: boolean;
  isLocked: boolean;
  lockedByRole?: string | null;
  lockedByName?: string | null;
  storeName?: string | null;
  formattedDate: string;
  syncColor: string;
  onPress: () => void;
  onDelete: () => void;
  completedCardStyle?: StyleProp<ViewStyle>;
  listCardStyle: StyleProp<ViewStyle>;
  totalLists: number;
}

const AnimatedListCard: React.FC<AnimatedListCardProps> = ({
  index,
  listId,
  listName,
  isCompleted,
  isLocked,
  lockedByRole,
  lockedByName,
  storeName,
  formattedDate,
  syncColor,
  onPress,
  onDelete,
  completedCardStyle,
  listCardStyle,
  totalLists,
}) => {
  // Get animated border styles - called at component level (safe)
  const borderStyles = useColorShiftingBorder(index, 3, 20, totalLists);

  return (
    <AnimatedTouchableOpacity
      key={listId}
      style={[listCardStyle, isCompleted && completedCardStyle, borderStyles]}
      onPress={onPress}
    >
      {/* Sync Status Indicator - Top Right */}
      <View style={[styles.syncIndicator, { backgroundColor: syncColor }]} />

      <View style={styles.listHeader}>
        <View style={styles.listTitleRow}>
          <Text style={[styles.listName, isCompleted && styles.completedText]}>
            {listName}
          </Text>
        </View>
        <View style={styles.listBadges}>
          {isLocked && (
            <Text style={styles.shoppingBadge}>
              🛒 {lockedByRole || lockedByName || 'Shopping'}
            </Text>
          )}
          {isCompleted && <Text style={styles.completedBadge}>✓ Completed</Text>}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={styles.deleteIconButton}
          >
            <Text style={styles.deleteIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date and Store Display */}
      <Text style={[styles.listDateFormatted, isCompleted && styles.completedText]}>
        {formattedDate}
      </Text>
      {isCompleted && storeName && (
        <Text style={[styles.storeName, isCompleted && styles.completedText]}>
          {storeName}
        </Text>
      )}
      {!isCompleted && (
        <Text style={[styles.listDateSecondary, isCompleted && styles.completedText]}>
          Created {formattedDate}
        </Text>
      )}
    </AnimatedTouchableOpacity>
  );
};

const styles = {
  syncIndicator: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 8,
  },
  listTitleRow: {
    flex: 1,
    marginRight: 8,
  },
  listName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#fff',
  },
  completedText: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  listBadges: {
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
  },
  shoppingBadge: {
    fontSize: 12,
    color: '#FFD60A',
    backgroundColor: 'rgba(255, 214, 10, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  completedBadge: {
    fontSize: 12,
    color: '#30D158',
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  deleteIconButton: {
    padding: 2,
  },
  deleteIcon: {
    fontSize: 18,
  },
  listDateFormatted: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  listDateSecondary: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  storeName: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
};

export default AnimatedListCard;
