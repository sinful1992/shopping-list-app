import React, { useEffect, useRef } from 'react';
import { View, Animated, ViewStyle, StyleProp } from 'react-native';

interface AnimatedListProps {
  children: React.ReactNode[];
  staggerDelay?: number; // Delay between each item animation (ms)
  duration?: number; // Animation duration (ms)
  initialDelay?: number; // Delay before starting animations (ms)
  style?: StyleProp<ViewStyle>;
}

/**
 * AnimatedList Component
 *
 * Animates children with staggered fade-in and slide-up effect.
 * Perfect for lists, modals, or any sequential content display.
 *
 * @example
 * <AnimatedList staggerDelay={100} duration={400}>
 *   {items.map(item => (
 *     <View key={item.id}>
 *       <Text>{item.name}</Text>
 *     </View>
 *   ))}
 * </AnimatedList>
 */
const AnimatedList: React.FC<AnimatedListProps> = ({
  children,
  staggerDelay = 100,
  duration = 400,
  initialDelay = 0,
  style,
}) => {
  // Create animation values for each child
  const childrenArray = React.Children.toArray(children);

  // Track if component has been mounted to prevent re-animation on updates
  const hasMounted = useRef(false);

  // Initialize animation values with the same length as children
  const animatedValues = useRef<Array<{
    opacity: Animated.Value;
    translateY: Animated.Value;
  }>>([]);

  // Update animation values when children count changes
  if (animatedValues.current.length !== childrenArray.length) {
    animatedValues.current = childrenArray.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(20),
    }));
  }

  useEffect(() => {
    // Only animate on initial mount, not on updates
    if (hasMounted.current) {
      // If already mounted, just set values to final state for new items
      animatedValues.current.forEach(values => {
        values.opacity.setValue(1);
        values.translateY.setValue(0);
      });
      return;
    }

    // Mark as mounted
    hasMounted.current = true;

    // Reset all values before animating
    animatedValues.current.forEach(values => {
      values.opacity.setValue(0);
      values.translateY.setValue(20);
    });

    // Start each animation with proper stagger delay
    // Don't use Animated.stagger() with delays - it causes conflicts
    animatedValues.current.forEach((values, index) => {
      Animated.parallel([
        Animated.timing(values.opacity, {
          toValue: 1,
          duration,
          delay: initialDelay + index * staggerDelay,
          useNativeDriver: true,
        }),
        Animated.timing(values.translateY, {
          toValue: 0,
          duration,
          delay: initialDelay + index * staggerDelay,
          useNativeDriver: true,
        }),
      ]).start();
    });

    // Cleanup: Reset animations when component unmounts
    return () => {
      animatedValues.current.forEach(values => {
        values.opacity.setValue(0);
        values.translateY.setValue(20);
      });
    };
  }, [childrenArray.length, staggerDelay, duration, initialDelay]);

  return (
    <View style={style}>
      {childrenArray.map((child, index) => {
        const values = animatedValues.current[index];
        if (!values) return null;

        return (
          <Animated.View
            key={index}
            style={{
              opacity: values.opacity,
              transform: [{ translateY: values.translateY }],
            }}
          >
            {child}
          </Animated.View>
        );
      })}
    </View>
  );
};

export default AnimatedList;
