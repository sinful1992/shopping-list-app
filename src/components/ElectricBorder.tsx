import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, StyleProp, Easing } from 'react-native';

interface ElectricBorderProps {
  children: React.ReactNode;
  color?: string; // Main border color
  borderWidth?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * ElectricBorder Component
 *
 * Animated electric border effect with pulsing glow layers.
 * Creates a bright, energetic border for premium content.
 *
 * @example
 * <ElectricBorder color="#00D9FF" borderWidth={2}>
 *   <View style={styles.card}>
 *     <Text>Premium Card</Text>
 *   </View>
 * </ElectricBorder>
 */
const ElectricBorder: React.FC<ElectricBorderProps> = ({
  children,
  color = '#007AFF',
  borderWidth = 2,
  borderRadius = 16,
  style,
}) => {
  // Animated pulse for glow effect
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Create pulsing animation for electric effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // Interpolate glow intensity
  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  const glowRadius = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 16],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Background glow layer (outermost) */}
      <Animated.View
        style={[
          styles.backgroundGlow,
          {
            borderRadius: borderRadius + 8,
            shadowColor: color,
            shadowOpacity: glowOpacity,
            shadowRadius: glowRadius,
          },
        ]}
      />

      {/* Main border stroke */}
      <View
        style={[
          styles.borderStroke,
          {
            borderColor: color,
            borderWidth,
            borderRadius,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 6,
          },
        ]}
      />

      {/* Inner glow layer */}
      <Animated.View
        style={[
          styles.innerGlow,
          {
            borderColor: color,
            borderWidth: borderWidth * 0.5,
            borderRadius,
            opacity: glowOpacity,
          },
        ]}
      />

      {/* Content */}
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  backgroundGlow: {
    position: 'absolute',
    top: -12,
    left: -12,
    right: -12,
    bottom: -12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
    pointerEvents: 'none',
    zIndex: 0,
  },
  borderStroke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    elevation: 4,
    pointerEvents: 'none',
    zIndex: 1,
  },
  innerGlow: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 2,
    pointerEvents: 'none',
    zIndex: 2,
  },
  content: {
    position: 'relative',
    zIndex: 3,
  },
});

export default ElectricBorder;
