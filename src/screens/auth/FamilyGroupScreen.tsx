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
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 30,
    color: '#333',
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    padding: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  toggleButtonActive: {
    backgroundColor: '#007AFF',
  },
  toggleText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FamilyGroupScreen;
