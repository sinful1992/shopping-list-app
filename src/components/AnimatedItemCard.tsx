import React, { useRef, useEffect } from 'react';
import { Animated, View, TouchableOpacity, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { COLORS, RADIUS } from '../styles/theme';

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
  index,
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
  const isChecked = item.checked === true;
  const qty = item.unitQty ?? 1;
  const totalPrice = itemPrice * qty;

  // Animation refs for tick-off effects
  const checkAnimation = useRef(new Animated.Value(1)).current;
  const scaleAnimation = useRef(new Animated.Value(1)).current;

  // Trigger animations when item is checked/unchecked
  useEffect(() => {
    if (isChecked) {
      // Checkmark bounce animation: appear, bounce up, settle
      Animated.sequence([
        Animated.timing(checkAnimation, {
          toValue: 1.0,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(checkAnimation, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(checkAnimation, {
          toValue: 1.0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Card scale-down animation
      Animated.sequence([
        Animated.timing(scaleAnimation, {
          toValue: 0.98,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(scaleAnimation, {
          toValue: 1.0,
          duration: 150,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      // Reset animations when unchecked
      checkAnimation.setValue(0);
      scaleAnimation.setValue(1);
    }
  }, [isChecked, checkAnimation, scaleAnimation]);

  return (
    <Animated.View
      style={[
        itemRowStyle,
        isChecked && itemRowCheckedStyle,
        isChecked && { opacity: 0.5 },
        { transform: [{ scale: scaleAnimation }] }
      ]}
    >
      {/* Checkbox */}
      <TouchableOpacity
        style={[checkboxStyle, isListLocked && checkboxDisabledStyle]}
        onPress={onToggleItem}
        disabled={isListLocked}
      >
        <Animated.View style={{ transform: [{ scale: checkAnimation }] }}>
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
          {item.measurementUnit ? (
            <TouchableOpacity onPress={() => onItemTap('measurement')} disabled={isListLocked} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Text style={[cardStyles.measurementText, { color: VOLUME_UNITS.includes(item.measurementUnit) ? '#6EA8FE' : '#A78BFA' }]}>
                {item.measurementValue != null ? `${item.measurementValue}${item.measurementUnit}` : item.measurementUnit}
              </Text>
            </TouchableOpacity>
          ) : !isChecked && (
            <TouchableOpacity onPress={() => onItemTap('measurement')} disabled={isListLocked} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
              <Text style={cardStyles.addSizeText}>+ add size</Text>
            </TouchableOpacity>
          )}
          {showSuggestion && suggestion && (
            <View style={suggestionRowStyle}>
              <Text style={suggestionTextStyle}>
                💡 £{(suggestion.bestPrice * qty).toFixed(2)} at {suggestion.bestStore} (save £{(suggestion.savings * qty).toFixed(2)})
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

const cardStyles = StyleSheet.create({
  qtyPrefix: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginRight: 4,
  },
  qtyBtnIncrement: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.small - 2,
    marginLeft: 4,
    backgroundColor: COLORS.accent.greenDim,
  },
  qtyBtnDecrement: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.small - 2,
    marginLeft: 4,
    backgroundColor: COLORS.accent.redSubtle,
  },
  qtyBtnDisabled: {
    opacity: 0.3,
  },
  qtyBtnTextIncrement: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.accent.green,
  },
  qtyBtnTextDecrement: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.accent.red,
  },
  measurementText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    marginTop: 2,
  },
  addSizeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
    fontStyle: 'italic',
    marginLeft: 4,
    marginTop: 2,
  },
});

export default AnimatedItemCard;
