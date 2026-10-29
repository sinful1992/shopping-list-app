import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, update } from '@react-native-firebase/database';
import { updateProfile } from '@react-native-firebase/auth';
import { User, FamilyGroup, FamilyRole, JoinRequest } from '../models/types';
import { useUser } from '../contexts/UserContext';
import AuthenticationModule, { ReauthMethod } from '../services/AuthenticationModule';
import CrashReporting from '../services/CrashReporting';
import { loadFamilyMembers } from '../services/FamilyMembers';
import SyncEngine from '../services/SyncEngine';
import ReceiptOCRService from '../services/ReceiptOCRService';

// Role to avatar mapping
const getRoleAvatar = (role: FamilyRole): string => {
  const avatars: Record<FamilyRole, string> = {
    'Dad': '👨',
    'Mom': '👩',
    'Son': '👦',
    'Daughter': '👧',
    'Older Son': '🧑',
    'Older Daughter': '👩‍🦰',
    'Younger Son': '👶',
    'Younger Daughter': '👧🏻',
  };
  return avatars[role] || '👤';
};

const AVAILABLE_ROLES: FamilyRole[] = [
  'Dad',
  'Mom',
  'Son',
  'Daughter',
  'Older Son',
  'Older Daughter',
  'Younger Son',
  'Younger Daughter',
];

/**
 * useSettings Hook
 *
 * Manages settings state including user profile, family group, and app preferences.
 *
 * Usage:
 *   const { user, familyGroup, familyMembers, loading, updateName, updateRole, ... } = useSettings();
 */
