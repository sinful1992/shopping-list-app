import { useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * useColorShiftingBorder Hook
 *
 * Returns animated border styles that cycle through colors with staggered delays.
 * Apply the returned styles directly to a component to create a color-shifting border effect.
 *
 * @param index - Card index for staggered animation delay
 * @param borderWidth - Width of the border (default: 3)
 * @param borderRadius - Radius of the border corners (default: 16)
 * @returns Animated style object with borderColor, borderWidth, and borderRadius
 *
 * @example
 * const borderStyles = useColorShiftingBorder(0, 3, 20);
 * <Animated.TouchableOpacity style={[styles.card, borderStyles]}>
 *   <Text>Card Content</Text>
 * </Animated.TouchableOpacity>
 */
export const useColorShiftingBorder = (
  index: number,
  borderWidth: number = 3,
  borderRadius: number = 16
) => {
  const colorAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const staggerDelay = index * 500; // 500ms offset per card

    const timeoutId = setTimeout(() => {
      const animation = Animated.loop(
        Animated.timing(colorAnimation, {
          toValue: 1,
          duration: 4000, // 4 second cycle
          easing: Easing.linear,
          useNativeDriver: false, // REQUIRED for color interpolation
        })
      );

      animation.start();
    }, staggerDelay);

    return () => {
      clearTimeout(timeoutId);
      colorAnimation.stopAnimation();
    };
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

  return {
    borderColor,
    borderWidth,
    borderRadius,
  };
};
