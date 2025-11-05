import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import database from '@react-native-firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, UserCredential, FamilyGroup, Unsubscribe } from '../models/types';

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
  async signUp(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      const token = await userCredential.user.getIdToken();

      const user: User = {
        uid: userCredential.user.uid,
        email: userCredential.user.email || email,
        displayName: userCredential.user.displayName,
        familyGroupId: null,
        createdAt: Date.now(),
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

      return familyGroup;
    } catch (error: any) {
      throw new Error(`Failed to join family group: ${error.message}`);
    }
  }

  /**
   * Get current authenticated user
   * Implements Req 1.2
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const userJson = await AsyncStorage.getItem(this.USER_KEY);
      if (userJson) {
        return JSON.parse(userJson);
      }

      const currentUser = auth().currentUser;
      if (!currentUser) {
        return null;
      }

      const userSnapshot = await database().ref(`/users/${currentUser.uid}`).once('value');
      return userSnapshot.val();
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
    return auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const userSnapshot = await database().ref(`/users/${firebaseUser.uid}`).once('value');
        callback(userSnapshot.val());
      } else {
        callback(null);
      }
    });
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
   * Helper: Store auth data locally
   */
  private async storeAuthData(user: User, token: string): Promise<void> {
    await AsyncStorage.setItem(this.USER_KEY, JSON.stringify(user));
    await AsyncStorage.setItem(this.AUTH_TOKEN_KEY, token);
  }
}

export default new AuthenticationModule();
