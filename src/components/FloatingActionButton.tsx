import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../styles/theme';

interface FloatingActionButtonProps {
  icon?: string;
  label?: string;
  onPress: () => void;
  backgroundColor?: string;
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * FloatingActionButton (FAB)
 * Primary action button that floats above other content
 * Follows Material Design guidelines for prominence
 */
export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  icon = 'cart',
  label,
  onPress,
  backgroundColor,
  size = 60,
  disabled = false,
  style,
}) => {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.fabContainer,
        style,
        {
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.fab,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.8}
      >
        {disabled ? (
          <LinearGradient
            colors={['#48484A', '#3A3A3C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.fabGradient, { borderRadius: size / 2, width: size, height: size }]}
          >
            <Icon name={icon} size={size * 0.4} color="#FFFFFF" />
            {label && <Text style={styles.fabLabel}>{label}</Text>}
          </LinearGradient>
        ) : (
          <LinearGradient
            colors={[COLORS.gradient.buttonStart, COLORS.gradient.buttonEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.fabGradient, { borderRadius: size / 2, width: size, height: size }]}
          >
            <Icon name={icon} size={size * 0.4} color="#FFFFFF" />
            {label && <Text style={styles.fabLabel}>{label}</Text>}
          </LinearGradient>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    elevation: 8,
    shadowColor: COLORS.accent.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    zIndex: 1000,
  },
  fab: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fabGradient: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
