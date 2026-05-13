import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface CustomAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: 'error' | 'success' | 'warning' | 'info' | 'confirm';
  buttons?: AlertButton[];
  onDismiss: () => void;
}

const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  icon,
  buttons = [{ text: 'OK', style: 'default' }],
  onDismiss,
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iconConfig = useMemo(() => {
    if (!icon) return null;
    const map = {
      error:   { name: 'close-circle',       color: theme.accent.red },
      success: { name: 'checkmark-circle',   color: theme.accent.green },
      warning: { name: 'warning',            color: theme.accent.yellow },
      info:    { name: 'information-circle', color: theme.accent.blue },
      confirm: { name: 'help-circle',        color: theme.accent.blue },
    };
    return map[icon];
  }, [icon, theme]);

  const handleButtonPress = (button: AlertButton) => {
    onDismiss();
    if (button.onPress) {
      button.onPress();
    }
  };

  const getButtonStyle = (style?: 'default' | 'cancel' | 'destructive') => {
    switch (style) {
      case 'destructive':
        return styles.buttonDestructive;
      case 'cancel':
        return styles.buttonCancel;
      default:
        return styles.buttonDefault;
    }
  };

  const getButtonTextStyle = (style?: 'default' | 'cancel' | 'destructive') => {
    switch (style) {
      case 'destructive':
        return styles.buttonTextDestructive;
      case 'cancel':
        return styles.buttonTextCancel;
      default:
        return styles.buttonTextDefault;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {iconConfig && (
            <View style={styles.iconContainer}>
              <Icon
                name={iconConfig.name}
                size={48}
                color={iconConfig.color}
              />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}
          <View style={[
            styles.buttonContainer,
            buttons.length > 2 && styles.buttonContainerVertical,
          ]}>
            {buttons.map((button, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  getButtonStyle(button.style),
                  buttons.length <= 2 && styles.buttonHorizontal,
                  buttons.length > 2 && styles.buttonVertical,
                ]}
                onPress={() => handleButtonPress(button)}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, getButtonTextStyle(button.style)]}>
                  {button.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.overlay.dark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modal: {
    backgroundColor: theme.background.secondary,
    borderRadius: RADIUS.modal,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    width: '100%',
    maxWidth: 320,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.medium,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  buttonContainerVertical: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.medium,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  buttonHorizontal: {
    flex: 1,
  },
  buttonVertical: {
    width: '100%',
  },
  buttonDefault: {
    backgroundColor: theme.accent.blue,
    borderColor: theme.accent.blueDim,
  },
  buttonCancel: {
    backgroundColor: theme.glass.subtle,
    borderColor: theme.border.subtle,
  },
  buttonDestructive: {
    backgroundColor: theme.accent.red,
    borderColor: theme.accent.redDim,
  },
  buttonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  buttonTextDefault: {
    color: theme.text.primary,
  },
  buttonTextCancel: {
    color: theme.text.secondary,
  },
  buttonTextDestructive: {
    color: theme.text.primary,
  },
});

export default CustomAlert;
