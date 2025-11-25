import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import StoreHistoryService from '../services/StoreHistoryService';
import { COLORS, SHADOWS, RADIUS, SPACING, TYPOGRAPHY, COMMON_STYLES } from '../styles/theme';

interface StoreNamePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (storeName: string) => void;
  initialValue?: string;
}

/**
 * StoreNamePicker
 * Modal component for selecting store name with autocomplete
 * Implements Sprint 6: Store tracking feature
 */
const StoreNamePicker: React.FC<StoreNamePickerProps> = ({
  visible,
  onClose,
  onSelect,
  initialValue = '',
}) => {
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (visible) {
      setInputValue(initialValue);
      loadSuggestions('');
    }
  }, [visible, initialValue]);

  const loadSuggestions = async (query: string) => {
    try {
      const stores = await StoreHistoryService.searchStores(query);
      setSuggestions(stores);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    }
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    loadSuggestions(text);
  };

  const handleSelectSuggestion = (storeName: string) => {
    setInputValue(storeName);
    setShowSuggestions(false);
  };

  const handleConfirm = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onSelect(trimmed);
    }
    onClose();
  };

  const handleSkip = () => {
    onSelect('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {/* Header */}
            <Text style={styles.title}>Store Name</Text>
            <Text style={styles.subtitle}>
              Where are you shopping? (Optional)
            </Text>

            {/* Input */}
            <TextInput
              style={styles.input}
              placeholder="e.g., Tesco, Sainsbury's, Asda..."
              placeholderTextColor={COLORS.text.tertiary}
              value={inputValue}
              onChangeText={handleInputChange}
              onFocus={() => setShowSuggestions(true)}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
            />

            {/* Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsTitle}>Recent stores:</Text>
                <FlatList
                  data={suggestions.slice(0, 5)}
                  keyExtractor={(item, index) => `suggestion-${index}`}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suggestionItem}
                      onPress={() => handleSelectSuggestion(item)}
                    >
                      <Text style={styles.suggestionIcon}>🏪</Text>
                      <Text style={styles.suggestionText}>{item}</Text>
                    </TouchableOpacity>
                  )}
                  style={styles.suggestionsList}
                  nestedScrollEnabled
                />
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkip}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  !inputValue.trim() && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!inputValue.trim()}
              >
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay.darkest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
  },
  modalContent: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: RADIUS.xlarge,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.border.strong,
    ...SHADOWS.large,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xxl + 2,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.text.secondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  input: {
    ...COMMON_STYLES.input,
    fontSize: TYPOGRAPHY.fontSize.lg,
    marginBottom: SPACING.md,
  },
  suggestionsContainer: {
    marginBottom: SPACING.md,
  },
  suggestionsTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.xs,
  },
  suggestionsList: {
    maxHeight: 150,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass.subtle,
    padding: SPACING.md,
    borderRadius: RADIUS.small,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.border.subtle,
  },
  suggestionIcon: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    marginRight: 10,
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.fontSize.md + 1,
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  skipButton: {
    flex: 1,
    ...COMMON_STYLES.button,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  skipButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: COLORS.accent.green,
    padding: SPACING.lg,
    borderRadius: RADIUS.medium,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: COLORS.accent.greenDim,
    opacity: 0.5,
  },
  confirmButtonText: {
    color: COLORS.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default StoreNamePicker;
