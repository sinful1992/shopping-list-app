import React, { useEffect, useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import Animated, { useSharedValue, withSequence, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { RADIUS } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';
import CategoryService from '../services/CategoryService';
import Icon from 'react-native-vector-icons/Ionicons';

const VOLUME_UNITS = ['ml', 'L'];

interface AnimatedItemCardProps {
  index: number;
  item: {
    id: string;
    name: string;
    checked?: boolean | null;
    price?: number | null;
    unitQty?: number | null;
    measurementUnit?: string | null;
    measurementValue?: number | null;
    category?: string | null;
  };
  /** Unit price — card multiplies by quantity for display */
  itemPrice: number;
  isPredicted: boolean;
  showSuggestion: boolean;
  suggestion?: {
    bestPrice: number;
    bestStore: string;
    savings: number;
  };
  isListLocked: boolean;
  onDrag?: () => void;
  onToggleItem: () => void;
  onItemTap: (focusField?: 'name' | 'price' | 'measurement') => void;
  onIncrement: (itemId: string) => void;
  onDecrement: (itemId: string) => void;
  itemRowStyle: StyleProp<ViewStyle>;
  itemRowCheckedStyle?: StyleProp<ViewStyle>;
  checkboxStyle: StyleProp<ViewStyle>;
  checkboxDisabledStyle?: StyleProp<ViewStyle>;
  checkboxTextDisabledStyle?: StyleProp<TextStyle>;
  checkboxTextCheckedStyle?: StyleProp<TextStyle>;
  itemContentTouchableStyle: StyleProp<ViewStyle>;
  itemContentColumnStyle: StyleProp<ViewStyle>;
  itemContentRowStyle: StyleProp<ViewStyle>;
  itemNameTextStyle: StyleProp<TextStyle>;
  itemNameCheckedStyle?: StyleProp<TextStyle>;
  itemPriceTextStyle: StyleProp<TextStyle>;
  itemPricePredictedStyle?: StyleProp<TextStyle>;
  itemPriceCheckedStyle?: StyleProp<TextStyle>;
  suggestionRowStyle?: StyleProp<ViewStyle>;
  suggestionTextStyle?: StyleProp<TextStyle>;
}

const AnimatedItemCard: React.FC<AnimatedItemCardProps> = ({
  index: _index,
  item,
  itemPrice,
  isPredicted,
  showSuggestion,
  suggestion,
  isListLocked,
  onDrag,
  onToggleItem,
  onItemTap,
  onIncrement,
  onDecrement,
  itemRowStyle,
  itemRowCheckedStyle,
  checkboxStyle,
  checkboxDisabledStyle,
  checkboxTextDisabledStyle,
  checkboxTextCheckedStyle,
  itemContentTouchableStyle,
  itemContentColumnStyle,
  itemContentRowStyle,
  itemNameTextStyle,
  itemNameCheckedStyle,
  itemPriceTextStyle,
  itemPricePredictedStyle,
  itemPriceCheckedStyle,
  suggestionRowStyle,
  suggestionTextStyle,
}) => {
  const { theme } = useTheme();
  const cardStyles = useMemo(() => StyleSheet.create({
    qtyPrefix: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text.secondary,
      marginRight: 4,
    },
    qtyBtnIncrement: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.small - 2,
      marginLeft: 4,
      backgroundColor: theme.accent.greenDim,
    },
    qtyBtnDecrement: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.small - 2,
      marginLeft: 4,
      backgroundColor: theme.accent.redSubtle,
    },
    qtyBtnDisabled: {
      opacity: 0.3,
    },
    qtyBtnTextIncrement: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.accent.green,
    },
    qtyBtnTextDecrement: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.accent.red,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    categoryLabel: {
      fontSize: 11,
      fontWeight: '600',
    },
    measurementText: {
      fontSize: 11,
      fontWeight: '700',
    },
    addSizeText: {
      fontSize: 11,
      color: theme.text.dim,
      fontStyle: 'italic',
    },
    checkedOpacity: { opacity: 0.5 },
  }), [theme]);
  const isChecked = item.checked === true;
  const qty = item.unitQty ?? 1;
  const totalPrice = itemPrice * qty;
  const categoryInfo = item.category ? CategoryService.getCategory(item.category as any) : null;
  const categoryColorStyle = categoryInfo ? { color: categoryInfo.color } : null;
  const measurementColorStyle = { color: VOLUME_UNITS.includes(item.measurementUnit ?? '') ? theme.accent.blue : theme.accent.purple };

  const checkScale = useSharedValue(isChecked ? 1 : 0);
  const cardScale = useSharedValue(1);

  useEffect(() => {
    if (isChecked) {
      checkScale.value = withSequence(
        withTiming(1.0, { duration: 50 }),
        withTiming(1.2, { duration: 150 }),
        withTiming(1.0, { duration: 100 }),
      );
      cardScale.value = withSequence(
        withTiming(0.98, { duration: 150 }),
        withTiming(1.0, { duration: 150 }),
      );
    } else {
      checkScale.value = 0;
      cardScale.value = 1;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecked]);

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Animated.View
      style={[
        itemRowStyle,
        isChecked && itemRowCheckedStyle,
        isChecked && cardStyles.checkedOpacity,
        cardAnimatedStyle,
      ]}
    >
      {/* Checkbox */}
      <TouchableOpacity
        style={[checkboxStyle, isListLocked && checkboxDisabledStyle]}
        onPress={onToggleItem}
        disabled={isListLocked}
      >
        <Animated.View style={checkAnimatedStyle}>
          <Text style={[
            isListLocked && checkboxTextDisabledStyle,
            isChecked && !isListLocked && checkboxTextCheckedStyle
          ]}>
            {isChecked ? '✓' : ' '}
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Item content */}
      <TouchableOpacity
        style={itemContentTouchableStyle}
        onPress={() => onItemTap('name')}
        onLongPress={onDrag}
        delayLongPress={250}
        disabled={isListLocked}
        activeOpacity={0.7}
      >
        <View style={itemContentColumnStyle}>
          <View style={itemContentRowStyle}>
            {qty > 1 && (
              <Text style={cardStyles.qtyPrefix}>{qty}x</Text>
            )}
            <Text
              style={[
                itemNameTextStyle,
                isChecked && itemNameCheckedStyle
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>
          <View style={cardStyles.subRow}>
            {categoryInfo && (
              <Text style={[cardStyles.categoryLabel, categoryColorStyle]}>
                {categoryInfo.name}
              </Text>
            )}
            {item.measurementUnit ? (
              <TouchableOpacity onPress={() => onItemTap('measurement')} disabled={isListLocked} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <Text style={[cardStyles.measurementText, measurementColorStyle]}>
                  {item.measurementValue != null ? `${item.measurementValue}${item.measurementUnit}` : item.measurementUnit}
                </Text>
              </TouchableOpacity>
            ) : !isChecked && (
              <TouchableOpacity onPress={() => onItemTap('measurement')} disabled={isListLocked} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <Text style={cardStyles.addSizeText}>+ size</Text>
              </TouchableOpacity>
            )}
          </View>
          {showSuggestion && suggestion && (
            <View style={suggestionRowStyle}>
              <Text style={suggestionTextStyle}>
                <Icon name="bulb-outline" size={12} color={theme.accent.yellow} /> £{(suggestion.bestPrice * qty).toFixed(2)} at {suggestion.bestStore} (save £{(suggestion.savings * qty).toFixed(2)})
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Price — tappable to open price field */}
      <TouchableOpacity onPress={() => onItemTap('price')} disabled={isListLocked} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text
          style={[
            itemPriceTextStyle,
            isPredicted && itemPricePredictedStyle,
            isChecked && itemPriceCheckedStyle
          ]}
        >
          {isPredicted ? '~' : ''}£{totalPrice.toFixed(2)}
        </Text>
      </TouchableOpacity>

      {/* Quantity buttons — hidden when checked */}
      {!isChecked && (
        <>
          {qty > 1 && (
            <TouchableOpacity
              style={[cardStyles.qtyBtnDecrement, isListLocked && cardStyles.qtyBtnDisabled]}
              onPress={() => onDecrement(item.id)}
              disabled={isListLocked}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={cardStyles.qtyBtnTextDecrement}>-</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[cardStyles.qtyBtnIncrement, isListLocked && cardStyles.qtyBtnDisabled]}
            onPress={() => onIncrement(item.id)}
            disabled={isListLocked}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={cardStyles.qtyBtnTextIncrement}>+</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
};


export default AnimatedItemCard;
