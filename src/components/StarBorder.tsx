import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, StyleProp, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface StarBorderProps {
  children: React.ReactNode;
  borderWidth?: number;
  borderRadius?: number;
  speed?: number; // Animation duration in ms
  colors?: string[]; // Gradient colors
  style?: StyleProp<ViewStyle>;
}

/**
 * StarBorder Component
 *
 * Two elliptical gradient spotlights that orbit continuously around the border.
 * Creates a dynamic, premium border effect for highlighted content.
 *
 * @example
 * <StarBorder colors={['#FFD700', '#FFA500', '#FF4500']} speed={3000}>
 *   <View style={styles.premiumCard}>
 *     <Text>⭐ Premium Feature</Text>
 *   </View>
 * </StarBorder>
 */
const StarBorder: React.FC<StarBorderProps> = ({
  children,
  borderWidth = 2,
  borderRadius = 16,
  speed = 3000,
  colors = ['#007AFF', '#AF52DE', '#007AFF'],
  style,
}) => {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Create infinite orbital rotation for gradient spotlights
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: speed,
        easing: Easing.linear,
        useNativeDriver: false, // Required for degree string interpolation
      })
    );

    animation.start();

    return () => {
      rotation.stopAnimation();
    };
  }, [rotation, speed]);

  // Two gradients at 180° offset for continuous coverage
  const rotate1 = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const rotate2 = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '540deg'], // 180° offset
  });

  return (
    <View style={[styles.container, style]}>
      {/* Border container with overflow hidden */}
      <View style={[styles.borderContainer, { borderRadius, overflow: 'hidden' }]}>
        {/* Gradient Spotlight 1 */}
        <Animated.View
          style={[
            styles.gradientSpotlight,
            {
              transform: [{ rotate: rotate1 }],
            },
          ]}
        >
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          />
        </Animated.View>

        {/* Gradient Spotlight 2 (180° offset) */}
        <Animated.View
          style={[
            styles.gradientSpotlight,
            {
              transform: [{ rotate: rotate2 }],
            },
          ]}
        >
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          />
        </Animated.View>
      </View>

      {/* Content container */}
      <View
        style={[
          styles.content,
          {
            borderRadius: borderRadius - borderWidth,
            margin: borderWidth,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  borderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  gradientSpotlight: {
    position: 'absolute',
    width: '300%', // Wide ellipse
    height: '50%', // Half height
    top: '25%', // Center vertically
    left: '-100%', // Center horizontally
    borderRadius: 1000, // Large radius for ellipse effect
    opacity: 0.7, // Match CSS opacity
  },
  gradient: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 1000,
  },
  content: {
    backgroundColor: '#1c1c1e',
    overflow: 'hidden',
  },
});

export default StarBorder;
