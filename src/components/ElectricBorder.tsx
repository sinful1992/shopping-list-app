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
 * Multi-layer border effect with glow and background effects.
 * Creates an electric, premium border for highlighted content.
 *
 * @example
 * <ElectricBorder color="#007AFF" borderWidth={2}>
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
  // Calculate lighter color for glow (increase lightness)
  // Simple approximation: add alpha or use lighter variant
  const lightColor = `${color}99`; // Add 60% opacity for lighter effect

  return (
    <View style={[styles.container, style]}>
      {/* Layers container (absolute positioning) */}
      <View style={[styles.layersContainer, { borderRadius }]}>
        {/* 4. Background glow - scaled and blurred */}
        <LinearGradient
          colors={[lightColor, 'transparent', color]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          angle={-30}
          useAngle
          style={[
            styles.backgroundGlow,
            {
              borderRadius,
            },
          ]}
        />

        {/* 1. Solid stroke */}
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

        {/* 2. Glow layer 1 - slight blur */}
        <View
          style={[
            styles.glow1,
            {
              borderColor: lightColor,
              borderWidth,
              borderRadius,
            },
          ]}
        />

        {/* 3. Glow layer 2 - more blur */}
        <View
          style={[
            styles.glow2,
            {
              borderColor: lightColor,
              borderWidth,
              borderRadius,
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
  layersContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
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
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 2,
    pointerEvents: 'none',
  },
  glow2: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.5,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
    pointerEvents: 'none',
  },
  backgroundGlow: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    opacity: 0.3,
    // Scale approximation with negative inset
    zIndex: -1,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});

export default ElectricBorder;
