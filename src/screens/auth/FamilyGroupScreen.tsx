import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AuthenticationModule from '../../services/AuthenticationModule';

/**
 * FamilyGroupScreen
 * Create or join a family group
 * Implements Req 1.4, 1.5
 */
const FamilyGroupScreen = () => {
  const [groupName, setGroupName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  const handleCreateGroup = async () => {
    if (!groupName) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const group = await AuthenticationModule.createFamilyGroup(groupName, user.uid);

      // Update local user data with new familyGroupId
      await AuthenticationModule.refreshUserData();

      Alert.alert('Success', `Family group created! Invitation code: ${group.invitationCode}`);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleJoinGroup = async () => {
    if (!invitationCode) {
      Alert.alert('Error', 'Please enter an invitation code');
      return;
    }

    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      await AuthenticationModule.joinFamilyGroup(invitationCode.toUpperCase(), user.uid);

      // Update local user data with new familyGroupId
      await AuthenticationModule.refreshUserData();

      Alert.alert('Success', 'Joined family group!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
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
