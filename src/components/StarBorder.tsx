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
 * Two elliptical gradients that move horizontally with fade effect (ping-pong).
 * Top gradient moves left-to-right, bottom moves right-to-left.
 *
 * @example
 * <StarBorder colors={['#FFD700', '#FFA500', '#FF4500']} speed={5000}>
 *   <View style={styles.premiumCard}>
 *     <Text>⭐ Premium Feature</Text>
 *   </View>
 * </StarBorder>
 */
const StarBorder: React.FC<StarBorderProps> = ({
  children,
  borderWidth = 2,
  borderRadius = 16,
  speed = 5000, // Slower default speed
  colors = ['#007AFF', '#AF52DE', '#007AFF'],
  style,
}) => {
  // Four animated values: translation + opacity for each gradient
  const translateTop = useRef(new Animated.Value(0)).current;
  const opacityTop = useRef(new Animated.Value(1)).current;
  const translateBottom = useRef(new Animated.Value(0)).current;
  const opacityBottom = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Top gradient: left to right with fade out, then ping-pong back
    Animated.loop(
      Animated.sequence([
        // Move right and fade out
        Animated.parallel([
          Animated.timing(translateTop, {
            toValue: 1,
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          Animated.timing(opacityTop, {
            toValue: 0, // Fade to 0
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ]),
        // Move back left and fade in
        Animated.parallel([
          Animated.timing(translateTop, {
            toValue: 0,
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          Animated.timing(opacityTop, {
            toValue: 1, // Fade back to 1
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ]),
      ])
    ).start();

    // Bottom gradient: right to left with fade out, then ping-pong back
    Animated.loop(
      Animated.sequence([
        // Move left and fade out
        Animated.parallel([
          Animated.timing(translateBottom, {
            toValue: -1,
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          Animated.timing(opacityBottom, {
            toValue: 0, // Fade to 0
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ]),
        // Move back right and fade in
        Animated.parallel([
          Animated.timing(translateBottom, {
            toValue: 0,
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          Animated.timing(opacityBottom, {
            toValue: 1, // Fade back to 1
            duration: speed,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ]),
      ])
    ).start();

    return () => {
      translateTop.stopAnimation();
      translateBottom.stopAnimation();
      opacityTop.stopAnimation();
      opacityBottom.stopAnimation();
    };
  }, [translateTop, opacityTop, translateBottom, opacityBottom, speed]);

  // Interpolate to percentage strings
  // Top gradient: moves from left (-250%) to right (0% and beyond)
  const translateTopX = translateTop.interpolate({
    inputRange: [0, 1],
    outputRange: ['-250%', '-150%'], // Moves 100% to the right
  });

  // Bottom gradient: moves from right (-250%) to left
  const translateBottomX = translateBottom.interpolate({
    inputRange: [-1, 0],
    outputRange: ['-150%', '-250%'], // Moves 100% to the left (from -150% back to -250%)
  });

  return (
    <View style={[styles.container, style]}>
      {/* Border container with overflow hidden */}
      <View style={[styles.borderContainer, { borderRadius, overflow: 'hidden' }]}>
        {/* Top Gradient - moves left to right */}
        <Animated.View
          style={[
            styles.gradientTop,
            {
              opacity: opacityTop,
              left: translateTopX,
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

        {/* Bottom Gradient - moves right to left */}
        <Animated.View
          style={[
            styles.gradientBottom,
            {
              opacity: opacityBottom,
              right: translateBottomX,
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
  gradientTop: {
    position: 'absolute',
    width: '300%', // Wide ellipse
    height: '50%', // Half height
    top: -12, // Match CSS top: -12px
    borderRadius: 1000, // Large radius for ellipse effect (50%)
    opacity: 0.7, // Base opacity
  },
  gradientBottom: {
    position: 'absolute',
    width: '300%', // Wide ellipse
    height: '50%', // Half height
    bottom: -12, // Match CSS bottom: -12px
    borderRadius: 1000, // Large radius for ellipse effect (50%)
    opacity: 0.7, // Base opacity
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
