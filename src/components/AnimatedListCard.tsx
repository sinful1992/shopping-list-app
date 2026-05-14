import React from 'react';
import { Animated, TouchableOpacity, View, Text, StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../styles/theme';

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
  theme: Theme;
}

const AnimatedListCard: React.FC<AnimatedListCardProps> = ({
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
  theme,
}) => {
  return (
    <AnimatedTouchableOpacity
      key={listId}
      style={[listCardStyle, isCompleted && completedCardStyle]}
      onPress={onPress}
    >
      <View style={[staticStyles.syncIndicator, { backgroundColor: syncColor }]} />

      <View style={staticStyles.listHeader}>
        <View style={staticStyles.listTitleRow}>
          <Text style={[staticStyles.listName, { color: theme.text.primary }, isCompleted && { color: theme.text.secondary }]}>
            {listName}
          </Text>
        </View>
        <View style={staticStyles.listBadges}>
          {isLocked && (
            <Text style={[staticStyles.shoppingBadge, { color: theme.accent.orange }]}>
              🛒 {lockedByRole || lockedByName || 'Shopping'}
            </Text>
          )}
          {isCompleted && (
            <Text style={[staticStyles.completedBadge, { color: theme.accent.green }]}>
              ✓ Completed
            </Text>
          )}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={staticStyles.deleteIconButton}
          >
            <Text style={staticStyles.deleteIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[staticStyles.listDateFormatted, { color: theme.text.secondary }, isCompleted && { color: theme.text.tertiary }]}>
        {formattedDate}
      </Text>
      {isCompleted && storeName && (
        <Text style={[staticStyles.storeName, { color: theme.text.secondary }]}>
          {storeName}
        </Text>
      )}
      {!isCompleted && (
        <Text style={[staticStyles.listDateSecondary, { color: theme.text.tertiary }]}>
          Created {formattedDate}
        </Text>
      )}
    </AnimatedTouchableOpacity>
  );
};

const staticStyles = {
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
  },
  listBadges: {
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
  },
  shoppingBadge: {
    fontSize: 12,
    backgroundColor: 'rgba(255, 214, 10, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  completedBadge: {
    fontSize: 12,
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
    marginTop: 4,
  },
  listDateSecondary: {
    fontSize: 12,
    marginTop: 2,
  },
  storeName: {
    fontSize: 14,
    marginTop: 2,
  },
};

export default AnimatedListCard;