export function useSettings() {
  // Live user from App's auth listener — no re-fetch needed
  const user = useUser();
  const [loading, setLoading] = useState(true);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [familyMembers, setFamilyMembers] = useState<User[]>([]);
  const [invitationCode, setInvitationCode] = useState<string | null>(null);
  const [hapticFeedbackEnabled, setHapticFeedbackEnabled] = useState(false);
  const [ocrServerUrl, setOcrServerUrlState] = useState('');
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const joinRequestsUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadSettingsData();
    loadHapticFeedbackSetting();
    loadOcrServerUrl();
    return () => {
      joinRequestsUnsubscribeRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.familyGroupId]);

  const loadHapticFeedbackSetting = async () => {
    try {
      const value = await AsyncStorage.getItem('hapticFeedbackEnabled');
      if (value !== null) {
        setHapticFeedbackEnabled(value === 'true');
      }
    } catch {
      // Failed to load setting
    }
  };

  const toggleHapticFeedback = useCallback(async (value: boolean): Promise<void> => {
    await AsyncStorage.setItem('hapticFeedbackEnabled', value.toString());
    setHapticFeedbackEnabled(value);
  }, []);

  const loadOcrServerUrl = async () => {
    try {
      const stored = await ReceiptOCRService.getStoredServerUrl();
      setOcrServerUrlState(stored ?? '');
    } catch {
      // Failed to load OCR server URL
    }
  };

  const updateOcrServerUrl = useCallback(async (url: string): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) {
      await ReceiptOCRService.clearServerUrl();
      setOcrServerUrlState('');
      return;
    }
    await ReceiptOCRService.setServerUrl(trimmed);
    setOcrServerUrlState(trimmed.replace(/\/+$/, ''));
  }, []);

  const loadSettingsData = async () => {
    try {
      setLoading(true);

      const currentUser = user;
      if (!currentUser) return;

      if (currentUser.familyGroupId) {
        const group = await AuthenticationModule.getUserFamilyGroup(currentUser.uid);
        setFamilyGroup(group);

        if (group) {
          if (group.invitationCode) {
            setInvitationCode(group.invitationCode);
          } else {
            try {
              const code = await AuthenticationModule.ensureInvitationCode(currentUser.familyGroupId);
              setInvitationCode(code ?? 'NOT_FOUND');
            } catch {
              setInvitationCode('NOT_FOUND');
            }
          }
        }

        // Registered before the member load so that a failure reading members
        // cannot take the join-request listener down with it.
        joinRequestsUnsubscribeRef.current?.();
        joinRequestsUnsubscribeRef.current = AuthenticationModule.listenForJoinRequests(
          currentUser.familyGroupId,
          setJoinRequests,
        );

        if (group && group.memberIds) {
          const memberIdsList = Object.keys(group.memberIds);
          const members = await loadFamilyMembers(memberIdsList);
          setFamilyMembers(members);
        }
      }
    } catch (error: unknown) {
      CrashReporting.recordError(error as Error, 'useSettings loadSettingsData');
    } finally {
      setLoading(false);
    }
  };

  const updateName = useCallback(async (newName: string): Promise<void> => {
    if (!user) return;

    const firebaseUser = await AuthenticationModule.getCurrentFirebaseUser();
    if (firebaseUser) {
      await updateProfile(firebaseUser, { displayName: newName.trim() });
    }

    // Context user refreshes via the live /users/<uid> listener in App
    await update(ref(getDatabase(), `/users/${user.uid}`), { displayName: newName.trim() });
  }, [user]);

  const updateRole = useCallback(async (role: FamilyRole): Promise<void> => {
    if (!user) return;

    const avatar = getRoleAvatar(role);

    // Context user refreshes via the live /users/<uid> listener in App
    await update(ref(getDatabase(), `/users/${user.uid}`), {
      role: role,
      avatar: avatar,
    });
  }, [user]);

  /**
   * Signing out deletes this phone's copy of the data, unsent changes included.
   * Try to send them first; if some are still waiting, report how many and
   * sign out only when called again with force (the user said yes).
   */
  const logout = useCallback(async (opts?: { force?: boolean }): Promise<{ signedOut: boolean; pending: number }> => {
    if (!opts?.force) {
      await SyncEngine.syncPendingChanges().catch(err =>
        CrashReporting.recordError(err as Error, 'useSettings logout flush'));
      // Not caught: if the queue can't even be read, failing the sign-out is
      // safer than deleting changes nobody counted.
      const { pendingOperations } = await SyncEngine.getSyncStatus();
      if (pendingOperations > 0) return { signedOut: false, pending: pendingOperations };
    }
    await AuthenticationModule.signOut();
    return { signedOut: true, pending: 0 };
  }, []);

  const deleteAccount = useCallback(async (password?: string): Promise<boolean> => {
    return AuthenticationModule.deleteUserAccount(password);
  }, []);

  const getReauthMethod = useCallback(
    (): ReauthMethod | null => AuthenticationModule.getReauthMethod(),
    [],
  );

  const retryLoadInvitationCode = useCallback(async (): Promise<void> => {
    if (!user?.familyGroupId) return;
    try {
      const code = await AuthenticationModule.ensureInvitationCode(user.familyGroupId);
      setInvitationCode(code ?? 'NOT_FOUND');
    } catch {
      setInvitationCode('ERROR');
    }
  }, [user]);

  const approveJoinRequest = useCallback(async (requestUserId: string): Promise<void> => {
    if (!user?.familyGroupId) return;
    await AuthenticationModule.approveJoinRequest(user.familyGroupId, requestUserId);
  }, [user]);

  const rejectJoinRequest = useCallback(async (requestUserId: string): Promise<void> => {
    if (!user?.familyGroupId) return;
    await AuthenticationModule.rejectJoinRequest(user.familyGroupId, requestUserId);
  }, [user]);

  return {
    loading,
    user,
    familyGroup,
    familyMembers,
    joinRequests,
    invitationCode,
    hapticFeedbackEnabled,
    ocrServerUrl,
    updateOcrServerUrl,
    availableRoles: AVAILABLE_ROLES,
    getRoleAvatar,
    toggleHapticFeedback,
    updateName,
    updateRole,
    approveJoinRequest,
    rejectJoinRequest,
    logout,
    deleteAccount,
    getReauthMethod,
    retryLoadInvitationCode,
    refresh: loadSettingsData,
  };
}
