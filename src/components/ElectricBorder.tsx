import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

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
 * Static multi-layer border effect with glow and background blur.
 * Creates a constant electric border for premium content.
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
  color = '#00D9FF',
  borderWidth = 2,
  borderRadius = 16,
  style,
}) => {
  // Calculate lighter color variant (60% opacity)
  const lightColor = `${color}99`;

  return (
    <View style={[styles.container, style]}>
      {/* Background glow - heavily blurred gradient */}
      <LinearGradient
        colors={[lightColor, 'transparent', color]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        angle={-30}
        useAngle
        style={[
          styles.backgroundGlow,
          {
            borderRadius: borderRadius * 1.5,
          },
        ]}
      />

      {/* Layers container */}
      <View style={[styles.layers, { borderRadius }]}>
        {/* Glow 2 - more blur */}
        <View
          style={[
            styles.glow2,
            {
              borderColor: lightColor,
              borderWidth,
              borderRadius,
              shadowColor: color,
              shadowRadius: 2 + borderWidth * 0.5,
            },
          ]}
        />

        {/* Glow 1 - slight blur */}
        <View
          style={[
            styles.glow1,
            {
              borderColor: lightColor,
              borderWidth,
              borderRadius,
              shadowColor: color,
              shadowRadius: 0.5 + borderWidth * 0.25,
            },
          ]}
        />

        {/* Main stroke - solid border */}
        <View
          style={[
            styles.stroke,
            {
              borderColor: color,
              borderWidth,
              borderRadius,
            },
          ]}
        />

        {/* Overlay 1 - additional glow inside */}
        <View
          style={[
            styles.overlay1,
            {
              borderRadius: borderRadius - borderWidth,
              shadowColor: color,
            },
          ]}
        />

        {/* Overlay 2 - softer inner glow */}
        <View
          style={[
            styles.overlay2,
            {
              borderRadius: borderRadius - borderWidth,
              shadowColor: lightColor,
            },
          ]}
        />
      </View>

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
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    opacity: 0.3,
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 8,
    zIndex: -1,
    pointerEvents: 'none',
  },
  layers: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 2,
  },
  stroke: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  glow1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    elevation: 3,
    pointerEvents: 'none',
  },
  glow2: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    elevation: 4,
    pointerEvents: 'none',
  },
  overlay1: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
    pointerEvents: 'none',
  },
  overlay2: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 1,
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});

export default ElectricBorder;
