import React from 'react';
import {
  Modal,
  KeyboardAvoidingView,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { View } from 'react-native';
import { COLORS, RADIUS, COMMON_STYLES } from '../styles/theme';

interface ModalBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const ModalBottomSheet: React.FC<ModalBottomSheetProps> = ({ visible, onClose, children }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <LinearGradient
          colors={[COLORS.gradient.modalStart, COLORS.gradient.modalEnd]}
          style={styles.modal}
        >
          <View style={COMMON_STYLES.modalHandleContainer}>
            <View style={COMMON_STYLES.modalHandle} />
          </View>
          {children}
        </LinearGradient>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay.dark,
  },
  modal: {
    borderTopLeftRadius: RADIUS.modal,
    borderTopRightRadius: RADIUS.modal,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});

export default ModalBottomSheet;
