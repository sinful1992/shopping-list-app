import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, get, update } from '@react-native-firebase/database';
import { updateProfile } from '@react-native-firebase/auth';
import { User, FamilyGroup, FamilyRole, JoinRequest } from '../models/types';
import { useUser } from '../contexts/UserContext';
import AuthenticationModule from '../services/AuthenticationModule';
import CrashReporting from '../services/CrashReporting';
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

  const loadFamilyMembers = async (memberIds: string[]): Promise<User[]> => {
    if (memberIds.length === 0) return [];

    const db = getDatabase();
    // allSettled, not all: a single unreadable member must cost one row, not
    // the whole list. A member admitted into memberIds whose own profile has
    // not caught up yet is exactly such a read.
    const results = await Promise.allSettled(
      memberIds.map(id => get(ref(db, `/users/${id}`)))
    );

    const members: User[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const member = result.value.val();
        if (member) members.push(member);
      } else {
        CrashReporting.recordError(
          result.reason as Error,
          'useSettings loadFamilyMembers',
        );
      }
    }
    return members;
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
