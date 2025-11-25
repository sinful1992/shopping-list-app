import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { COLORS, RADIUS } from '../styles/theme';

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
 * Animated rotating gradient border effect for premium/highlighted content.
 * Perfect for subscription tiers, premium features, or important cards.
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
  borderRadius = RADIUS.large,
  speed = 3000,
  colors = [COLORS.accent.blue, COLORS.accent.purple, COLORS.accent.blue],
  style,
}) => {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Create infinite rotating animation
    const animation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: speed,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [rotateAnim, speed]);

  // Interpolate rotation value
  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Animated gradient border */}
      <Animated.View
        style={[
          styles.borderContainer,
          {
            borderRadius,
            transform: [{ rotate }],
          },
        ]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          useAngle={true}
          angle={45}
          style={[
            styles.gradient,
            {
              borderRadius,
            },
          ]}
        />
      </Animated.View>

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
  gradient: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  content: {
    backgroundColor: COLORS.background.secondary,
    overflow: 'hidden',
  },
});

export default StarBorder;
