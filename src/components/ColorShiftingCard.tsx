import { useRef, useEffect } from 'react';
import { Animated, Easing, Dimensions } from 'react-native';

/**
 * Color conversion utilities for HSL to RGB to Hex
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/**
 * Generate N colors in a smooth gradient from cyan to pink
 * Uses HSL color space for perceptually uniform interpolation
 */
function generateColorGradient(count: number): string[] {
  const startColor = { h: 180, s: 100, l: 50 }; // Cyan (#00FFFF)
  const endColor = { h: 330, s: 81, l: 60 };    // Pink (#EC4899)

  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const ratio = count === 1 ? 0 : i / (count - 1);
    const h = startColor.h + (endColor.h - startColor.h) * ratio;
    const s = startColor.s + (endColor.s - startColor.s) * ratio;
    const l = startColor.l + (endColor.l - startColor.l) * ratio;
    colors.push(hslToHex(h, s, l));
  }

  return colors;
}

/**
 * Calculate approximate number of items visible on screen
 * Used to determine how many colors to generate for the wave effect
 */
function calculateVisibleItems(): number {
  const screenHeight = Dimensions.get('window').height;
  const headerHeight = 120; // Approximate header + padding
  const itemHeight = 75;    // Item row height (~65px actual + 8px margin)
  const availableHeight = screenHeight - headerHeight;
  return Math.max(Math.floor(availableHeight / itemHeight), 6); // Minimum 6 for safety
}

/**
 * useColorShiftingBorder Hook
 *
 * Creates a dynamic color wave effect where each item cycles through a full spectrum
 * of colors. The number of colors is based on how many items fit on the screen,
 * creating a true wave effect where all visible items display the full color range.
 *
 * @param index - Card/item index for determining position in wave
 * @param borderWidth - Width of the border (default: 3)
 * @param borderRadius - Radius of the border corners (default: 16)
 * @param visibleItemsCount - Optional: Number of colors in gradient (auto-calculated if not provided)
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
  borderRadius: number = 16,
  visibleItemsCount?: number
) => {
  const colorAnimation = useRef(new Animated.Value(0)).current;

  // Calculate or use provided visible items count
  const itemCount = visibleItemsCount || calculateVisibleItems();

  // Generate color gradient based on visible items (memoized)
  const colorGradient = useRef(generateColorGradient(itemCount)).current;

  useEffect(() => {
    // Each item starts at a different position in the gradient
    // This creates the wave effect where all visible items show different colors
    const startOffset = (index % itemCount) / itemCount;
    colorAnimation.setValue(startOffset);

    const animation = Animated.loop(
      Animated.timing(colorAnimation, {
        toValue: startOffset + 1, // Complete one full cycle through all colors
        duration: 4000, // 4 second cycle
        easing: Easing.linear,
        useNativeDriver: false, // REQUIRED for color interpolation
      })
    );

    animation.start();

    return () => {
      colorAnimation.stopAnimation();
    };
  }, [colorAnimation, index, itemCount]);

  // Create input/output ranges for all colors in gradient
  const inputRange: number[] = [];
  const outputRange: string[] = [];

  for (let i = 0; i <= itemCount; i++) {
    const position = i / itemCount;
    inputRange.push(position);
    outputRange.push(colorGradient[i % itemCount]);
  }

  const borderColor = colorAnimation.interpolate({
    inputRange,
    outputRange,
  });

  return {
    borderColor,
    borderWidth,
    borderRadius,
  };
};
