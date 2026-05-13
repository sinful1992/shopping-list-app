import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AuthenticationModule from '../../services/AuthenticationModule';
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Theme } from '../../styles/theme';

type JoinState = 'idle' | 'pending' | 'approved' | 'rejected';

const FamilyGroupScreen = () => {
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [groupName, setGroupName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);

  const [joinState, setJoinState] = useState<JoinState>('idle');
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null);
  const [pendingGroupName, setPendingGroupName] = useState<string | null>(null);

  const approvalUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      approvalUnsubscribeRef.current?.();
    };
  }, []);

  const stopApprovalListener = () => {
    approvalUnsubscribeRef.current?.();
    approvalUnsubscribeRef.current = null;
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      showAlert('Error', 'Please enter a group name', undefined, { icon: 'error' });
      return;
    }

    setLoading(true);
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const result = await AuthenticationModule.createFamilyGroup(groupName.trim(), user.uid);
      await AuthenticationModule.refreshUserData();

      showAlert('Success', `Family group created! Invitation code: ${result.invitationCode}`, undefined, { icon: 'success' });
    } catch (error: unknown) {
      showAlert('Error', error instanceof Error ? error.message : 'Something went wrong.', undefined, { icon: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestJoin = async () => {
    const normalized = invitationCode.trim().toUpperCase().replace(/\s/g, '');
    if (normalized.length !== 8) {
      showAlert('Error', 'Invitation codes must be exactly 8 characters', undefined, { icon: 'error' });
      return;
    }

    setLoading(true);
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      const { groupId, groupName: name } = await AuthenticationModule.submitJoinRequest(normalized, user.uid);

      setPendingGroupId(groupId);
      setPendingGroupName(name);
      setJoinState('pending');

      approvalUnsubscribeRef.current = AuthenticationModule.listenForJoinApproval(
        groupId,
        user.uid,
        async (status) => {
          if (status === 'approved') {
            stopApprovalListener();
            setJoinState('approved');
            try {
              await AuthenticationModule.completeJoinAfterApproval(groupId, user.uid);
              await AuthenticationModule.refreshUserData();
            } catch {
              // refreshUserData triggers onAuthStateChanged which navigates
            }
          } else if (status === 'rejected') {
            stopApprovalListener();
            setJoinState('rejected');
          }
        },
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Something went wrong.';
      showAlert('Error', msg, undefined, { icon: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    const user = await AuthenticationModule.getCurrentUser();
    if (user && pendingGroupId) {
      await AuthenticationModule.cancelJoinRequest(pendingGroupId, user.uid).catch(() => {});
    }
    stopApprovalListener();
    setPendingGroupId(null);
    setPendingGroupName(null);
    setJoinState('idle');
  };

  const handleRetryAfterRejection = () => {
    setPendingGroupId(null);
    setPendingGroupName(null);
    setJoinState('idle');
    setInvitationCode('');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.primary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.container}>
            <Text style={styles.title}>Family Group</Text>

            {/* Waiting for approval */}
            {joinState === 'pending' && (
              <View style={styles.waitingCard}>
                <ActivityIndicator size="large" color={theme.accent.blue} style={{ marginBottom: 20 }} />
                <Text style={styles.waitingTitle}>Request Sent</Text>
                <Text style={styles.waitingSubtitle}>
                  Waiting for a member of{'\n'}
                  <Text style={styles.waitingGroupName}>{pendingGroupName}</Text>
                  {'\n'}to approve your request.
                </Text>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRequest}>
                  <Text style={styles.cancelButtonText}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Rejected */}
            {joinState === 'rejected' && (
              <View style={styles.waitingCard}>
                <Text style={styles.rejectedIcon}>✗</Text>
                <Text style={styles.rejectedTitle}>Request Declined</Text>
                <Text style={styles.waitingSubtitle}>
                  Your request to join{'\n'}
                  <Text style={styles.waitingGroupName}>{pendingGroupName}</Text>
                  {'\n'}was declined.
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetryAfterRejection}>
                  <LinearGradient colors={['#6EA8FE', '#A78BFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
                    <Text style={styles.buttonText}>Try Another Code</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* Approved — brief flash before auth state navigates away */}
            {joinState === 'approved' && (
              <View style={styles.waitingCard}>
                <Text style={styles.approvedIcon}>✓</Text>
                <Text style={styles.approvedTitle}>Welcome to the family!</Text>
                <ActivityIndicator color={theme.accent.green} style={{ marginTop: 16 }} />
              </View>
            )}

            {/* Normal create/join UI */}
            {joinState === 'idle' && (
              <>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[styles.toggleButton, mode === 'create' && styles.toggleButtonActive]}
                    onPress={() => setMode('create')}
                  >
                    <Text style={[styles.toggleText, mode === 'create' && styles.toggleTextActive]}>Create</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleButton, mode === 'join' && styles.toggleButtonActive]}
                    onPress={() => setMode('join')}
                  >
                    <Text style={[styles.toggleText, mode === 'join' && styles.toggleTextActive]}>Join</Text>
                  </TouchableOpacity>
                </View>

                {mode === 'create' ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Family Group Name"
                      placeholderTextColor={theme.text.tertiary}
                      value={groupName}
                      onChangeText={setGroupName}
                      editable={!loading}
                    />
                    <TouchableOpacity style={loading ? styles.buttonDisabled : undefined} onPress={handleCreateGroup} disabled={loading}>
                      <LinearGradient colors={['#6EA8FE', '#A78BFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Family Group</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Invitation Code (e.g., A3F7K9M2)"
                      placeholderTextColor={theme.text.tertiary}
                      value={invitationCode}
                      onChangeText={setInvitationCode}
                      autoCapitalize="characters"
                      maxLength={8}
                      editable={!loading}
                    />
                    <Text style={styles.joinHint}>
                      A member of the group will need to approve your request.
                    </Text>
                    <TouchableOpacity style={loading ? styles.buttonDisabled : undefined} onPress={handleRequestJoin} disabled={loading}>
                      <LinearGradient colors={['#6EA8FE', '#A78BFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Request to Join</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.background.primary,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 30,
    color: theme.text.primary,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.glass.subtle,
    borderWidth: 1,
    borderColor: theme.border.subtle,
  },
  toggleButton: {
    flex: 1,
    padding: 15,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: theme.accent.blueSubtle,
  },
  toggleText: {
    fontSize: 16,
    color: theme.text.tertiary,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: theme.text.primary,
  },
  input: {
    backgroundColor: theme.glass.subtle,
    padding: 15,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    color: theme.text.primary,
  },
  joinHint: {
    fontSize: 13,
    color: theme.text.quaternary,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  button: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingCard: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  waitingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.text.primary,
    marginBottom: 16,
  },
  waitingSubtitle: {
    fontSize: 16,
    color: theme.text.secondary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 40,
  },
  waitingGroupName: {
    color: theme.accent.blue,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
  },
  cancelButtonText: {
    color: theme.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  rejectedIcon: {
    fontSize: 52,
    color: theme.accent.red,
    marginBottom: 12,
  },
  rejectedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.accent.red,
    marginBottom: 16,
  },
  approvedIcon: {
    fontSize: 52,
    color: theme.accent.green,
    marginBottom: 12,
  },
  approvedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.accent.green,
    marginBottom: 16,
  },
  retryButton: {
    width: '100%',
  },
});

export default FamilyGroupScreen;
