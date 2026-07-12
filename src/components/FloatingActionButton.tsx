import React, { useState, useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import type { Theme } from '../styles/theme';

interface FloatingActionButtonProps {
  icon?: string;
  label?: string;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
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
  size = 60,
  disabled = false,
  style,
  accessibilityLabel,
}) => {
  const [pressed, setPressed] = useState(false);
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Animated.View
      style={[
        styles.fabContainer,
        style,
        {
          transform: [{ scale: pressed ? 0.9 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: '150ms',
        } as any,
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
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? 'Primary action'}
        accessibilityState={{ disabled }}
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
            colors={[theme.gradient.buttonStart, theme.gradient.buttonEnd]}
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

const createStyles = (theme: Theme) => StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    elevation: 8,
    shadowColor: theme.accent.blue,
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
