import React, { useMemo } from 'react';
import {
  Modal,
  KeyboardAvoidingView,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { View } from 'react-native';
import { RADIUS, SPACING } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useBottomInset } from '../hooks/useBottomInset';

interface ModalBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The sheet itself, and the only place the bottom inset is read.
 *
 * It has to be a separate component below the SafeAreaProvider: on Android an
 * RN <Modal> is its own native window, and the app-level provider does not
 * measure it. Reading useSafeAreaInsets() from the component that renders the
 * <Modal> returns bottom=0 there while the same hook returns 48 on the screen
 * behind it — measured on a Pixel 6 AVD with 3-button navigation. Padding by
 * that 0 is what left Save and Cancel under the navigation bar.
 */
const Sheet: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const bottomInset = useBottomInset();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.overlay}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <LinearGradient
        colors={[theme.gradient.modalStart, theme.gradient.modalEnd]}
        style={[styles.modal, { paddingBottom: bottomInset + SPACING.lg }]}
        accessibilityViewIsModal
      >
        <View style={styles.modalHandleContainer}>
          <View style={styles.modalHandle} />
        </View>
        {children}
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const ModalBottomSheet: React.FC<ModalBottomSheetProps> = ({ visible, onClose, children }) => (
  <Modal
    visible={visible}
    transparent
    animationType="slide"
    onRequestClose={onClose}
  >
    {/* Measures this modal's own window, so the sheet inside it gets a live
        inset rather than the 0 the app-level provider reports here. The other
        sheets rely on the initialWindowMetrics fallback in useBottomInset. */}
    <SafeAreaProvider style={StyleSheet.absoluteFill}>
      <Sheet onClose={onClose}>{children}</Sheet>
    </SafeAreaProvider>
  </Modal>
);

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.overlay.dark,
  },
  modal: {
    borderTopLeftRadius: RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    maxHeight: '90%',
    // paddingBottom is applied inline: useBottomInset (the nav bar is taller
    // than any literal we could put here) plus SPACING.lg. The inset alone is
    // the line nothing may be drawn below, not spacing — padding by exactly it
    // lands the footer buttons flush on the nav bar, the only edge of the sheet
    // with no air. The added lg matches the footers' own paddingTop, so the
    // button row sits in a symmetric band.
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.border.strong,
  },
});

export default ModalBottomSheet;
