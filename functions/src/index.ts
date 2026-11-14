import * as functions from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

initializeApp();

/**
 * Cloud Function: setFamilyGroupClaim
 *
 * Triggers when a user's familyGroupId changes in the Realtime Database.
 * Sets a custom claim on the user's Firebase Auth token so that
 * Cloud Storage rules can verify family group membership.
 *
 * This enables storage rules like:
 *   allow read, write: if request.auth.token.familyGroupId == familyGroupId;
 */
export const setFamilyGroupClaim = functions.database
  .ref('/users/{uid}/familyGroupId')
  .onWrite(async (change, context) => {
    const uid = context.params.uid;
    const familyGroupId = change.after.val();

    try {
      // Set the custom claim on the user's auth token
      await getAuth().setCustomUserClaims(uid, {
        familyGroupId: familyGroupId || null,
      });

      // Write a timestamp that the client can watch to know when to refresh the token
      // The client should call auth().currentUser.getIdToken(true) when this changes
      await getDatabase().ref(`/users/${uid}/claimsUpdatedAt`).set(Date.now());

      functions.logger.info(`Set familyGroupId claim for user ${uid}:`, familyGroupId);
    } catch (error) {
      functions.logger.error(`Failed to set custom claims for user ${uid}:`, error);
      throw error;
    }
  });
