import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  getIdToken,
  updateProfile,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  EmailAuthProvider,
  type AuthCredential,
  type User as FirebaseUser,
} from '@react-native-firebase/auth';
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
import { safeJsonParse } from '../utils/safeJsonParse';
import LocalStorageManager from './LocalStorageManager';
import NotificationManager from './NotificationManager';
import CrashReporting from './CrashReporting';

/** How an already signed-in account proves it is still present. */
export type ReauthMethod = 'google' | 'password';

/**
 * AuthenticationModule
 * Manages user registration, login, logout, and family group membership
 * Implements Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
class AuthenticationModule {
  private readonly AUTH_TOKEN_KEY = '@auth_token';
  private readonly USER_KEY = '@user';

  /**
   * Set while deleteUserAccount is removing things, so the profile listener
   * does not treat the profile it deletes as a session to repair.
   */
  private deletionInProgress = false;

  /**
   * Sign up new user with email and password
   * Implements Req 1.1, 1.2
   */
  async signUp(email: string, password: string, displayName?: string): Promise<UserCredential> {
    try {
      const userCredential = await createUserWithEmailAndPassword(getAuth(), email, password);
      const token = await getIdToken(userCredential.user);

      // Update Firebase Auth profile with display name
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
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
   * The profile every authenticated session needs, created only if it is
   * missing. A transaction rather than a set: this runs alongside the sign-up
   * paths that write the profile themselves, and the fuller record they write
   * must win rather than be overwritten by these defaults.
   */
  private async ensureUserProfile(firebaseUser: FirebaseUser): Promise<User> {
    const result = await runTransaction(
      ref(getDatabase(), `/users/${firebaseUser.uid}`),
      (current: User | null) => {
        if (current !== null) return; // abort — a real profile is already there
        const now = Date.now();
        return {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email || null,
          familyGroupId: null,
          createdAt: now,
          usageCounters: {
            listsCreated: 0,
            ocrProcessed: 0,
            urgentItemsCreated: 0,
            lastResetDate: now,
          },
        };
      },
    );

    return result.snapshot.val();
  }

  /**
   * Sign in existing user with email and password
   * Implements Req 1.2
   */
  async signIn(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await signInWithEmailAndPassword(getAuth(), email, password);
      const token = await getIdToken(userCredential.user);

      // Fetch user data from database
      const userSnapshot = await get(ref(getDatabase(), `/users/${userCredential.user.uid}`));
      // A sign-up interrupted between creating the account and writing its
      // profile leaves credentials that work and a profile that is not there.
      // This used to be "User data not found" on every attempt for ever, with
      // no way to recover and no way to delete the account either.
      const user: User = userSnapshot.val() ?? await this.ensureUserProfile(userCredential.user);

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
      const googleCredential = GoogleAuthProvider.credential(idToken, accessToken);
      const firebaseUserCredential = await signInWithCredential(getAuth(), googleCredential);
      const firebaseUser = firebaseUserCredential.user;
      const token = await getIdToken(firebaseUser);

      // Check if this user already exists in RTDB (returning user)
      const userSnapshot = await get(ref(getDatabase(), `/users/${firebaseUser.uid}`));
      const existingUser: User | null = userSnapshot.val();

      if (existingUser) {
        await this.storeAuthData(existingUser, token);
        return { user: existingUser, token };
      }

      // New Google user — create the RTDB record
      const user = await this.ensureUserProfile(firebaseUser);
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
  async getCurrentFirebaseUser(): Promise<FirebaseUser | null> {
    return getAuth().currentUser;
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

      await firebaseSignOut(getAuth());
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
   * Drop this user's own entry from a group's memberIds.
   *
   * memberIds is what every read permission on a group derives from, so a user
   * who has detached from a group but kept an entry there would keep reading
   * its lists, items, prices and layouts. This is the one place that removal
   * happens, so no detach path can forget it.
   *
   * Failures propagate. deleteUserAccount depends on this succeeding before it
   * removes /users/{uid} and the auth account — a swallowed failure there would
   * strand an entry for a uid that no longer exists, which nothing can remove
   * afterwards, since the self-write rule requires auth.uid to match it.
   */
  private async removeSelfFromGroup(userId: string, groupId: string): Promise<void> {
    await remove(ref(getDatabase(), `/familyGroups/${groupId}/memberIds/${userId}`));
  }

  /**
   * Detach a user from a family group that no longer exists, so the app
   * can prompt them to create or join a new one.
   */
  async clearFamilyGroupReference(userId: string, groupId: string | null): Promise<void> {
    if (groupId) {
      try {
        await this.removeSelfFromGroup(userId, groupId);
      } catch {
        // Expected here, unlike in deleteUserAccount: this runs because the
        // group has gone, and the rule requires the entry to still exist.
        // Detaching the user is what matters and it happens either way.
      }
    }
    await update(ref(getDatabase(), `/users/${userId}`), {
      familyGroupId: null,
    });
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
   * Fetches fresh data from database to ensure familyGroupId is up-to-date;
   * falls back to the last-known cached user when the network read fails so
   * an offline app doesn't behave as if the user were logged out.
   */
  async getCurrentUser(): Promise<User | null> {
    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      return null;
    }

    try {
      const userSnapshot = await get(ref(getDatabase(), `/users/${currentUser.uid}`));
      const userData = userSnapshot.val();

      if (userData) {
        // Update cache with fresh data
        await EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(userData));
        return userData;
      }
    } catch (error) {
      CrashReporting.recordError(error as Error, 'AuthenticationModule getCurrentUser network read');
    }

    // Offline / read failed → serve last-known user instead of "logged out".
    // Sign-out removes USER_KEY, so this cannot resurrect a signed-out user;
    // guard against a stale cache from a different account on the same device.
    const cached = await EncryptedStorage.getItem(this.USER_KEY).catch(() => null);
    const cachedUser = safeJsonParse<User | null>(cached, null);
    if (cachedUser && cachedUser.uid !== currentUser.uid) {
      return null;
    }
    return cachedUser;
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
      const currentUser = getAuth().currentUser;
      if (currentUser) {
        const freshToken = await getIdToken(currentUser);
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
    let reconcileAttempted = false;
    let healAttempted = false;

    const authUnsubscribe = onFirebaseAuthStateChanged(getAuth(), async (firebaseUser) => {
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
      reconcileAttempted = false;
      healAttempted = false;

      if (firebaseUser) {
        const db = getDatabase();
        const userRef = ref(db, `/users/${firebaseUser.uid}`);
        const claimsRef = ref(db, `/users/${firebaseUser.uid}/claimsUpdatedAt`);

        // Listen for user data changes in real-time
        const onUserDataChanged = (snapshot: any) => {
          const userData = snapshot.val() as User | null;
          if (!userData) {
            // A live session with no profile behind it. The callback only ever
            // reported a profile that exists, so this state rendered as the
            // splash screen for ever — no logout, no retry, nothing.
            //
            // Not during a deletion: step 6 removes the profile on purpose and
            // recreating it would strand a /users entry behind an auth account
            // about to stop existing.
            if (this.deletionInProgress) return;

            if (healAttempted) {
              // Already tried. Reporting no user drops the app at the sign-in
              // screen, which is at least somewhere the account can act from.
              callback(null);
              return;
            }
            healAttempted = true;
            this.ensureUserProfile(latestFirebaseUser).catch(err => {
              CrashReporting.recordError(
                err as Error,
                'AuthenticationModule ensureUserProfile',
              );
              callback(null);
            });
            return;
          }

          EncryptedStorage.setItem(this.USER_KEY, JSON.stringify(userData));
          callback(userData);

          // Once per sign-in: an approval that landed while this account was
          // not watching leaves it in memberIds with no group of its own.
          // Completing it writes familyGroupId, which this same listener
          // then delivers, so the app moves on without further prompting.
          if (!reconcileAttempted && !userData.familyGroupId && userData.pendingGroupId) {
            reconcileAttempted = true;
            this.reconcilePendingMembership(userData).catch(err => {
              // Released on failure: a stranded account is exactly the one
              // likely to be offline, and holding the flag would leave it
              // stranded for the rest of the session over one failed read.
              reconcileAttempted = false;
              CrashReporting.recordError(
                err as Error,
                'AuthenticationModule reconcilePendingMembership',
              );
            });
          }
        };

        // Listen for custom claims updates (set by Cloud Function)
        // When claimsUpdatedAt changes, force a token refresh to get new claims
        const onClaimsUpdated = async (snapshot: any) => {
          const claimsUpdatedAt = snapshot.val();
          if (claimsUpdatedAt && lastClaimsUpdatedAt !== null && claimsUpdatedAt !== lastClaimsUpdatedAt) {
            try {
              if (latestFirebaseUser) {
                await getIdToken(latestFirebaseUser, true);
              }
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
   * How the signed-in account can prove it is present, which deleting it
   * requires. Callers use this to collect a password before starting, since a
   * Google account needs nothing collected in advance.
   */
  getReauthMethod(): ReauthMethod | null {
    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      return null;
    }

    const providerIds = currentUser.providerData.map(provider => provider.providerId);
    // Google first when both are linked: it needs no password typed in.
    if (providerIds.includes('google.com')) {
      return 'google';
    }
    if (providerIds.includes('password')) {
      return 'password';
    }
    return null;
  }

  /**
   * Prove the account is present, resetting Firebase's recent-login window.
   * Returns the credential used, so a later step can present it again without
   * asking a second time, or null if the user backed out.
   */
  private async reauthenticate(
    currentUser: FirebaseUser,
    password?: string,
  ): Promise<AuthCredential | null> {
    const method = this.getReauthMethod();

    if (method === 'google') {
      this.ensureGoogleConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();
      if (isCancelledResponse(response)) {
        return null;
      }
      if (!isSuccessResponse(response)) {
        throw new Error('Re-authentication failed. Please try again.');
      }

      const idToken = response.data?.idToken;
      if (!idToken) {
        throw new Error('Re-authentication failed: no ID token returned');
      }

      // A device with several Google accounts can hand back a different one,
      // and reauthenticating with it would fail anyway — say so plainly first.
      const linkedEmail = currentUser.providerData
        .find(provider => provider.providerId === 'google.com')?.email;
      const signedInEmail = response.data?.user?.email;
      if (linkedEmail && signedInEmail && linkedEmail.toLowerCase() !== signedInEmail.toLowerCase()) {
        throw new Error('Re-authentication requires the same Google account this app is signed in with.');
      }

      const { accessToken } = await GoogleSignin.getTokens();
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      await reauthenticateWithCredential(currentUser, credential);
      return credential;
    }

    if (method === 'password') {
      if (!currentUser.email) {
        throw new Error('Re-authentication failed: this account has no email address.');
      }
      if (!password) {
        throw new Error('Password is required to delete your account.');
      }

      const credential = EmailAuthProvider.credential(currentUser.email, password);
      try {
        await reauthenticateWithCredential(currentUser, credential);
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
          throw new Error('Incorrect password. Please try again.');
        }
        throw error;
      }
      return credential;
    }

    throw new Error('Re-authentication is not available for this sign-in method.');
  }

  /**
   * Step 10 of deletion, kept apart because it is the one step with nothing
   * behind it: by the time it runs the profile is gone, so a failure here
   * leaves an account that cannot load, cannot log out and cannot retry.
   */
  private async deleteAuthAccount(
    currentUser: FirebaseUser,
    credential: AuthCredential,
  ): Promise<void> {
    try {
      await currentUser.delete();
      return;
    } catch (error: unknown) {
      // The preflight reset the window seconds ago, but the cleanup in between
      // is many round-trips. Present the same credential once more rather than
      // asking the user to prove themselves twice.
      if ((error as { code?: string }).code === 'auth/requires-recent-login') {
        try {
          await reauthenticateWithCredential(currentUser, credential);
          await currentUser.delete();
          return;
        } catch (retryError: unknown) {
          CrashReporting.recordError(
            retryError as Error,
            'AuthenticationModule deleteAuthAccount retry',
          );
        }
      } else {
        CrashReporting.recordError(
          error as Error,
          'AuthenticationModule deleteAuthAccount',
        );
      }
    }

    // Signing out is all that is left. Staying signed in means an authenticated
    // session with no profile to load, which the app has no screen for.
    await firebaseSignOut(getAuth()).catch(err => CrashReporting.recordError(
      err as Error,
      'AuthenticationModule deleteAuthAccount sign-out',
    ));

    throw new Error(
      'Your data was deleted, but the sign-in account could not be removed. You have been signed out.'
    );
  }

  /**
   * Delete user account and ALL associated data
   * WARNING: This is irreversible!
   * Deletes from: Firebase Auth, Realtime Database, Cloud Storage, Local WatermelonDB
   *
   * Returns false if the user backed out of re-authentication, in which case
   * nothing was deleted.
   */
  async deleteUserAccount(password?: string): Promise<boolean> {
    const currentUser = getAuth().currentUser;
    if (!currentUser) {
      throw new Error('No user is currently signed in');
    }

    // Before anything is destroyed. Firebase only accepts a deletion shortly
    // after a sign-in, and the deletion is the last of ten steps — without this
    // the first nine run, then the tenth is refused with
    // auth/requires-recent-login, and the account is left with no data and no
    // way back. Proving presence up front costs one prompt and moves the only
    // step that can refuse to before the destructive ones.
    const credential = await this.reauthenticate(currentUser, password);
    if (!credential) {
      return false;
    }

    // From here the profile is expected to disappear. The listener repairs a
    // session that has lost its profile, which here would recreate the very
    // record step 6 removes, behind an account about to stop existing.
    this.deletionInProgress = true;
    try {
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
          if (typeof list.receiptUrl === 'string' && list.receiptUrl.startsWith('receipts/')) {
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

        // Step 4: Remove user from family group members list.
        //
        // The request that admitted this account is still on file: approving
        // one only flips its status to 'approved', and completing the join
        // never removes it. It is also what authorises writing memberIds, so
        // leaving it there keeps the approval window open across the removal
        // below — a member acting on it writes the entry back, step 6 then
        // takes the profile, and the entry becomes the unremovable phantom
        // 1.39.5 hardened the rules against. Removing an entry that is not
        // there is permitted for the account itself, so this is safe for a
        // group this account created rather than joined.
        await remove(ref(db, `/familyGroups/${familyGroupId}/joinRequests/${userId}`))
          .catch(err => CrashReporting.recordError(
            err as Error,
            'AuthenticationModule deleteUserAccount joined request cleanup',
          ));

        const familyGroupSnapshot = await get(ref(db, `/familyGroups/${familyGroupId}`));
        const familyGroup: FamilyGroup | null = familyGroupSnapshot.val();

        if (familyGroup && familyGroup.memberIds) {
          const remainingMembers = Object.keys(familyGroup.memberIds).filter(
            (id) => id !== userId
          );

          // Retiring the invitation is only permitted while still a member, so
          // it has to happen before the memberIds entry goes.
          if (remainingMembers.length === 0 && familyGroup.invitationCode) {
            await remove(ref(db, `/invitations/${familyGroup.invitationCode}`));
          }

          await this.removeSelfFromGroup(userId, familyGroupId);
        }
      } else if (userData.pendingGroupId) {
        // Requested a group but never completed the join, so none of the above
        // ran. Both leftovers have to go, and deliberately not as one update:
        // for a request that was never approved there is no memberIds entry,
        // the rule refuses to remove one that is not there, and an atomic
        // update took the join request down with it — leaving it orphaned in
        // the group, pointing at an account that no longer exists.
        const pendingGroupId = userData.pendingGroupId;

        // The request first, because it is what authorises an approval: both
        // the .write and the .validate on memberIds/{uid} require it to exist.
        // While it is still there a member can approve between these two
        // removals and write the entry back, and once the profile goes at step
        // 6 nothing is permitted to remove it — the same unremovable phantom
        // member 1.39.5 hardened the rules against. Removing the request first
        // closes that window; the only cost is that dying between the two can
        // leave a memberIds entry, and that one the account can still remove
        // itself on the next attempt, because it is still alive to do so.
        await remove(ref(db, `/familyGroups/${pendingGroupId}/joinRequests/${userId}`))
          .catch(err => CrashReporting.recordError(
            err as Error,
            'AuthenticationModule deleteUserAccount pending request cleanup',
          ));

        await this.removeSelfFromGroup(userId, pendingGroupId).catch(() => {
          // Denial is the expected case here, as in clearFamilyGroupReference:
          // an unapproved request has no entry, and the rule requires one to
          // exist. Recording it would report the common path as a fault.
        });
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

    } catch (error: unknown) {
      throw new Error(`Failed to delete account: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Released before step 9 either way: from here on the account is either
      // deleted, in which case there is no session to repair, or signed out.
      this.deletionInProgress = false;
    }

    // Step 9: Delete user from Firebase Authentication (must be last). Outside
    // the wrapper above so its message survives to the UI: this is the failure
    // the user has to be told about precisely.
    await this.deleteAuthAccount(currentUser, credential);

    // Step 10: Revoke Google access if signed in with Google. After the
    // deletion, not before: revoking the grant invalidates the very credential
    // deleteAuthAccount re-presents on its retry, which would send every Google
    // account past the retry and straight to the sign-out fallback.
    try {
      this.ensureGoogleConfigured();
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    } catch {
      // Not a Google user — ignore
    }

    return true;
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

      // The email is bound to auth.token.email by rule, because it is the only
      // part of a join request the approver can trust. Read it from the token
      // rather than /users/{uid} so the write matches by construction.
      const tokenEmail = getAuth().currentUser?.email;
      if (!tokenEmail) {
        throw new Error('Your account has no verified email address, so it cannot request to join a group.');
      }

      const joinRequest: JoinRequest = {
        userId,
        groupId,
        displayName: userData.displayName,
        email: tokenEmail,
        requestedAt: Date.now(),
        status: 'pending',
      };

      // One update, so the pointer cannot go missing while the request exists.
      // Approval is completed by this account, and after a restart the request
      // alone gives it no way to find the group it belongs to.
      await update(ref(db), {
        [`/familyGroups/${groupId}/joinRequests/${userId}`]: joinRequest,
        [`/users/${userId}/pendingGroupId`]: groupId,
      });

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
    // The pointer goes with the request: left behind, it would restore the
    // waiting screen for a request that no longer exists.
    await update(ref(getDatabase()), {
      [`/familyGroups/${groupId}/joinRequests/${userId}`]: null,
      [`/users/${userId}/pendingGroupId`]: null,
    });
  }

  /**
   * Finish a join whose approval arrived while this account was not watching.
   *
   * The approver can write memberIds but not /users/{uid}/familyGroupId, so a
   * membership only completes when this account writes its own half. That
   * write used to happen exclusively in the listener registered at request
   * time, which means an app restart between request and approval stranded the
   * account: in memberIds, but with no group in its own profile, and refused a
   * fresh request because it is already a member.
   *
   * Returns whether the membership was completed.
   */
  async reconcilePendingMembership(user: User): Promise<boolean> {
    const groupId = user.pendingGroupId;
    if (!groupId || user.familyGroupId) return false;

    // Readable per rule: memberIds/$userId is self-readable.
    const membershipSnapshot = await get(
      ref(getDatabase(), `/familyGroups/${groupId}/memberIds/${user.uid}`),
    );
    if (membershipSnapshot.val() !== true) return false;

    await this.completeJoinAfterApproval(groupId, user.uid);
    return true;
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
    await update(ref(db), {
      [`/users/${userId}/familyGroupId`]: groupId,
      [`/users/${userId}/pendingGroupId`]: null,
    });

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
      const currentUser = getAuth().currentUser;
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
