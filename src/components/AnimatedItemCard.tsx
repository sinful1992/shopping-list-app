import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSequence, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { RADIUS, NUMERIC } from '../styles/theme';
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
}) => {
  const { theme } = useTheme();
  const cardStyles = useMemo(() => StyleSheet.create({
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background.secondary,
      padding: 15,
      marginHorizontal: 10,
      marginBottom: 8,
      borderRadius: RADIUS.xlarge,
      borderWidth: 1,
      borderColor: theme.border.strong,
    },
    itemRowChecked: {
      backgroundColor: theme.glass.subtle,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 2,
      borderColor: theme.accent.blue,
      borderRadius: 4,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent.blueSubtle,
    },
    checkboxDisabled: {
      borderColor: theme.text.tertiary,
      backgroundColor: theme.glass.subtle,
      opacity: 0.5,
    },
    itemContentTouchable: {
      flex: 1,
    },
    itemContentColumn: {
      flex: 1,
    },
    itemContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    itemNameText: {
      flex: 1,
      fontSize: 16,
      color: theme.text.primary,
      fontWeight: '600',
    },
    itemNameChecked: {
      textDecorationLine: 'line-through',
      color: theme.text.tertiary,
    },
    itemPriceText: {
      ...NUMERIC,
      fontSize: 16,
      fontWeight: '600',
      color: theme.text.secondary,
      minWidth: 60,
      textAlign: 'right',
    },
    itemPricePredicted: {
      color: theme.text.secondary,
      fontWeight: '400',
    },
    itemPriceChecked: {
      color: theme.text.tertiary,
    },
    suggestionRow: {
      marginTop: 4,
    },
    suggestionText: {
      fontSize: 12,
      color: theme.accent.green,
      fontStyle: 'italic',
    },
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
  // Checking an item plays the animation in place before the parent moves the
  // card to the Completed section: visuals flip on this local state at tap
  // time, while the parent delays the actual state change (and this card's
  // unmount) until the pop has played.
  const [pendingCheck, setPendingCheck] = useState(false);
  const displayChecked = isChecked || pendingCheck;
  const qty = item.unitQty ?? 1;
  const totalPrice = itemPrice * qty;
  const categoryInfo = item.category ? CategoryService.getCategory(item.category) : null;
  const categoryColorStyle = categoryInfo ? { color: categoryInfo.color } : null;
  const measurementColorStyle = { color: VOLUME_UNITS.includes(item.measurementUnit ?? '') ? theme.accent.blue : theme.accent.purple };

  const checkScale = useSharedValue(displayChecked ? 1 : 0);
  const cardScale = useSharedValue(1);
  // Shared values above already match the mounted state; animating on mount
  // would replay the pop for every already-checked card whenever the list
  // section remounts (screen re-enter, section rebuild).
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (displayChecked) {
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
  }, [displayChecked, checkScale, cardScale]);

  // If the parent never commits the check (toggle failed and the optimistic
  // state reverted), this card stays mounted unchecked — revert the visuals.
  useEffect(() => {
    if (!pendingCheck || isChecked) return;
    const timer = setTimeout(() => setPendingCheck(false), 1500);
    return () => clearTimeout(timer);
  }, [pendingCheck, isChecked]);

  const handleCheckboxPress = useCallback(() => {
    if (pendingCheck) return; // check already in flight — toggle is idempotent
    if (!isChecked) setPendingCheck(true);
    onToggleItem();
  }, [pendingCheck, isChecked, onToggleItem]);

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  return (
    <Animated.View
      style={[
        cardStyles.itemRow,
        displayChecked && cardStyles.itemRowChecked,
        displayChecked && cardStyles.checkedOpacity,
        cardAnimatedStyle,
      ]}
    >
      {/* Checkbox */}
      <TouchableOpacity
        style={[cardStyles.checkbox, isListLocked && cardStyles.checkboxDisabled]}
        onPress={handleCheckboxPress}
        disabled={isListLocked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: displayChecked, disabled: isListLocked }}
        accessibilityLabel={item.name}
      >
        <Animated.View style={checkAnimatedStyle}>
          {displayChecked && (
            <Icon
              name="checkmark"
              size={16}
              color={isListLocked ? theme.text.tertiary : theme.accent.green}
            />
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Item content */}
      <TouchableOpacity
        style={cardStyles.itemContentTouchable}
        onPress={() => onItemTap('name')}
        onLongPress={onDrag}
        delayLongPress={250}
        disabled={isListLocked}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.name}`}
      >
        <View style={cardStyles.itemContentColumn}>
          <View style={cardStyles.itemContentRow}>
            {qty > 1 && (
              <Text style={cardStyles.qtyPrefix}>{qty}x</Text>
            )}
            <Text
              style={[
                cardStyles.itemNameText,
                displayChecked && cardStyles.itemNameChecked
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
              <TouchableOpacity
                onPress={() => onItemTap('measurement')}
                disabled={isListLocked}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Edit size of ${item.name}`}
              >
                <Text style={[cardStyles.measurementText, measurementColorStyle]}>
                  {item.measurementValue != null ? `${item.measurementValue}${item.measurementUnit}` : item.measurementUnit}
                </Text>
              </TouchableOpacity>
            ) : !displayChecked && (
              <TouchableOpacity
                onPress={() => onItemTap('measurement')}
                disabled={isListLocked}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Add size for ${item.name}`}
              >
                <Text style={cardStyles.addSizeText}>+ size</Text>
              </TouchableOpacity>
            )}
          </View>
          {showSuggestion && suggestion && !displayChecked && (
            <View style={cardStyles.suggestionRow}>
              <Text style={cardStyles.suggestionText}>
                <Icon name="bulb-outline" size={12} color={theme.accent.yellow} /> £{(suggestion.bestPrice * qty).toFixed(2)} at {suggestion.bestStore} (save £{(suggestion.savings * qty).toFixed(2)})
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Price — tappable to open price field */}
      <TouchableOpacity
        onPress={() => onItemTap('price')}
        disabled={isListLocked}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Edit price of ${item.name}, currently ${isPredicted ? 'estimated ' : ''}£${totalPrice.toFixed(2)}`}
      >
        <Text
          style={[
            cardStyles.itemPriceText,
            isPredicted && cardStyles.itemPricePredicted,
            displayChecked && cardStyles.itemPriceChecked
          ]}
        >
          {isPredicted ? '~' : ''}£{totalPrice.toFixed(2)}
        </Text>
      </TouchableOpacity>

      {/* Quantity buttons — hidden when checked */}
      {!displayChecked && (
        <>
          {qty > 1 && (
            <TouchableOpacity
              style={[cardStyles.qtyBtnDecrement, isListLocked && cardStyles.qtyBtnDisabled]}
              onPress={() => onDecrement(item.id)}
              disabled={isListLocked}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Decrease quantity of ${item.name}`}
            >
              <Text style={cardStyles.qtyBtnTextDecrement}>-</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[cardStyles.qtyBtnIncrement, isListLocked && cardStyles.qtyBtnDisabled]}
            onPress={() => onIncrement(item.id)}
            disabled={isListLocked}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`Increase quantity of ${item.name}`}
          >
            <Text style={cardStyles.qtyBtnTextIncrement}>+</Text>
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
};


export default AnimatedItemCard;
