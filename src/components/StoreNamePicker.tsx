import React, { useState, useEffect, useMemo } from 'react';
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
import LinearGradient from 'react-native-linear-gradient';
import StoreHistoryService from '../services/StoreHistoryService';
import { SHADOWS, RADIUS, SPACING, TYPOGRAPHY } from '../styles/theme';
import type { Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

interface StoreNamePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (storeName: string) => void;
  initialValue?: string;
}

const StoreNamePicker: React.FC<StoreNamePickerProps> = ({
  visible,
  onClose,
  onSelect,
  initialValue = '',
}) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
      // Failed to load suggestions
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

  const handleCancel = () => {
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
          <LinearGradient
            colors={[theme.gradient.modalStart, theme.gradient.modalEnd]}
            style={styles.modalContent}
          >
            <Text style={styles.title}>Store Name</Text>
            <Text style={styles.subtitle}>
              Where are you shopping? (Optional)
            </Text>

            <TextInput
              style={styles.input}
              placeholder="e.g., Tesco, Sainsbury's, Asda..."
              placeholderTextColor={theme.text.tertiary}
              value={inputValue}
              onChangeText={handleInputChange}
              onFocus={() => setShowSuggestions(true)}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
            />

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

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButtonWrapper, !inputValue.trim() && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={!inputValue.trim()}
              >
                <LinearGradient
                  colors={['#6EA8FE', '#A78BFA']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.confirmButton}
                >
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.overlay.darkest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: RADIUS.xlarge,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: theme.border.medium,
    ...SHADOWS.large,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xxl + 2,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: theme.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: theme.text.secondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  input: {
    backgroundColor: theme.glass.subtle,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    color: theme.text.primary,
    padding: 14,
    fontSize: TYPOGRAPHY.fontSize.lg,
    marginBottom: SPACING.md,
  },
  suggestionsContainer: {
    marginBottom: SPACING.md,
  },
  suggestionsTitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: theme.text.secondary,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.xs,
  },
  suggestionsList: {
    maxHeight: 150,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.glass.subtle,
    padding: SPACING.md,
    borderRadius: RADIUS.small,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  suggestionIcon: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    marginRight: 10,
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.fontSize.md + 1,
    color: theme.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.medium,
    borderRadius: RADIUS.large,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: theme.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  confirmButtonWrapper: {
    flex: 1,
  },
  confirmButton: {
    padding: SPACING.lg,
    borderRadius: RADIUS.medium,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: theme.text.primary,
    fontSize: TYPOGRAPHY.fontSize.lg,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
});

export default StoreNamePicker;
