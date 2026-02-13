import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import productConfig from './product-config.json';

admin.initializeApp();

const PRODUCT_TIER_MAP: Record<string, string> = productConfig.productTierMap;

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

// --- RevenueCat Webhook ---

type WebhookEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'UNCANCELLATION'
  | 'PRODUCT_CHANGE'
  | 'TRANSFER'
  | 'EXPIRATION'
  | 'CANCELLATION'
  | 'BILLING_ISSUE'
  | 'SUBSCRIBER_ALIAS'
  | 'SUBSCRIPTION_PAUSED'
  | 'SUBSCRIPTION_EXTENDED';

interface WebhookEvent {
  type: WebhookEventType;
  app_user_id: string;
  product_id?: string;
  event_timestamp_ms: number;
  transferred_from?: string[];
  transferred_to?: string[];
}

interface WebhookPayload {
  event: WebhookEvent;
}

async function lookupFamilyGroupId(appUserId: string): Promise<string | null> {
  const userSnapshot = await admin.database().ref(`/users/${appUserId}/familyGroupId`).once('value');
  return userSnapshot.val() || null;
}

async function setFamilyTier(
  familyGroupId: string,
  newTier: string,
  eventTimestampMs: number
): Promise<boolean> {
  const groupRef = admin.database().ref(`/familyGroups/${familyGroupId}`);
  const currentSnapshot = await groupRef.child('tierUpdatedAt').once('value');
  const currentTimestamp: number | null = currentSnapshot.val();

  if (currentTimestamp && eventTimestampMs <= currentTimestamp) {
    functions.logger.info(
      `Skipping stale event for group ${familyGroupId}: event=${eventTimestampMs}, current=${currentTimestamp}`
    );
    return false;
  }

  await groupRef.update({
    subscriptionTier: newTier,
    tierUpdatedAt: eventTimestampMs,
  });

  functions.logger.info(`Set tier=${newTier} for group ${familyGroupId} at ${eventTimestampMs}`);
  return true;
}

const TIER_UPGRADE_EVENTS: Set<string> = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
]);

export const revenuecatWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    functions.logger.error('REVENUECAT_WEBHOOK_SECRET env var not configured');
    res.status(500).send('Server misconfigured');
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
    functions.logger.warn('Unauthorized webhook request');
    res.status(401).send('Unauthorized');
    return;
  }

  const payload: WebhookPayload = req.body;
  if (!payload?.event) {
    res.status(400).send('Missing event payload');
    return;
  }

  const event = payload.event;
  const { type, app_user_id, product_id, event_timestamp_ms } = event;

  functions.logger.info(`Webhook event: type=${type}, user=${app_user_id}, product=${product_id}`);

  try {
    if (TIER_UPGRADE_EVENTS.has(type)) {
      if (!product_id) {
        functions.logger.warn(`No product_id in ${type} event for user ${app_user_id}`);
        res.status(200).send('OK');
        return;
      }

      const newTier = PRODUCT_TIER_MAP[product_id] || 'premium';
      const familyGroupId = await lookupFamilyGroupId(app_user_id);

      if (!familyGroupId) {
        functions.logger.warn(
          `User ${app_user_id} has no familyGroupId — tier will be reconciled when they join a group`
        );
        res.status(200).send('OK');
        return;
      }

      await setFamilyTier(familyGroupId, newTier, event_timestamp_ms);
      res.status(200).send('OK');
      return;
    }

    if (type === 'TRANSFER') {
      // Handle transferred_from: set their groups to free
      const transferredFrom = event.transferred_from || [];
      for (const fromUserId of transferredFrom) {
        const fromGroupId = await lookupFamilyGroupId(fromUserId);
        if (fromGroupId) {
          await setFamilyTier(fromGroupId, 'free', event_timestamp_ms);
          functions.logger.info(`TRANSFER: set group ${fromGroupId} (from user ${fromUserId}) to free`);
        }
      }

      // Handle destination user: set their group to the product tier
      if (product_id) {
        const newTier = PRODUCT_TIER_MAP[product_id] || 'premium';
        const toGroupId = await lookupFamilyGroupId(app_user_id);
        if (toGroupId) {
          await setFamilyTier(toGroupId, newTier, event_timestamp_ms);
        } else {
          functions.logger.warn(`TRANSFER destination user ${app_user_id} has no familyGroupId`);
        }
      }

      res.status(200).send('OK');
      return;
    }

    if (type === 'EXPIRATION') {
      const familyGroupId = await lookupFamilyGroupId(app_user_id);
      if (familyGroupId) {
        await setFamilyTier(familyGroupId, 'free', event_timestamp_ms);
      } else {
        functions.logger.warn(`EXPIRATION: user ${app_user_id} has no familyGroupId`);
      }
      res.status(200).send('OK');
      return;
    }

    if (type === 'CANCELLATION') {
      // No-op: access continues until period end
      res.status(200).send('OK');
      return;
    }

    if (type === 'BILLING_ISSUE') {
      functions.logger.warn(`BILLING_ISSUE for user ${app_user_id}, product=${product_id}`);
      res.status(200).send('OK');
      return;
    }

    // All other events — log and acknowledge
    functions.logger.info(`Unhandled webhook event type: ${type}`);
    res.status(200).send('OK');
  } catch (error) {
    functions.logger.error(`Webhook error processing ${type} for user ${app_user_id}:`, error);
    res.status(500).send('Internal error');
  }
});
