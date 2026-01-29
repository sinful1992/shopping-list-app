import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import database from '@react-native-firebase/database';
import { User, FamilyGroup, FamilyRole } from '../models/types';
import AuthenticationModule from '../services/AuthenticationModule';

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

  useEffect(() => {
    loadSettingsData();
    loadHapticFeedbackSetting();
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
          await fetchInvitationCode(currentUser.familyGroupId);
        }

        if (group && group.memberIds) {
          const memberIdsList = Object.keys(group.memberIds);
          const members = await loadFamilyMembers(memberIdsList);
          setFamilyMembers(members);
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

  const fetchInvitationCode = async (familyGroupId: string) => {
    try {
      const invitationsSnapshot = await database()
        .ref('/invitations')
        .orderByChild('groupId')
        .equalTo(familyGroupId)
        .once('value');

      if (invitationsSnapshot.exists()) {
        const invitations = invitationsSnapshot.val();
        const code = Object.keys(invitations)[0];
        setInvitationCode(code);
      } else {
        setInvitationCode('NOT_FOUND');
      }
    } catch {
      setInvitationCode('ERROR');
    }
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
    await AuthenticationModule.signOut();
  }, []);

  const deleteAccount = useCallback(async (): Promise<void> => {
    await AuthenticationModule.deleteUserAccount();
  }, []);

  const retryLoadInvitationCode = useCallback(async (): Promise<void> => {
    if (user?.familyGroupId) {
      await fetchInvitationCode(user.familyGroupId);
    }
  }, [user]);

  return {
    loading,
    user,
    familyGroup,
    familyMembers,
    invitationCode,
    hapticFeedbackEnabled,
    availableRoles: AVAILABLE_ROLES,
    getRoleAvatar,
    toggleHapticFeedback,
    updateName,
    updateRole,
    logout,
    deleteAccount,
    retryLoadInvitationCode,
    refresh: loadSettingsData,
  };
}

export default useSettings;
