import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Clipboard,
  TextInput,
  Modal,
  Switch,
} from 'react-native';
import { createStyles } from './SettingsScreen.styles';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../types/navigation';
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';
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
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { showAlert } = useAlert();
  const { theme, themeMode, setThemeMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Use custom hook for settings management
  const {
    loading,
    user,
    familyGroup,
    familyMembers,
    joinRequests,
    invitationCode,
    hapticFeedbackEnabled,
    ocrServerUrl,
    updateOcrServerUrl,
    availableRoles,
    getRoleAvatar,
    toggleHapticFeedback: toggleHapticFeedbackHook,
    updateName,
    updateRole,
    approveJoinRequest,
    rejectJoinRequest,
    logout,
    deleteAccount,
    retryLoadInvitationCode,
  } = useSettings();

  // UI state only
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<FamilyRole | null>(null);
  const [showOcrUrlModal, setShowOcrUrlModal] = useState(false);
  const [newOcrUrl, setNewOcrUrl] = useState('');

  const handleToggleHapticFeedback = async (value: boolean) => {
    try {
      await toggleHapticFeedbackHook(value);
    } catch {
      showAlert('Error', 'Failed to save setting', undefined, { icon: 'error' });
    }
  };

  const handleEditOcrUrl = () => {
    setNewOcrUrl(ocrServerUrl || '');
    setShowOcrUrlModal(true);
  };

  const handleSaveOcrUrl = async () => {
    try {
      await updateOcrServerUrl(newOcrUrl.trim());
      setShowOcrUrlModal(false);
      showAlert('Success', 'OCR server URL updated', undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    }
  };

  const handleApproveJoinRequest = async (requestUserId: string, displayName: string | null) => {
    setApprovingId(requestUserId);
    try {
      await approveJoinRequest(requestUserId);
      showAlert('Approved', `${displayName || 'User'} has been added to the family group.`, undefined, { icon: 'success' });
    } catch (error: any) {
      showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectJoinRequest = (requestUserId: string, displayName: string | null) => {
    showAlert(
      'Decline Request',
      `Decline join request from ${displayName || 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setRejectingId(requestUserId);
            try {
              await rejectJoinRequest(requestUserId);
            } catch (error: any) {
              showAlert('Error', sanitizeError(error), undefined, { icon: 'error' });
            } finally {
              setRejectingId(null);
            }
          },
        },
      ],
      { icon: 'confirm' },
    );
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
        <ActivityIndicator size="large" color={theme.accent.blue} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* User Info Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="person-circle-outline" size={24} color={theme.accent.blue} />
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
              <Icon name="pencil-outline" size={18} color={theme.accent.blue} />
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
              <Icon name="pencil-outline" size={18} color={theme.accent.blue} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* App Settings Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="settings-outline" size={24} color={theme.accent.blue} />
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
        <View style={styles.themeSettingBlock}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Theme</Text>
            <Text style={styles.settingDescription}>
              Auto follows your phone, or force light/dark
            </Text>
          </View>
          <View style={styles.themeSegmentedRow}>
            {(["system", "light", "dark"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.themeButton, themeMode === mode && styles.themeButtonActive]}
                onPress={() => setThemeMode(mode)}
              >
                <Text style={[styles.themeButtonText, themeMode === mode && styles.themeButtonTextActive]}>
                  {mode === "system" ? "Auto" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TouchableOpacity style={styles.settingRow} onPress={handleEditOcrUrl}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>OCR Server</Text>
            <Text style={styles.settingDescription}>
              {ocrServerUrl ? ocrServerUrl : 'Using default endpoint - tap to override'}
            </Text>
          </View>
          <Icon name="chevron-forward-outline" size={20} color={theme.text.secondary} />
        </TouchableOpacity>
      </View>

      {/* Family Group Section */}
      {familyGroup && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="people-outline" size={24} color={theme.accent.blue} />
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
                  <Text style={[styles.invitationCode, { color: theme.accent.red }]}>Error - Tap to retry</Text>
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
                  <Icon name={invitationCode === 'ERROR' || invitationCode === 'NOT_FOUND' ? 'refresh-outline' : 'copy-outline'} size={20} color={theme.accent.blue} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.helperText}>
              Share this code with family members to invite them to your group
            </Text>
          </View>

          {/* Join Requests Section — only shown when there are pending requests */}
          {joinRequests.length > 0 && (
            <View style={[styles.section, { borderColor: 'rgba(255, 179, 64, 0.3)' }]}>
              <View style={styles.sectionHeader}>
                <Icon name="person-add-outline" size={24} color="#FFB340" />
                <Text style={[styles.sectionTitle, { color: '#FFB340' }]}>Join Requests</Text>
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsBadgeText}>{joinRequests.length}</Text>
                </View>
              </View>
              {joinRequests.map((req, index) => (
                <View
                  key={req.userId}
                  style={[
                    styles.memberRow,
                    index < joinRequests.length - 1 && styles.memberRowBorder,
                  ]}
                >
                  <View style={[styles.memberIconContainer, { borderColor: 'rgba(255, 179, 64, 0.3)', backgroundColor: 'rgba(255, 179, 64, 0.1)' }]}>
                    <Icon name="person-outline" size={20} color="#FFB340" />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberEmail}>{req.displayName || req.email}</Text>
                    {req.displayName && <Text style={styles.memberEmailSmall}>{req.email}</Text>}
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={[styles.requestActionButton, styles.requestApproveButton]}
                      onPress={() => handleApproveJoinRequest(req.userId, req.displayName)}
                      disabled={approvingId === req.userId || rejectingId === req.userId}
                    >
                      {approvingId === req.userId
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Icon name="checkmark" size={18} color="#fff" />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.requestActionButton, styles.requestRejectButton]}
                      onPress={() => handleRejectJoinRequest(req.userId, req.displayName)}
                      disabled={approvingId === req.userId || rejectingId === req.userId}
                    >
                      {rejectingId === req.userId
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Icon name="close" size={18} color="#fff" />}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Family Members Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="people-circle-outline" size={24} color={theme.accent.blue} />
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
                        <Icon name="person" size={20} color={theme.accent.blue} />
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

      {/* Subscription Section */}
      <TouchableOpacity style={styles.section} onPress={() => navigation.navigate('Subscription')}>
        <View style={styles.sectionHeader}>
          <Icon name="star-outline" size={24} color={theme.accent.blue} />
          <Text style={styles.sectionTitle}>Subscription</Text>
          <Icon name="chevron-forward-outline" size={20} color={theme.text.secondary} style={{ marginLeft: 'auto' }} />
        </View>
        <Text style={styles.helperText}>Manage your Pro plan, view usage limits, and upgrade</Text>
      </TouchableOpacity>

      {/* Legal Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="document-text-outline" size={24} color={theme.accent.blue} />
          <Text style={styles.sectionTitle}>Legal</Text>
        </View>
        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => navigation.navigate('LegalDocument', { title: 'Privacy Policy', content: PRIVACY_POLICY_CONTENT })}
        >
          <Icon name="shield-checkmark-outline" size={20} color={theme.accent.blue} />
          <Text style={styles.legalButtonText}>Privacy Policy</Text>
          <Icon name="chevron-forward-outline" size={16} color={theme.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.legalButton}
          onPress={() => navigation.navigate('LegalDocument', { title: 'Terms of Service', content: TERMS_OF_SERVICE_CONTENT })}
        >
          <Icon name="document-outline" size={20} color={theme.accent.blue} />
          <Text style={styles.legalButtonText}>Terms of Service</Text>
          <Icon name="chevron-forward-outline" size={16} color={theme.text.secondary} />
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
              placeholderTextColor={theme.text.tertiary}
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

      {/* OCR Server URL Modal */}
      <Modal
        visible={showOcrUrlModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOcrUrlModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>OCR Server URL</Text>
            <Text style={[styles.settingDescription, { marginBottom: 12 }]}>
              Enter a custom OCR server URL, or leave blank to restore the default.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://sinful1-receipt-ocr.hf.space"
              placeholderTextColor={theme.text.tertiary}
              value={newOcrUrl}
              onChangeText={setNewOcrUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowOcrUrlModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSaveOcrUrl}
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
                    <Icon name="checkmark-circle" size={24} color={theme.accent.blue} />
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

export default SettingsScreen;
