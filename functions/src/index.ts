import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

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
      await admin.auth().setCustomUserClaims(uid, {
        familyGroupId: familyGroupId || null,
      });

      // Write a timestamp that the client can watch to know when to refresh the token
      // The client should call auth().currentUser.getIdToken(true) when this changes
      await admin.database().ref(`/users/${uid}/claimsUpdatedAt`).set(Date.now());

      functions.logger.info(`Set familyGroupId claim for user ${uid}:`, familyGroupId);
    } catch (error) {
      functions.logger.error(`Failed to set custom claims for user ${uid}:`, error);
      throw error;
    }
  });

/**
 * Cloud Function: clearClaimOnMembershipRemoval
 *
 * Triggers when a user is removed from a family group's memberIds. The Storage
 * familyGroupId custom claim is derived from /users/{uid}/familyGroupId, which
 * a remover other than the user themselves cannot write (DB rules restrict it
 * to the owner). Without this, an involuntarily-removed user keeps their claim
 * — and thus receipt-image access — until their own familyGroupId changes.
 *
 * Clearing /users/{uid}/familyGroupId here cascades to setFamilyGroupClaim,
 * which clears the claim. Guarded so it only fires when the user's record still
 * points at the group they were removed from (don't clobber a later re-join).
 */
export const clearClaimOnMembershipRemoval = functions.database
  .ref('/familyGroups/{groupId}/memberIds/{uid}')
  .onDelete(async (_snapshot, context) => {
    const { groupId, uid } = context.params;
    const userGroupRef = admin.database().ref(`/users/${uid}/familyGroupId`);

    try {
      const current = await userGroupRef.once('value');
      if (current.val() === groupId) {
        // Cascades to setFamilyGroupClaim, which clears the custom claim.
        await userGroupRef.set(null);
        functions.logger.info(`Cleared familyGroupId for user ${uid} removed from ${groupId}`);
      }
    } catch (error) {
      functions.logger.error(`Failed to clear claim for removed user ${uid}:`, error);
      throw error;
    }
  });
