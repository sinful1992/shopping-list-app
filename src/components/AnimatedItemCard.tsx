import React, { useRef, useEffect } from 'react';
import { Animated, View, TouchableOpacity, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useColorShiftingBorder } from './ColorShiftingCard';

interface AnimatedItemCardProps {
  index: number;
  item: {
    id: string;
    name: string;
    checked?: boolean | null;
    price?: number;
    unitQty?: number | null;
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
  onToggleItem: () => void;
  onItemTap: () => void;
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
  totalItems: number;
}

const AnimatedItemCard: React.FC<AnimatedItemCardProps> = ({
  index,
  item,
  totalItems,
  itemPrice,
  isPredicted,
  showSuggestion,
  suggestion,
  isListLocked,
  onToggleItem,
  onItemTap,
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
  // Apply color-shifting border with wave effect
  const borderStyles = useColorShiftingBorder(index, 1.5, 8, totalItems);

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
        borderStyles,
        // Reduce opacity for entire card when checked
        isChecked && { opacity: 0.5 },
        // Apply scale animation
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
        onPress={onItemTap}
        disabled={isListLocked}
        activeOpacity={0.7}
      >
        <View style={itemContentColumnStyle}>
          <View style={itemContentRowStyle}>
            <Text
              style={[
                itemNameTextStyle,
                isChecked && itemNameCheckedStyle
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {qty > 1 && (
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', minWidth: 28, textAlign: 'center' }}>
                x{qty}
              </Text>
            )}
            <Text
              style={[
                itemPriceTextStyle,
                isPredicted && itemPricePredictedStyle,
                isChecked && itemPriceCheckedStyle
              ]}
            >
              {isPredicted ? '~' : ''}£{totalPrice.toFixed(2)}
            </Text>
          </View>
          {showSuggestion && suggestion && (
            <View style={suggestionRowStyle}>
              <Text style={suggestionTextStyle}>
                💡 £{(suggestion.bestPrice * qty).toFixed(2)} at {suggestion.bestStore} (save £{(suggestion.savings * qty).toFixed(2)})
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default AnimatedItemCard;
