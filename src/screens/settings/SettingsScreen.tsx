import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Clipboard,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useAlert } from '../../contexts/AlertContext';
import { sanitizeError } from '../../utils/sanitize';
import { FamilyRole } from '../../models/types';
import { PRIVACY_POLICY_CONTENT, TERMS_OF_SERVICE_CONTENT } from '../../legal';
import { useSettings } from '../../hooks';
import { version } from '../../../package.json';

/**
 * SettingsScreen
 * Display family group information and settings
 * Implements family group management and user settings
 */
const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const { showAlert } = useAlert();

  // Use custom hook for settings management
  const {
    loading,
    user,
    familyGroup,
    familyMembers,
    invitationCode,
    hapticFeedbackEnabled,
    availableRoles,
    getRoleAvatar,
    toggleHapticFeedback: toggleHapticFeedbackHook,
    updateName,
    updateRole,
    logout,
    deleteAccount,
    retryLoadInvitationCode,
  } = useSettings();

  // UI state only
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<FamilyRole | null>(null);

  const handleToggleHapticFeedback = async (value: boolean) => {
    try {
      await toggleHapticFeedbackHook(value);
    } catch {
      showAlert('Error', 'Failed to save setting', undefined, { icon: 'error' });
    }
  };

  const handleCopyInvitationCode = () => {
    if (invitationCode && invitationCode !== 'ERROR' && invitationCode !== 'NOT_FOUND') {
      Clipboard.setString(invitationCode);
      showAlert('Success', 'Invitation code copied to clipboard', undefined, { icon: 'success' });
    }
  };

  const handleEditName = () => {
    setNewName(user?.displayName || '');
    setShowEditNameModal(true);
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      showAlert('Error', 'Please enter a name', undefined, { icon: 'error' });
      return;
    }

    try {
      await updateName(newName.trim());
      setShowEditNameModal(false);
      showAlert('Success', 'Name updated successfully', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleEditRole = () => {
    setSelectedRole(user?.role || null);
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    if (!selectedRole) {
      showAlert('Error', 'Please select a role', undefined, { icon: 'error' });
      return;
    }

    try {
      await updateRole(selectedRole);
      setShowRoleModal(false);
      showAlert('Success', 'Role updated successfully', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleLogout = () => {
    showAlert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error: any) {
              showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
            }
          },
        },
      ],
      { icon: 'confirm' }
    );
  };

  const handleDeleteAccount = () => {
    showAlert(
      'Delete Account',
      'WARNING: This will permanently delete your account and ALL associated data:\n\n• All your shopping lists\n• All items you created\n• All urgent items\n• All receipt images\n• Your family group (if you\'re the last member)\n\nThis action CANNOT be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            showAlert(
              'Final Confirmation',
              'Are you absolutely sure? This will permanently delete all your data.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'I Understand, Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      showAlert('Success', 'Account deleted successfully', undefined, { icon: 'success' });
                    } catch (error: any) {
                      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
                    }
                  },
                },
              ],
              { icon: 'warning' }
            );
          },
        },
      ],
      { icon: 'warning' }
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
        <View style={styles.infoRow}>
          <Text style={styles.label}>Name:</Text>
          <View style={styles.nameRow}>
            <Text style={styles.value}>{user?.displayName || 'Not set'}</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={handleEditName}
            >
              <Icon name="pencil-outline" size={18} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Family Role:</Text>
          <View style={styles.nameRow}>
            <View style={styles.roleDisplay}>
              {user?.avatar && <Text style={styles.avatar}>{user.avatar}</Text>}
              <Text style={styles.value}>{user?.role || 'Not set'}</Text>
            </View>
            <TouchableOpacity
              style={styles.editButton}
              onPress={handleEditRole}
            >
              <Icon name="pencil-outline" size={18} color="#007AFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* App Settings Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="settings-outline" size={24} color="#007AFF" />
          <Text style={styles.sectionTitle}>App Settings</Text>
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Haptic Feedback</Text>
            <Text style={styles.settingDescription}>
              Enable vibration feedback when checking items while shopping
            </Text>
          </View>
          <Switch
            value={hapticFeedbackEnabled}
            onValueChange={handleToggleHapticFeedback}
            trackColor={{ false: '#3A3A3C', true: '#34C759' }}
            thumbColor={hapticFeedbackEnabled ? '#ffffff' : '#f4f3f4'}
            ios_backgroundColor="#3A3A3C"
          />
        </View>
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
                {!invitationCode ? (
                  <Text style={styles.invitationCode}>Loading...</Text>
                ) : invitationCode === 'ERROR' || invitationCode === 'NOT_FOUND' ? (
                  <Text style={[styles.invitationCode, { color: '#FF453A' }]}>Error - Tap to retry</Text>
                ) : (
                  <Text style={styles.invitationCode}>{invitationCode}</Text>
                )}
                <TouchableOpacity
                  style={[styles.copyButton, (!invitationCode || invitationCode === 'ERROR' || invitationCode === 'NOT_FOUND') && { opacity: 0.5 }]}
                  onPress={() => {
                    if (invitationCode === 'ERROR' || invitationCode === 'NOT_FOUND') {
                      // Retry loading
                      retryLoadInvitationCode();
                    } else {
                      handleCopyInvitationCode();
                    }
                  }}
                  disabled={!invitationCode}
                >
                  <Icon name={invitationCode === 'ERROR' || invitationCode === 'NOT_FOUND' ? 'refresh-outline' : 'copy-outline'} size={20} color="#007AFF" />
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
                      {member.avatar ? (
                        <Text style={styles.memberAvatar}>{member.avatar}</Text>
                      ) : (
                        <Icon name="person" size={20} color="#007AFF" />
                      )}
                    </View>
                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberEmail}>{member.displayName || member.email}</Text>
                        {member.role && (
                          <Text style={styles.memberRole}>{member.role}</Text>
                        )}
                      </View>
                      {member.displayName && (
                        <Text style={styles.memberEmailSmall}>{member.email}</Text>
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

      {/* Legal Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="document-text-outline" size={24} color="#007AFF" />
          <Text style={styles.sectionTitle}>Legal</Text>
        </View>
        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => navigation.navigate('LegalDocument', { title: 'Privacy Policy', content: PRIVACY_POLICY_CONTENT })}
        >
          <Icon name="shield-checkmark-outline" size={20} color="#007AFF" />
          <Text style={styles.legalButtonText}>Privacy Policy</Text>
          <Icon name="chevron-forward-outline" size={16} color="#6E6E73" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => navigation.navigate('LegalDocument', { title: 'Terms of Service', content: TERMS_OF_SERVICE_CONTENT })}
        >
          <Icon name="document-outline" size={20} color="#007AFF" />
          <Text style={styles.legalButtonText}>Terms of Service</Text>
          <Icon name="chevron-forward-outline" size={16} color="#6E6E73" />
        </TouchableOpacity>
      </View>

      {/* Logout Section */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Icon name="log-out-outline" size={24} color="#ffffff" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Danger Zone */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="warning-outline" size={24} color="#FF3B30" />
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
        </View>
        <Text style={styles.dangerWarning}>
          ⚠️ Permanently delete your account and all associated data. This action cannot be undone.
        </Text>
        <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
          <Icon name="trash-outline" size={24} color="#ffffff" />
          <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      {/* App Info */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Family Shopping List v{version}</Text>
        <Text style={styles.footerText}>Family Collaboration Made Easy</Text>
      </View>

      {/* Edit Name Modal */}
      <Modal
        visible={showEditNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter your name"
              placeholderTextColor="#6E6E73"
              value={newName}
              onChangeText={setNewName}
              autoCapitalize="words"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowEditNameModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSaveName}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Select Role Modal */}
      <Modal
        visible={showRoleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Family Role</Text>
            <ScrollView style={styles.roleList}>
              {availableRoles.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleItem,
                    selectedRole === role && styles.roleItemSelected,
                  ]}
                  onPress={() => setSelectedRole(role)}
                >
                  <Text style={styles.roleAvatar}>{getRoleAvatar(role)}</Text>
                  <Text style={[
                    styles.roleText,
                    selectedRole === role && styles.roleTextSelected,
                  ]}>
                    {role}
                  </Text>
                  {selectedRole === role && (
                    <Icon name="checkmark-circle" size={24} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowRoleModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSaveRole}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  memberAvatar: {
    fontSize: 24,
  },
  memberEmail: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  memberEmailSmall: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 12,
    color: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontWeight: '600',
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editButton: {
    padding: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
    color: '#ffffff',
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    fontSize: 16,
    color: '#ffffff',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 1,
    marginLeft: 12,
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginLeft: 0,
  },
  modalButtonConfirm: {
    backgroundColor: 'rgba(0, 122, 255, 0.8)',
    borderColor: 'rgba(0, 122, 255, 0.3)',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextCancel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  roleDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    fontSize: 24,
  },
  roleList: {
    maxHeight: 350,
    marginBottom: 20,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  roleItemSelected: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    borderColor: 'rgba(0, 122, 255, 0.4)',
  },
  roleAvatar: {
    fontSize: 28,
    marginRight: 12,
  },
  roleText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
    flex: 1,
  },
  roleTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#a0a0a0',
    lineHeight: 18,
  },
  dangerTitle: {
    color: '#FF3B30',
  },
  dangerWarning: {
    fontSize: 14,
    color: '#FF6B6B',
    marginBottom: 15,
    lineHeight: 20,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: 'rgba(139, 0, 0, 0.9)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.5)',
    shadowColor: '#8B0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteAccountButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  legalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  legalButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 12,
    fontWeight: '500',
  },
});

export default SettingsScreen;
