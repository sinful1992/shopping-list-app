import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { getDatabase, ref, get, set, update, remove, runTransaction, push, query, orderByChild, equalTo, onValue } from '@react-native-firebase/database';
import { getStorage, ref as storageRef, deleteObject } from '@react-native-firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import {
  GoogleSignin,
  isSuccessResponse,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';
import { User, UserCredential, FamilyGroup, JoinRequest, JoinRequestStatus, Unsubscribe } from '../models/types';
import LocalStorageManager from './LocalStorageManager';
import NotificationManager from './NotificationManager';
import CrashReporting from './CrashReporting';

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
      await set(ref(getDatabase(), `/users/${user.uid}`), user);

      // Cache locally
      await this.storeAuthData(user, token);

      return { user, token };
    } catch (error: unknown) {
      throw new Error(`Sign up failed: ${error instanceof Error ? error.message : String(error)}`);
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
      const userSnapshot = await get(ref(getDatabase(), `/users/${userCredential.user.uid}`));
      const user: User = userSnapshot.val();

      if (!user) {
        throw new Error('User data not found');
      }

      await this.storeAuthData(user, token);

      return { user, token };
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/invalid-credential' || firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/user-not-found') {
        throw new Error('Incorrect email or password. If you signed up with Google, go back and use "Sign in with Google" instead.');
      }
      throw new Error(`Sign in failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private googleConfigured = false;

  private ensureGoogleConfigured(): void {
    if (!this.googleConfigured) {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
      });
      this.googleConfigured = true;
    }
  }

  /**
   * Sign in with Google
   * Returns null if the user cancelled the flow.
   */
  async signInWithGoogle(): Promise<UserCredential | null> {
    try {
      this.ensureGoogleConfigured();

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();

      if (isCancelledResponse(response)) {
        return null;
      }

      if (!isSuccessResponse(response)) {
        throw new Error('Google Sign-In failed');
      }

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('Google Sign-In failed: no ID token returned');
      }

      // The native Firebase Auth SDK rejects an empty accessToken (throws
      // "accessToken cannot be empty"), so fetch it explicitly rather than
      // relying on the idToken-only credential overload.
      const { accessToken } = await GoogleSignin.getTokens();
      const googleCredential = auth.GoogleAuthProvider.credential(idToken, accessToken);
      const firebaseUserCredential = await auth().signInWithCredential(googleCredential);
      const firebaseUser = firebaseUserCredential.user;
      const token = await firebaseUser.getIdToken();

      // Check if this user already exists in RTDB (returning user)
      const userSnapshot = await get(ref(getDatabase(), `/users/${firebaseUser.uid}`));
      const existingUser: User | null = userSnapshot.val();

      if (existingUser) {
        await this.storeAuthData(existingUser, token);
        return { user: existingUser, token };
      }

      // New Google user — create RTDB record (same pattern as signUp)
      const user: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || firebaseUser.email || null,
        familyGroupId: null,
        createdAt: Date.now(),
        usageCounters: {
          listsCreated: 0,
          ocrProcessed: 0,
          urgentItemsCreated: 0,
          lastResetDate: Date.now(),
        },
      };

      await set(ref(getDatabase(), `/users/${user.uid}`), user);
      await this.storeAuthData(user, token);

      return { user, token };
    } catch (error: unknown) {
      // Clear stale Google session so the next attempt starts fresh
      try { await GoogleSignin.signOut(); } catch (err) { CrashReporting.recordError(err as Error, 'AuthenticationModule signIn cleanup GoogleSignin.signOut'); }

      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.IN_PROGRESS:
            throw new Error('Google Sign-In is already in progress');
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            throw new Error('Google Play Services is not available. Please update Google Play Services.');
        }
      }

      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/account-exists-with-different-credential') {
        throw new Error('This email is already registered with a password. Please use "Sign in with Email" instead.');
      }

      throw new Error(`Google Sign-In failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      // Revoke Google access if signed in with Google
      try {
        this.ensureGoogleConfigured();
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      } catch {
        // Not a Google user or already signed out — ignore
      }

      await auth().signOut();
      // Clear user data and token from encrypted storage
      await EncryptedStorage.removeItem(this.USER_KEY);
      await EncryptedStorage.removeItem(this.AUTH_TOKEN_KEY);
      // Migration cleanup: remove any legacy plaintext copy
      await AsyncStorage.removeItem(this.USER_KEY).catch(err => CrashReporting.recordError(err as Error, 'AuthenticationModule legacy AsyncStorage cleanup'));
    } catch (error: unknown) {
      throw new Error(`Sign out failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get user's family group
   * Implements Req 1.3
   */
  async getUserFamilyGroup(userId: string): Promise<FamilyGroup | null> {
    try {
      const db = getDatabase();
      const userSnapshot = await get(ref(db, `/users/${userId}`));
      const user = userSnapshot.val();

      if (!user || !user.familyGroupId) {
        return null;
      }

      const groupSnapshot = await get(ref(db, `/familyGroups/${user.familyGroupId}`));

      return groupSnapshot.val();
    } catch (error: unknown) {
      throw new Error(`Failed to get family group: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate if a family group exists in Firebase
   * Used to check if a family group was deleted
   */
  async validateFamilyGroupExists(groupId: string): Promise<boolean> {
    try {
      const groupSnapshot = await get(ref(getDatabase(), `/familyGroups/${groupId}`));
      return groupSnapshot.exists();
    } catch {
      return false;
    }
  }

  /**
   * Create new family group
   * Implements Req 1.5
   */
  async createFamilyGroup(groupName: string, userId: string): Promise<{ group: FamilyGroup; invitationCode: string }> {
    try {
      const db = getDatabase();
      const groupId = push(ref(db)).key;
      if (!groupId) {
        throw new Error('Failed to generate group ID');
      }

      const invitationCode = this.generateInvitationCode();
      const timestamp = Date.now();

      const familyGroup: FamilyGroup = {
        id: groupId,
        name: groupName,
        invitationCode,
        createdBy: userId,
        memberIds: { [userId]: true },
        createdAt: timestamp,
        subscriptionTier: 'free',
      };

      // Atomic multi-path update: create family group, invitation entry, and user membership
      const updates: { [key: string]: any } = {};
      updates[`/familyGroups/${groupId}`] = familyGroup;
      updates[`/invitations/${invitationCode}`] = {
        groupId: groupId,
        groupName: groupName,
        createdAt: timestamp,
      };
      updates[`/users/${userId}/familyGroupId`] = groupId;

      await update(ref(db), updates);

      // Update cached user data
      const userSnapshot = await get(ref(db, `/users/${userId}`));
      const updatedUser = userSnapshot.val();
      if (updatedUser) {
        await EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
      }

      return { group: familyGroup, invitationCode };
    } catch (error: unknown) {
      throw new Error(`Failed to create family group: ${error instanceof Error ? error.message : String(error)}`);
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
      const userSnapshot = await get(ref(getDatabase(), `/users/${currentUser.uid}`));
      const userData = userSnapshot.val();

      if (userData) {
        // Update cache with fresh data
        await EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(userData));
      }

      return userData;
    } catch {
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
    } catch {
      return null;
    }
  }

  /**
   * Listen for authentication state changes
   * Implements Req 1.2
   */
  onAuthStateChanged(callback: (user: User | null) => void): Unsubscribe {
    let userDataUnsubscribe: (() => void) | null = null;
    let claimsUnsubscribe: (() => void) | null = null;
    let lastClaimsUpdatedAt: number | null = null;
    let lastProcessedUid: string | null = null;
    let latestFirebaseUser: any = null;

    const authUnsubscribe = auth().onAuthStateChanged(async (firebaseUser) => {
      latestFirebaseUser = firebaseUser;

      if (firebaseUser && firebaseUser.uid === lastProcessedUid) {
        return;
      }
      lastProcessedUid = firebaseUser?.uid ?? null;

      // Clean up previous listeners
      if (userDataUnsubscribe) {
        userDataUnsubscribe();
        userDataUnsubscribe = null;
      }
      if (claimsUnsubscribe) {
        claimsUnsubscribe();
        claimsUnsubscribe = null;
      }
      lastClaimsUpdatedAt = null;

      if (firebaseUser) {
        const db = getDatabase();
        const userRef = ref(db, `/users/${firebaseUser.uid}`);
        const claimsRef = ref(db, `/users/${firebaseUser.uid}/claimsUpdatedAt`);

        // Listen for user data changes in real-time
        const onUserDataChanged = (snapshot: any) => {
          const userData = snapshot.val();
          if (userData) {
            EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(userData));
            callback(userData);
          }
        };

        // Listen for custom claims updates (set by Cloud Function)
        // When claimsUpdatedAt changes, force a token refresh to get new claims
        const onClaimsUpdated = async (snapshot: any) => {
          const claimsUpdatedAt = snapshot.val();
          if (claimsUpdatedAt && lastClaimsUpdatedAt !== null && claimsUpdatedAt !== lastClaimsUpdatedAt) {
            try {
              await latestFirebaseUser?.getIdToken(true);
            } catch {
              // Token refresh failed — will retry on next claims update
            }
          }
          lastClaimsUpdatedAt = claimsUpdatedAt;
        };

        const unsubUserData = onValue(userRef, onUserDataChanged);
        const unsubClaims = onValue(claimsRef, onClaimsUpdated);

        // Store unsubscribe functions
        userDataUnsubscribe = () => unsubUserData();
        claimsUnsubscribe = () => unsubClaims();
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
      if (claimsUnsubscribe) {
        claimsUnsubscribe();
      }
    };
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

      const db = getDatabase();
      // Step 1: Get user data to find family group
      const userSnapshot = await get(ref(db, `/users/${userId}`));
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
        const listsSnapshot = await get(
          query(ref(db, `/familyGroups/${familyGroupId}/lists`), orderByChild('createdBy'), equalTo(userId))
        );

        const lists = listsSnapshot.val() || {};

        // Get ALL items once (instead of per-list N+1 queries)
        const allItemsSnapshot = await get(ref(db, `/familyGroups/${familyGroupId}/items`));
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
              deleteObject(storageRef(getStorage(), list.receiptUrl)).catch(() => {
                // Ignore errors if receipt doesn't exist
              })
            );
          }
        }

        // Single atomic update for all deletions
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }

        // Delete storage files in parallel
        if (storageDeletePromises.length > 0) {
          await Promise.all(storageDeletePromises);
        }

        // Step 3: Delete all urgent items created by this user
        const urgentItemsSnapshot = await get(
          query(ref(db, `/urgentItems/${familyGroupId}`), orderByChild('createdBy'), equalTo(userId))
        );

        const urgentItems = urgentItemsSnapshot.val();
        if (urgentItems) {
          const urgentDeletePromises = Object.keys(urgentItems).map(itemId =>
            remove(ref(db, `/urgentItems/${familyGroupId}/${itemId}`))
          );
          await Promise.all(urgentDeletePromises);
        }

        // Step 4: Remove user from family group members list
        const familyGroupSnapshot = await get(ref(db, `/familyGroups/${familyGroupId}`));
        const familyGroup: FamilyGroup | null = familyGroupSnapshot.val();

        if (familyGroup && familyGroup.memberIds) {
          // Remove user from memberIds
          delete familyGroup.memberIds[userId];
          const remainingMembers = Object.keys(familyGroup.memberIds);

          // If this was the last member, delete the entire family group
          if (remainingMembers.length === 0) {
            const deletions: { [key: string]: null } = {
              [`/familyGroups/${familyGroupId}`]: null,
            };
            if (familyGroup.invitationCode) {
              deletions[`/invitations/${familyGroup.invitationCode}`] = null;
            }
            await update(ref(db), deletions);
          } else {
            await remove(ref(db, `/familyGroups/${familyGroupId}/memberIds/${userId}`));
          }
        }
      }

      // Step 5: Clear FCM token (revokes device token + cleans EncryptedStorage)
      await NotificationManager.clearToken();

      // Step 6: Delete user profile from Realtime Database
      await remove(ref(db, `/users/${userId}`));

      // Step 7: Clear all local WatermelonDB data
      await LocalStorageManager.clearAllData();

      // Step 8: Clear storage (user data and token from encrypted storage)
      await EncryptedStorage.removeItem(this.USER_KEY);
      await EncryptedStorage.removeItem(this.AUTH_TOKEN_KEY);
      // Migration cleanup: remove any legacy plaintext copy
      await AsyncStorage.removeItem(this.USER_KEY).catch(err => CrashReporting.recordError(err as Error, 'AuthenticationModule legacy AsyncStorage cleanup'));

      // Step 9: Revoke Google access if signed in with Google
      try {
        this.ensureGoogleConfigured();
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      } catch {
        // Not a Google user — ignore
      }

      // Step 10: Delete user from Firebase Authentication (must be last)
      await currentUser.delete();

    } catch (error: unknown) {
      throw new Error(`Failed to delete account: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Ensure a family group has an invitation code, generating one atomically if missing.
   * Uses a transaction so concurrent calls from multiple devices produce exactly one code.
   */
  async ensureInvitationCode(familyGroupId: string): Promise<string> {
    const db = getDatabase();
    const invCodeRef = ref(db, `/familyGroups/${familyGroupId}/invitationCode`);

    const result = await runTransaction(invCodeRef, (current) => {
      if (current === null) return this.generateInvitationCode();
      return; // abort — code already exists, keep it
    });

    const code: string = result.snapshot.val();

    if (result.committed) {
      // Caller is a group member, so reading the group name here is permitted.
      const nameSnapshot = await get(ref(db, `/familyGroups/${familyGroupId}/name`));
      await set(ref(db, `/invitations/${code}`), {
        groupId: familyGroupId,
        groupName: nameSnapshot.val() ?? '',
        createdAt: Date.now(),
      });
    }

    return code;
  }

  /**
   * Submit a join request using an invitation code.
   * The requesting user is NOT added to the group immediately — an existing
   * member must approve via approveJoinRequest().
   */
  async submitJoinRequest(invitationCode: string, userId: string): Promise<{ groupId: string; groupName: string }> {
    try {
      const db = getDatabase();
      const invitationSnapshot = await get(ref(db, `/invitations/${invitationCode}`));
      if (!invitationSnapshot.exists()) {
        throw new Error('Invalid invitation code. Please check and try again.');
      }
      const { groupId, groupName } = invitationSnapshot.val();
      // A non-member cannot read /familyGroups/$groupId (members-only by rule), so
      // resolve the display name from the world-readable invitation, with a fallback
      // for legacy invitations created before groupName was stored.
      const resolvedGroupName: string = groupName || 'your family group';

      const userSnapshot = await get(ref(db, `/users/${userId}`));
      const userData: User = userSnapshot.val();
      if (userData.familyGroupId) {
        throw new Error('You are already in a family group.');
      }

      // Check membership via our own memberIds entry — readable per rule, unlike the whole group node.
      const membershipSnapshot = await get(ref(db, `/familyGroups/${groupId}/memberIds/${userId}`));
      if (membershipSnapshot.val() === true) {
        throw new Error('You are already a member of this family group.');
      }

      const joinRequest: JoinRequest = {
        userId,
        groupId,
        displayName: userData.displayName,
        email: userData.email,
        requestedAt: Date.now(),
        status: 'pending',
      };

      await set(ref(db, `/familyGroups/${groupId}/joinRequests/${userId}`), joinRequest);

      return { groupId, groupName: resolvedGroupName };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Invalid invitation') || msg.includes('no longer exists') ||
          msg.includes('already') || msg.includes('PERMISSION_DENIED')) {
        throw error;
      }
      throw new Error(`Failed to submit join request: ${msg}`);
    }
  }

  /**
   * Approve a pending join request (called by an existing group member).
   * Atomically marks the request approved and adds the user to memberIds.
   * The joining user must still call completeJoinAfterApproval() from their side.
   */
  async approveJoinRequest(groupId: string, requestUserId: string): Promise<void> {
    const updates: { [key: string]: any } = {};
    updates[`/familyGroups/${groupId}/joinRequests/${requestUserId}/status`] = 'approved';
    updates[`/familyGroups/${groupId}/memberIds/${requestUserId}`] = true;
    await update(ref(getDatabase()), updates);
  }

  /**
   * Reject a pending join request (called by an existing group member).
   */
  async rejectJoinRequest(groupId: string, requestUserId: string): Promise<void> {
    await set(ref(getDatabase(), `/familyGroups/${groupId}/joinRequests/${requestUserId}/status`), 'rejected');
  }

  /**
   * Cancel a pending join request (called by the requesting user themselves).
   */
  async cancelJoinRequest(groupId: string, userId: string): Promise<void> {
    await remove(ref(getDatabase(), `/familyGroups/${groupId}/joinRequests/${userId}`));
  }

  /**
   * Listen for status changes on the requesting user's own join request.
   * Used by the waiting screen to detect approval or rejection in real-time.
   */
  listenForJoinApproval(
    groupId: string,
    userId: string,
    onUpdate: (status: JoinRequestStatus | null) => void,
  ): () => void {
    const statusRef = ref(getDatabase(), `/familyGroups/${groupId}/joinRequests/${userId}/status`);
    const handler = (snapshot: any) => onUpdate(snapshot.val() as JoinRequestStatus | null);
    const unsub = onValue(statusRef, handler);
    return () => unsub();
  }

  /**
   * Complete the join after the requesting user's app detects approval.
   * Writes the user's familyGroupId (now allowed by DB rules since they're in memberIds),
   * cleans up the join request, and refreshes the local cache.
   */
  async completeJoinAfterApproval(groupId: string, userId: string): Promise<FamilyGroup> {
    const db = getDatabase();
    await set(ref(db, `/users/${userId}/familyGroupId`), groupId);

    await remove(ref(db, `/familyGroups/${groupId}/joinRequests/${userId}`)).catch(() => {});

    const [userSnapshot, groupSnapshot] = await Promise.all([
      get(ref(db, `/users/${userId}`)),
      get(ref(db, `/familyGroups/${groupId}`)),
    ]);

    const updatedUser = userSnapshot.val();
    if (updatedUser) {
      await EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(updatedUser));
    }

    return groupSnapshot.val();
  }

  /**
   * Listen for pending join requests on a group (called by existing members).
   * Returns unsubscribe function. Only 'pending' status requests are emitted.
   */
  listenForJoinRequests(
    groupId: string,
    onUpdate: (requests: JoinRequest[]) => void,
  ): () => void {
    const requestsRef = ref(getDatabase(), `/familyGroups/${groupId}/joinRequests`);
    const handler = (snapshot: any) => {
      const data = snapshot.val();
      if (!data) { onUpdate([]); return; }
      const pending = Object.values(data).filter(
        (r: any) => r?.status === 'pending',
      ) as JoinRequest[];
      onUpdate(pending);
    };
    const unsub = onValue(requestsRef, handler);
    return () => unsub();
  }

  /**
   * Helper: Generate 8-character invitation code
   */
  private generateInvitationCode(): string {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous characters
    const randomBytes = new Uint8Array(8);
    crypto.getRandomValues(randomBytes);
    return Array.from(randomBytes, b => characters[b % characters.length]).join('');
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
      const userSnapshot = await get(ref(getDatabase(), `/users/${currentUser.uid}`));
      const user: User = userSnapshot.val();

      if (user) {
        // Update local cache
        await EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(user));
      }

      return user;
    } catch (error: unknown) {
      throw new Error(`Failed to refresh user data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Helper: Store auth data locally
   * SECURITY: Token is stored in encrypted storage for security
   */
  private async storeAuthData(user: User, token: string): Promise<void> {
    // User data and token both in encrypted storage
    await EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(user));
    await EncryptedStorage.setItem(this.AUTH_TOKEN_KEY, token);
  }
}

export default new AuthenticationModule();
