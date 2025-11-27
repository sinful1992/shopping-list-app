import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import { User, UserCredential, FamilyGroup, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import PaymentService from './PaymentService';

/**
 * AuthenticationModule
 * Manages user registration, login, logout, and family group membership
 * Implements Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
class AuthenticationModule {
  private readonly AUTH_TOKEN_KEY = '@auth_token';
  private readonly USER_KEY = '@user';

  /**
   * Sign up new user with email and password
   * Implements Req 1.1, 1.2
   */
  async signUp(email: string, password: string, displayName?: string): Promise<UserCredential> {
    try {
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      const token = await userCredential.user.getIdToken();

      // Update Firebase Auth profile with display name
      if (displayName) {
        await userCredential.user.updateProfile({ displayName });
      }

      const user: User = {
        uid: userCredential.user.uid,
        email: userCredential.user.email || email,
        displayName: displayName || userCredential.user.displayName,
        familyGroupId: null,
        createdAt: Date.now(),
        usageCounters: {
          listsCreated: 0,
          ocrProcessed: 0,
          urgentItemsCreated: 0,
          lastResetDate: Date.now(),
        },
      };

      // Store user data in Realtime Database
      await database().ref(`/users/${user.uid}`).set(user);

      // Cache locally
      await this.storeAuthData(user, token);

      // Set user ID in RevenueCat
      await PaymentService.setUserID(user.uid);

      return { user, token };
    } catch (error: any) {
      throw new Error(`Sign up failed: ${error.message}`);
    }
  }

  /**
   * Sign in existing user with email and password
   * Implements Req 1.2
   */
  async signIn(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await auth().signInWithEmailAndPassword(email, password);
      const token = await userCredential.user.getIdToken();

      // Fetch user data from database
      const userSnapshot = await database().ref(`/users/${userCredential.user.uid}`).once('value');
      const user: User = userSnapshot.val();

      if (!user) {
        throw new Error('User data not found');
      }

      await this.storeAuthData(user, token);

      // Set user ID in RevenueCat
      await PaymentService.setUserID(user.uid);

      return { user, token };
    } catch (error: any) {
      throw new Error(`Sign in failed: ${error.message}`);
    }
  }

  /**
   * Sign in with Google
   * Implements Req 1.2
   */
  async signInWithGoogle(): Promise<UserCredential> {
    // Note: Requires Google Sign-In configuration
    // Implementation would use @react-native-google-signin/google-signin
    throw new Error('Google Sign-In not yet implemented. Configure Google Sign-In first.');
  }

  /**
   * Get current Firebase user
   */
  async getCurrentFirebaseUser(): Promise<FirebaseAuthTypes.User | null> {
    return auth().currentUser;
  }

  /**
   * Sign out current user
   * Implements Req 1.6
   */
  async signOut(): Promise<void> {
    try {
      await auth().signOut();
      // Clear user data from regular storage
      await AsyncStorage.removeItem(this.USER_KEY);
      // Clear token from encrypted storage
      await EncryptedStorage.removeItem(this.AUTH_TOKEN_KEY);

      // Logout from RevenueCat
      await PaymentService.logout();
    } catch (error: any) {
      throw new Error(`Sign out failed: ${error.message}`);
    }
  }

  /**
   * Get user's family group
   * Implements Req 1.3
   */
  async getUserFamilyGroup(userId: string): Promise<FamilyGroup | null> {
    try {
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const user = userSnapshot.val();

      if (!user || !user.familyGroupId) {
        return null;
      }

      const groupSnapshot = await database()
        .ref(`/familyGroups/${user.familyGroupId}`)
        .once('value');

      return groupSnapshot.val();
    } catch (error: any) {
      throw new Error(`Failed to get family group: ${error.message}`);
    }
  }

  /**
   * Validate if a family group exists in Firebase
   * Used to check if a family group was deleted
   */
  async validateFamilyGroupExists(groupId: string): Promise<boolean> {
    try {
      const groupSnapshot = await database()
        .ref(`/familyGroups/${groupId}`)
        .once('value');
      return groupSnapshot.exists();
    } catch (error) {
      return false;
    }
  }

  /**
   * Create new family group
   * Implements Req 1.5
   */
  async createFamilyGroup(groupName: string, userId: string): Promise<FamilyGroup> {
    try {
      const groupId = database().ref().push().key;
      if (!groupId) {
        throw new Error('Failed to generate group ID');
      }

      const invitationCode = this.generateInvitationCode();
      const timestamp = Date.now();

      // FamilyGroup no longer stores invitationCode
      const familyGroup: FamilyGroup = {
        id: groupId,
        name: groupName,
        createdBy: userId,
        memberIds: { [userId]: true },
        createdAt: timestamp,
        subscriptionTier: 'free', // New family groups start with free tier
      };

      // Atomic multi-path update: create both family group AND invitation entry
      const updates: { [key: string]: any } = {};
      updates[`/familyGroups/${groupId}`] = familyGroup;
      updates[`/invitations/${invitationCode}`] = {
        groupId: groupId,
        createdAt: timestamp,
      };
      updates[`/users/${userId}/familyGroupId`] = groupId;

      await database().ref().update(updates);

      // Update cached user data
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const updatedUser = userSnapshot.val();
      if (updatedUser) {
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }

      // Return family group with invitation code for display
      return {
        ...familyGroup,
        invitationCode, // Include in return value for UI display
      } as any; // Type assertion since invitationCode is not in FamilyGroup interface
    } catch (error: any) {
      throw new Error(`Failed to create family group: ${error.message}`);
    }
  }

  /**
   * Join existing family group using invitation code
   * Implements Req 1.4
   */
  async joinFamilyGroup(invitationCode: string, userId: string): Promise<FamilyGroup> {
    try {
      // STEP 1: Lookup groupId from invitation table (O(1) operation)
      const invitationSnapshot = await database()
        .ref(`/invitations/${invitationCode}`)
        .once('value');

      if (!invitationSnapshot.exists()) {
        throw new Error('Invalid invitation code');
      }

      const invitationData = invitationSnapshot.val();
      const groupId = invitationData.groupId;

      // STEP 2: Add user to family group first (so we can read it after)
      const updates: { [key: string]: any } = {};
      updates[`/familyGroups/${groupId}/memberIds/${userId}`] = true;
      updates[`/users/${userId}/familyGroupId`] = groupId;

      await database().ref().update(updates);

      // STEP 3: Now we can read the group (we're a member now)
      const groupSnapshot = await database()
        .ref(`/familyGroups/${groupId}`)
        .once('value');

      if (!groupSnapshot.exists()) {
        // Group was deleted - remove our membership
        await database().ref(`/familyGroups/${groupId}/memberIds/${userId}`).remove();
        await database().ref(`/users/${userId}/familyGroupId`).remove();
        throw new Error('Family group no longer exists');
      }

      const familyGroup: FamilyGroup = groupSnapshot.val();

      // STEP 4: Update cached user data
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const updatedUser = userSnapshot.val();
      if (updatedUser) {
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }

      return familyGroup;
    } catch (error: any) {
      // Provide specific error messages based on error type
      if (error.message.includes('Invalid invitation code')) {
        throw new Error('Invalid invitation code. Please check and try again.');
      } else if (error.message.includes('no longer exists')) {
        throw new Error('This family group has been deleted.');
      } else if (error.code === 'PERMISSION_DENIED') {
        throw new Error('Permission denied. Please contact support.');
      } else {
        throw new Error(`Failed to join family group: ${error.message}`);
      }
    }
  }

  /**
   * Get current authenticated user
   * Implements Req 1.2
   * Always fetches fresh data from database to ensure familyGroupId is up-to-date
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return null;
      }

      // Always fetch fresh data from database to ensure familyGroupId is current
      const userSnapshot = await database().ref(`/users/${currentUser.uid}`).once('value');
      const userData = userSnapshot.val();

      if (userData) {
        // Update cache with fresh data
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(userData));
      }

      return userData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get authentication token
   * Implements Req 1.2
   * SECURITY: Token is stored in encrypted storage (EncryptedSharedPreferences on Android, Keychain on iOS)
   */
  async getAuthToken(): Promise<string | null> {
    try {
      // Try encrypted storage first
      const token = await EncryptedStorage.getItem(this.AUTH_TOKEN_KEY);
      if (token) {
        return token;
      }

      // Migration: Check if token exists in old AsyncStorage
      const oldToken = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
      if (oldToken) {
        // Migrate to encrypted storage
        await EncryptedStorage.setItem(this.AUTH_TOKEN_KEY, oldToken);
        await AsyncStorage.removeItem(this.AUTH_TOKEN_KEY);
        return oldToken;
      }

      // Get fresh token from Firebase
      const currentUser = auth().currentUser;
      if (currentUser) {
        const freshToken = await currentUser.getIdToken();
        await EncryptedStorage.setItem(this.AUTH_TOKEN_KEY, freshToken);
        return freshToken;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Listen for authentication state changes
   * Implements Req 1.2
   */
  onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe {
    let userDataUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      // Clean up previous user data listener
      if (userDataUnsubscribe) {
        userDataUnsubscribe();
        userDataUnsubscribe = null;
      }

      if (firebaseUser) {
        const userRef = database().ref(`/users/${firebaseUser.uid}`);

        // Listen for user data changes in real-time
        const onUserDataChanged = (snapshot: any) => {
          const userData = snapshot.val();
          if (userData) {
            // Update local cache
            AsyncStorage.setItem(this.USER_KEY, JSON.stringify(userData));
            callback(userData);
          }
        };

        userRef.on('value', onUserDataChanged);

        // Store unsubscribe function for user data listener
        userDataUnsubscribe = () => {
          userRef.off('value', onUserDataChanged);
        };
      } else {
        callback(null);
      }
    });

    // Return combined unsubscribe function
    return () => {
      authUnsubscribe();
      if (userDataUnsubscribe) {
        userDataUnsubscribe();
      }
    };
  }

  /**
   * Upgrade family group subscription tier
   * Implements Sprint 2: Freemium Model
   * One person pays, entire family group gets upgraded
   */
  async upgradeSubscription(familyGroupId: string, newTier: 'premium' | 'family'): Promise<void> {
    try {
      await database().ref(`/familyGroups/${familyGroupId}`).update({
        subscriptionTier: newTier,
      });
    } catch (error: any) {
      throw new Error(`Failed to upgrade subscription: ${error.message}`);
    }
  }

  /**
   * Delete user account and ALL associated data
   * WARNING: This is irreversible!
   * Deletes from: Firebase Auth, Realtime Database, Cloud Storage, Local WatermelonDB
   */
  async deleteUserAccount(): Promise<void> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        throw new Error('No user is currently signed in');
      }

      const userId = currentUser.uid;

      // Step 1: Get user data to find family group
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const userData: User | null = userSnapshot.val();

      if (!userData) {
        throw new Error('User data not found');
      }

      const familyGroupId = userData.familyGroupId;

      // Step 2: Delete all shopping lists and items created by this user
      if (familyGroupId) {
        // Build a single update object for atomic deletion
        const updates: { [key: string]: null } = {};
        const storageDeletePromises: Promise<void>[] = [];

        // Get all lists created by this user
        const listsSnapshot = await database()
          .ref(`/familyGroups/${familyGroupId}/lists`)
          .orderByChild('createdBy')
          .equalTo(userId)
          .once('value');

        const lists = listsSnapshot.val() || {};

        // Get ALL items once (instead of per-list N+1 queries)
        const allItemsSnapshot = await database()
          .ref(`/familyGroups/${familyGroupId}/items`)
          .once('value');
        const allItems = allItemsSnapshot.val() || {};

        // Queue list deletions and find their items
        for (const listId in lists) {
          updates[`/familyGroups/${familyGroupId}/lists/${listId}`] = null;

          // Find items for this list in memory (not a DB query)
          for (const itemId in allItems) {
            if (allItems[itemId].listId === listId) {
              updates[`/familyGroups/${familyGroupId}/items/${itemId}`] = null;
            }
          }

          // Delete receipt image from Cloud Storage if exists
          const list = lists[listId];
          if (list.receiptUrl) {
            storageDeletePromises.push(
              storage().ref(list.receiptUrl).delete().catch(() => {
                // Ignore errors if receipt doesn't exist
              })
            );
          }
        }

        // Single atomic update for all deletions
        if (Object.keys(updates).length > 0) {
          await database().ref().update(updates);
        }

        // Delete storage files in parallel
        if (storageDeletePromises.length > 0) {
          await Promise.all(storageDeletePromises);
        }

        // Step 3: Delete all urgent items created by this user
        const urgentItemsSnapshot = await database()
          .ref(`/familyGroups/${familyGroupId}/urgentItems`)
          .orderByChild('createdBy')
          .equalTo(userId)
          .once('value');

        const urgentItems = urgentItemsSnapshot.val();
        if (urgentItems) {
          const urgentDeletePromises = Object.keys(urgentItems).map(itemId =>
            database().ref(`/familyGroups/${familyGroupId}/urgentItems/${itemId}`).remove()
          );
          await Promise.all(urgentDeletePromises);
        }

        // Step 4: Remove user from family group members list
        const familyGroupSnapshot = await database()
          .ref(`/familyGroups/${familyGroupId}`)
          .once('value');
        const familyGroup: FamilyGroup | null = familyGroupSnapshot.val();

        if (familyGroup && familyGroup.memberIds) {
          // Remove user from memberIds
          delete familyGroup.memberIds[userId];
          const remainingMembers = Object.keys(familyGroup.memberIds);

          // If this was the last member, delete the entire family group
          if (remainingMembers.length === 0) {
            // Find invitation code by querying /invitations for this groupId
            const invitationsSnapshot = await database()
              .ref('/invitations')
              .orderByChild('groupId')
              .equalTo(familyGroupId)
              .once('value');

            const deletions: { [key: string]: null } = {};
            deletions[`/familyGroups/${familyGroupId}`] = null;

            // Delete invitation entry if found
            if (invitationsSnapshot.exists()) {
              const invitations = invitationsSnapshot.val();
              for (const code in invitations) {
                deletions[`/invitations/${code}`] = null;
              }
            }

            await database().ref().update(deletions);
          } else {
            await database().ref(`/familyGroups/${familyGroupId}/memberIds/${userId}`).remove();
          }
        }
      }

      // Step 5: Delete user profile from Realtime Database
      await database().ref(`/users/${userId}`).remove();

      // Step 6: Clear all local WatermelonDB data
      await LocalStorageManager.clearAllData();

      // Step 7: Clear storage (user data from AsyncStorage, token from EncryptedStorage)
      await AsyncStorage.removeItem(this.USER_KEY);
      await EncryptedStorage.removeItem(this.AUTH_TOKEN_KEY);

      // Step 8: Delete user from Firebase Authentication (must be last)
      await currentUser.delete();

    } catch (error: any) {
      throw new Error(`Failed to delete account: ${error.message}`);
    }
  }

  /**
   * Helper: Generate 8-character invitation code
   */
  private generateInvitationCode(): string {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous characters
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  }

  /**
   * Refresh user data from Firebase Database
   * Useful after updating user data (like familyGroupId)
   */
  async refreshUserData(): Promise<User | null> {
    try {
      const currentUser = auth().currentUser;
      if (!currentUser) {
        return null;
      }

      // Fetch latest user data from Firebase Database
      const userSnapshot = await database().ref(`/users/${currentUser.uid}`).once('value');
      const user: User = userSnapshot.val();

      if (user) {
        // Update local cache
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(user));
      }

      return user;
    } catch (error: any) {
      throw new Error(`Failed to refresh user data: ${error.message}`);
    }
  }

  /**
   * Helper: Store auth data locally
   * SECURITY: Token is stored in encrypted storage for security
   */
  private async storeAuthData(user: User, token: string): Promise<void> {
    // User data in regular storage (not sensitive)
    await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(user));
    // Token in encrypted storage (sensitive)
    await EncryptedStorage.setItem(this.AUTH_TOKEN_KEY, token);
  }
}

export default new AuthenticationModule();
