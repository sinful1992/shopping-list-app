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
              placeholderTextColor="#6E6E73"
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
  },
  modalContent: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 12,
  },
  suggestionsContainer: {
    marginBottom: 12,
  },
  suggestionsTitle: {
    fontSize: 13,
    color: '#a0a0a0',
    marginBottom: 8,
    paddingLeft: 4,
  },
  suggestionsList: {
    maxHeight: 150,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  suggestionIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  suggestionText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  skipButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  skipButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: 'rgba(52, 199, 89, 0.5)',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default StoreNamePicker;
