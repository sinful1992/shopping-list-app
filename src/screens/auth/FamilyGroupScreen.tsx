import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import AuthenticationModule from '../../services/AuthenticationModule';
import { useAlert } from '../../contexts/AlertContext';

/**
 * FamilyGroupScreen
 * Create or join a family group
 * Implements Req 1.4, 1.5
 */
const FamilyGroupScreen = () => {
  const { showAlert } = useAlert();
  const [groupName, setGroupName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  const handleCreateGroup = async () => {
    if (!groupName) {
      showAlert('Error', 'Please enter a group name', undefined, { icon: 'error' });
      return;
    }

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const group = await AuthenticationModule.createFamilyGroup(groupName, user.uid);

      // Update local user data with new familyGroupId
      await AuthenticationModule.refreshUserData();

      showAlert('Success', `Family group created! Invitation code: ${(group as any).invitationCode}`, undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', error.message, undefined, { icon: 'error' });
    }
  };

  const handleJoinGroup = async () => {
    if (!invitationCode) {
      showAlert('Error', 'Please enter an invitation code', undefined, { icon: 'error' });
      return;
    }

    // Normalize code (remove spaces, uppercase)
    const normalizedCode = invitationCode.trim().toUpperCase().replace(/\s/g, '');

    if (normalizedCode.length !== 8) {
      showAlert('Error', 'Invitation codes must be exactly 8 characters', undefined, { icon: 'error' });
      return;
    }

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      await AuthenticationModule.joinFamilyGroup(normalizedCode, user.uid);

      // Update local user data with new familyGroupId
      await AuthenticationModule.refreshUserData();

      showAlert('Success', 'You have successfully joined the family group!', undefined, { icon: 'success' });
    } catch (error: any) {
      let userMessage = error.message;

      if (error.message.includes('Invalid invitation code')) {
        userMessage = 'Invalid invitation code. Please check the code and try again.';
      } else if (error.message.includes('no longer exists')) {
        userMessage = 'This family group has been deleted by the owner.';
      } else if (error.message.includes('network')) {
        userMessage = 'Network error. Please check your connection and try again.';
      }

      showAlert('Error', userMessage, undefined, { icon: 'error' });
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.container}>
          <Text style={styles.title}>Family Group</Text>

          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'create' && styles.toggleButtonActive]}
              onPress={() => setMode('create')}
            >
              <Text style={[styles.toggleText, mode === 'create' && styles.toggleTextActive]}>
                Create
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'join' && styles.toggleButtonActive]}
              onPress={() => setMode('join')}
            >
              <Text style={[styles.toggleText, mode === 'join' && styles.toggleTextActive]}>
                Join
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'create' ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Family Group Name"
                placeholderTextColor="#6E6E73"
                value={groupName}
                onChangeText={setGroupName}
              />
              <TouchableOpacity style={styles.button} onPress={handleCreateGroup}>
                <Text style={styles.buttonText}>Create Family Group</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Invitation Code (e.g., A3F7K9M2)"
                placeholderTextColor="#6E6E73"
                value={invitationCode}
                onChangeText={setInvitationCode}
                autoCapitalize="characters"
                maxLength={8}
              />
              <TouchableOpacity style={styles.button} onPress={handleJoinGroup}>
                <Text style={styles.buttonText}>Join Family Group</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#0a0a0a',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 30,
    color: '#ffffff',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  toggleButton: {
    flex: 1,
    padding: 15,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.6)',
  },
  toggleText: {
    fontSize: 16,
    color: '#a0a0a0',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 15,
    borderRadius: 16,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    color: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  button: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FamilyGroupScreen;
