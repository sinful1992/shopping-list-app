import React from 'react';
import { Animated, View, TouchableOpacity, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { useColorShiftingBorder } from './ColorShiftingCard';

interface AnimatedItemCardProps {
  index: number;
  item: {
    id: string;
    name: string;
    checked?: boolean | null;
    price?: number;
  };
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

  return (
    <Animated.View
      style={[
        itemRowStyle,
        isChecked && itemRowCheckedStyle,
        borderStyles,
        // Reduce opacity for entire card when checked
        isChecked && { opacity: 0.5 }
      ]}
    >
      {/* Checkbox */}
      <TouchableOpacity
        style={[checkboxStyle, isListLocked && checkboxDisabledStyle]}
        onPress={onToggleItem}
        disabled={isListLocked}
      >
        <Text style={[
          isListLocked && checkboxTextDisabledStyle,
          isChecked && !isListLocked && checkboxTextCheckedStyle
        ]}>
          {isChecked ? '✓' : ' '}
        </Text>
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
            <Text
              style={[
                itemPriceTextStyle,
                isPredicted && itemPricePredictedStyle,
                isChecked && itemPriceCheckedStyle
              ]}
            >
              {isPredicted ? '~' : ''}£{itemPrice.toFixed(2)}
            </Text>
          </View>
          {showSuggestion && suggestion && (
            <View style={suggestionRowStyle}>
              <Text style={suggestionTextStyle}>
                💡 £{suggestion.bestPrice.toFixed(2)} at {suggestion.bestStore} (save £{suggestion.savings.toFixed(2)})
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default AnimatedItemCard;
