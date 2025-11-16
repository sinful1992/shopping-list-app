import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import storage from '@react-native-firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserCredential, FamilyGroup, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';

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
        subscriptionTier: 'free',
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
      await AsyncStorage.multiRemove([this.AUTH_TOKEN_KEY, this.USER_KEY]);
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

      const familyGroup: FamilyGroup = {
        id: groupId,
        name: groupName,
        invitationCode,
        createdBy: userId,
        memberIds: [userId],
        createdAt: Date.now(),
      };

      // Save family group
      await database().ref(`/familyGroups/${groupId}`).set(familyGroup);

      // Update user's familyGroupId
      await database().ref(`/users/${userId}`).update({
        familyGroupId: groupId,
      });

      // Update cached user data
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const updatedUser = userSnapshot.val();
      if (updatedUser) {
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }

      return familyGroup;
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
      // Find family group by invitation code
      const groupsSnapshot = await database()
        .ref('/familyGroups')
        .orderByChild('invitationCode')
        .equalTo(invitationCode)
        .once('value');

      if (!groupsSnapshot.exists()) {
        throw new Error('Invalid invitation code');
      }

      const groupData = groupsSnapshot.val();
      const groupId = Object.keys(groupData)[0];
      const familyGroup: FamilyGroup = groupData[groupId];

      // Add user to family group
      if (!familyGroup.memberIds.includes(userId)) {
        familyGroup.memberIds.push(userId);
        await database().ref(`/familyGroups/${groupId}/memberIds`).set(familyGroup.memberIds);
      }

      // Update user's familyGroupId
      await database().ref(`/users/${userId}`).update({
        familyGroupId: groupId,
      });

      // Update cached user data
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const updatedUser = userSnapshot.val();
      if (updatedUser) {
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }

      return familyGroup;
    } catch (error: any) {
      throw new Error(`Failed to join family group: ${error.message}`);
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
   */
  async getAuthToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem(this.AUTH_TOKEN_KEY);
      if (token) {
        return token;
      }

      const currentUser = auth().currentUser;
      if (currentUser) {
        return await currentUser.getIdToken();
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
   * Upgrade user subscription tier
   * Implements Sprint 2: Freemium Model
   */
  async upgradeSubscription(userId: string, newTier: 'premium' | 'family'): Promise<void> {
    try {
      await database().ref(`/users/${userId}`).update({
        subscriptionTier: newTier,
      });

      // Update cached user data
      const userSnapshot = await database().ref(`/users/${userId}`).once('value');
      const updatedUser = userSnapshot.val();
      if (updatedUser) {
        await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }
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
        // Get all lists created by this user
        const listsSnapshot = await database()
          .ref(`/familyGroups/${familyGroupId}/lists`)
          .orderByChild('createdBy')
          .equalTo(userId)
          .once('value');

        const lists = listsSnapshot.val();

        if (lists) {
          const deletePromises: Promise<void>[] = [];

          for (const listId in lists) {
            // Delete all items in this list
            deletePromises.push(
              database().ref(`/familyGroups/${familyGroupId}/items`).orderByChild('listId').equalTo(listId).once('value')
                .then((itemsSnapshot) => {
                  const items = itemsSnapshot.val();
                  if (items) {
                    const itemDeletePromises = Object.keys(items).map(itemId =>
                      database().ref(`/familyGroups/${familyGroupId}/items/${itemId}`).remove()
                    );
                    return Promise.all(itemDeletePromises);
                  }
                })
            );

            // Delete the list itself
            deletePromises.push(
              database().ref(`/familyGroups/${familyGroupId}/lists/${listId}`).remove()
            );

            // Delete receipt image from Cloud Storage if exists
            const list = lists[listId];
            if (list.receiptUrl) {
              deletePromises.push(
                storage().ref(list.receiptUrl).delete().catch(() => {
                  // Ignore errors if receipt doesn't exist
                })
              );
            }
          }

          await Promise.all(deletePromises);
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
          const updatedMemberIds = familyGroup.memberIds.filter(id => id !== userId);

          // If this was the last member, delete the entire family group
          if (updatedMemberIds.length === 0) {
            await database().ref(`/familyGroups/${familyGroupId}`).remove();
          } else {
            await database().ref(`/familyGroups/${familyGroupId}/memberIds`).set(updatedMemberIds);
          }
        }
      }

      // Step 5: Delete user profile from Realtime Database
      await database().ref(`/users/${userId}`).remove();

      // Step 6: Clear all local WatermelonDB data
      await LocalStorageManager.clearAllData();

      // Step 7: Clear AsyncStorage
      await AsyncStorage.multiRemove([this.AUTH_TOKEN_KEY, this.USER_KEY]);

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
   */
  private async storeAuthData(user: User, token: string): Promise<void> {
    await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(user));
    await AsyncStorage.setItem(this.AUTH_TOKEN_KEY, token);
  }
}

export default new AuthenticationModule();
