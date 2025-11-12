import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import database from '@react-native-firebase/database';
import Icon from 'react-native-vector-icons/Ionicons';
import AuthenticationModule from '../../services/AuthenticationModule';
import { User, FamilyGroup } from '../../models/types';

/**
 * SettingsScreen
 * Display family group information and settings
 * Implements family group management and user settings
 */
const SettingsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [familyMembers, setFamilyMembers] = useState<User[]>([]);

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      setLoading(true);

      // Get current user
      const currentUser = await AuthenticationModule.getCurrentUser();
      if (!currentUser) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }
      setUser(currentUser);

      // Get family group
      if (currentUser.familyGroupId) {
        const group = await AuthenticationModule.getUserFamilyGroup(currentUser.uid);
        setFamilyGroup(group);

        // Get family members
        if (group) {
          const members = await loadFamilyMembers(group.memberIds);
          setFamilyMembers(members);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyMembers = async (memberIds: string[]): Promise<User[]> => {
    try {
      const members: User[] = [];

      for (const memberId of memberIds) {
        const userSnapshot = await database().ref(`/users/${memberId}`).once('value');
        const userData = userSnapshot.val();
        if (userData) {
          members.push(userData);
        }
      }

      return members;
    } catch (error: any) {
      throw new Error(`Failed to load family members: ${error.message}`);
    }
  };

  const handleCopyInvitationCode = () => {
    if (familyGroup?.invitationCode) {
      Clipboard.setString(familyGroup.invitationCode);
      Alert.alert('Success', 'Invitation code copied to clipboard');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthenticationModule.signOut();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* User Info Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="person-circle-outline" size={24} color="#007AFF" />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{user?.email || 'N/A'}</Text>
        </View>
        {user?.displayName && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>{user.displayName}</Text>
          </View>
        )}
      </View>

      {/* Family Group Section */}
      {familyGroup && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="people-outline" size={24} color="#007AFF" />
              <Text style={styles.sectionTitle}>Family Group</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Group Name:</Text>
              <Text style={styles.value}>{familyGroup.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Invitation Code:</Text>
              <View style={styles.codeRow}>
                <Text style={styles.invitationCode}>{familyGroup.invitationCode}</Text>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopyInvitationCode}
                >
                  <Icon name="copy-outline" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.helperText}>
              Share this code with family members to invite them to your group
            </Text>
          </View>

          {/* Family Members Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="people-circle-outline" size={24} color="#007AFF" />
              <Text style={styles.sectionTitle}>Family Members</Text>
            </View>
            {familyMembers.length === 0 ? (
              <Text style={styles.emptyText}>No family members</Text>
            ) : (
              <>
                {familyMembers.map((member, index) => (
                  <View
                    key={member.uid}
                    style={[
                      styles.memberRow,
                      index < familyMembers.length - 1 && styles.memberRowBorder,
                    ]}
                  >
                    <View style={styles.memberIconContainer}>
                      <Icon name="person" size={20} color="#007AFF" />
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberEmail}>{member.email}</Text>
                      {member.displayName && (
                        <Text style={styles.memberName}>{member.displayName}</Text>
                      )}
                      {member.uid === familyGroup.createdBy && (
                        <Text style={styles.creatorBadge}>Group Creator</Text>
                      )}
                      {member.uid === user?.uid && (
                        <Text style={styles.youBadge}>You</Text>
                      )}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </>
      )}

      {/* Logout Section */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Icon name="log-out-outline" size={24} color="#ffffff" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Shopping List App v1.0</Text>
        <Text style={styles.footerText}>Family Collaboration Made Easy</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#a0a0a0',
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 10,
  },
  infoRow: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  invitationCode: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '700',
    letterSpacing: 2,
  },
  copyButton: {
    padding: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  helperText: {
    fontSize: 12,
    color: '#6E6E73',
    marginTop: 10,
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 14,
    color: '#a0a0a0',
    fontStyle: 'italic',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  memberRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  memberIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  memberInfo: {
    flex: 1,
  },
  memberEmail: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 2,
  },
  memberName: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  creatorBadge: {
    fontSize: 12,
    color: '#FFB340',
    fontWeight: '600',
  },
  youBadge: {
    fontSize: 12,
    color: '#30D158',
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingBottom: 40,
  },
  footerText: {
    fontSize: 12,
    color: '#6E6E73',
    marginBottom: 4,
  },
});

export default SettingsScreen;
