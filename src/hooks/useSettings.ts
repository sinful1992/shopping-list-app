import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { User, FamilyGroup, FamilyRole, JoinRequest } from '../models/types';
import AuthenticationModule from '../services/AuthenticationModule';
import NotificationManager from '../services/NotificationManager';
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
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
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
  }, []);

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
      const stored = await AsyncStorage.getItem('@ocr_server_url');
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

      const currentUser = await AuthenticationModule.getCurrentUser();
      if (!currentUser) return;
      setUser(currentUser);

      if (currentUser.familyGroupId) {
        const group = await AuthenticationModule.getUserFamilyGroup(currentUser.uid);
        setFamilyGroup(group);

        if (group) {
          setInvitationCode(group.invitationCode ?? 'NOT_FOUND');
        }

        if (group && group.memberIds) {
          const memberIdsList = Object.keys(group.memberIds);
          const members = await loadFamilyMembers(memberIdsList);
          setFamilyMembers(members);
        }

        if (currentUser.familyGroupId) {
          joinRequestsUnsubscribeRef.current?.();
          joinRequestsUnsubscribeRef.current = AuthenticationModule.listenForJoinRequests(
            currentUser.familyGroupId,
            setJoinRequests,
          );
        }
      }
    } catch {
      // Failed to load settings
    } finally {
      setLoading(false);
    }
  };

  const loadFamilyMembers = async (memberIds: string[]): Promise<User[]> => {
    if (memberIds.length === 0) return [];

    const snapshots = await Promise.all(
      memberIds.map(id => database().ref(`/users/${id}`).once('value'))
    );

    return snapshots
      .map(snap => snap.val())
      .filter(Boolean);
  };

const updateName = useCallback(async (newName: string): Promise<void> => {
    if (!user) return;

    const firebaseUser = await AuthenticationModule.getCurrentFirebaseUser();
    if (firebaseUser) {
      await firebaseUser.updateProfile({ displayName: newName.trim() });
    }

    await database().ref(`/users/${user.uid}`).update({ displayName: newName.trim() });

    setUser({ ...user, displayName: newName.trim() });
  }, [user]);

  const updateRole = useCallback(async (role: FamilyRole): Promise<void> => {
    if (!user) return;

    const avatar = getRoleAvatar(role);

    await database().ref(`/users/${user.uid}`).update({
      role: role,
      avatar: avatar,
    });

    setUser({ ...user, role, avatar });
  }, [user]);

  const logout = useCallback(async (): Promise<void> => {
    await NotificationManager.clearToken();
    await AuthenticationModule.signOut();
  }, []);

  const deleteAccount = useCallback(async (): Promise<void> => {
    await AuthenticationModule.deleteUserAccount();
  }, []);

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
    retryLoadInvitationCode,
    refresh: loadSettingsData,
  };
}

export default useSettings;
