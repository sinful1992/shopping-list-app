import React, { useRef, useEffect } from 'react';
import { Animated, StyleSheet, ViewStyle, StyleProp, Easing } from 'react-native';

interface ColorShiftingCardProps {
  children: React.ReactNode;
  index: number; // For staggered delay
  borderWidth?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * ColorShiftingCard Component
 *
 * Animated border that cycles through colors with staggered delays.
 * Creates a wave effect when multiple cards are displayed.
 *
 * @example
 * <ColorShiftingCard index={0} borderWidth={3} borderRadius={16}>
 *   <View style={styles.card}>
 *     <Text>Card Content</Text>
 *   </View>
 * </ColorShiftingCard>
 */
const ColorShiftingCard: React.FC<ColorShiftingCardProps> = ({
  children,
  index,
  borderWidth = 2,
  borderRadius = 16,
  style,
}) => {
  const colorAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Calculate staggered delay
    const delay = index * 500; // 500ms offset per card

    // Start after delay
    const animation = Animated.loop(
      Animated.timing(colorAnimation, {
        toValue: 1,
        duration: 4000, // 4 second cycle
        easing: Easing.linear,
        useNativeDriver: false, // REQUIRED for color interpolation
        delay, // Staggered start
      })
    );

    animation.start();

    return () => animation.stop();
  }, [colorAnimation, index]);

  // Color interpolation: Cyan → Purple → Pink → Cyan
  const borderColor = colorAnimation.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [
      '#00FFFF', // Cyan
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#00FFFF', // Back to Cyan
    ],
  });

  // Matching shadow/glow color
  const shadowColor = colorAnimation.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: ['#00FFFF', '#8B5CF6', '#EC4899', '#00FFFF'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          borderColor,
          borderWidth,
          borderRadius,
          shadowColor,
          shadowRadius: 8,
          shadowOpacity: 0.6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 5, // Android shadow
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
});

export default ColorShiftingCard;
