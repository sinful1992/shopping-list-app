import * as admin from 'firebase-admin';
import axios from 'axios';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

// Define secrets using Secret Manager
const visionApiKey = defineSecret('VISION_API_KEY');
const revenuecatWebhookToken = defineSecret('REVENUECAT_WEBHOOK_TOKEN');

const database = admin.database();

// Subscription limits configuration
const SUBSCRIPTION_LIMITS: Record<string, {
  maxLists: number | null;
  maxOCRPerMonth: number | null;
  maxUrgentItemsPerMonth: number | null;
}> = {
  free: {
    maxLists: 4,
    maxOCRPerMonth: 1,
    maxUrgentItemsPerMonth: 1,
  },
  premium: {
    maxLists: null,
    maxOCRPerMonth: 20,
    maxUrgentItemsPerMonth: 3,
  },
  family: {
    maxLists: null,
    maxOCRPerMonth: null,
    maxUrgentItemsPerMonth: null,
  },
};

/**
 * Set admin custom claim for a user
 * Only callable by existing admins
 */
export const setAdminClaim = onCall(async (request) => {
  // Verify caller is admin
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError(
      'permission-denied',
      'Only admins can grant admin privileges'
    );
  }

  const { uid } = request.data;
  if (!uid) {
    throw new HttpsError(
      'invalid-argument',
      'User ID is required'
    );
  }

  // Get existing claims to preserve them
  const user = await admin.auth().getUser(uid);
  const existingClaims = user.customClaims || {};

  // Set admin claim
  await admin.auth().setCustomUserClaims(uid, {
    ...existingClaims,
    admin: true,
  });

  return { success: true, message: `Admin claim set for user ${uid}` };
});

/**
 * Initialize first admin (one-time setup)
 * This should be called once to set up the first admin user
 * Then disabled or removed
 */
export const initializeFirstAdmin = onRequest(async (req, res) => {
  // IMPORTANT: Remove or disable this function after first use
  const adminEmail = req.query.email as string;

  if (!adminEmail) {
    res.status(400).send('Email parameter required');
    return;
  }

  try {
    const user = await admin.auth().getUserByEmail(adminEmail);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    res.send(`Admin claim set for ${adminEmail} (uid: ${user.uid})`);
  } catch (error: any) {
    res.status(500).send(`Error: ${error.message}`);
  }
});

/**
 * Helper to check subscription limits
 */
async function checkSubscriptionLimit(
  userId: string,
  familyGroupId: string,
  limitType: 'lists' | 'ocr' | 'urgentItems'
): Promise<{ allowed: boolean; reason?: string }> {
  // Check if user is admin (bypass all limits)
  const user = await admin.auth().getUser(userId);
  if (user.customClaims?.admin === true) {
    return { allowed: true };
  }

  // Get family group subscription tier
  const tierSnapshot = await database
    .ref(`/familyGroups/${familyGroupId}/subscriptionTier`)
    .once('value');
  const tier = tierSnapshot.val() || 'free';

  // Get user's usage counters
  const usageSnapshot = await database
    .ref(`/users/${userId}/usageCounters`)
    .once('value');
  const usage = usageSnapshot.val() || {
    listsCreated: 0,
    ocrProcessed: 0,
    urgentItemsCreated: 0,
    lastResetDate: Date.now(),
  };

  const limits = SUBSCRIPTION_LIMITS[tier] || SUBSCRIPTION_LIMITS.free;

  // Check monthly reset
  const now = new Date();
  const lastReset = new Date(usage.lastResetDate || 0);
  const needsReset = now.getMonth() !== lastReset.getMonth() ||
                    now.getFullYear() !== lastReset.getFullYear();

  if (needsReset) {
    // Reset monthly counters
    await database.ref(`/users/${userId}/usageCounters`).update({
      ocrProcessed: 0,
      urgentItemsCreated: 0,
      lastResetDate: Date.now(),
    });
    usage.ocrProcessed = 0;
    usage.urgentItemsCreated = 0;
  }

  // Check specific limit
  switch (limitType) {
    case 'lists':
      if (limits.maxLists !== null && usage.listsCreated >= limits.maxLists) {
        return {
          allowed: false,
          reason: `List limit reached (${limits.maxLists}). Upgrade to create more lists.`,
        };
      }
      break;
    case 'ocr':
      if (limits.maxOCRPerMonth !== null && usage.ocrProcessed >= limits.maxOCRPerMonth) {
        return {
          allowed: false,
          reason: `OCR limit reached (${limits.maxOCRPerMonth}/month). Upgrade for more scans.`,
        };
      }
      break;
    case 'urgentItems':
      if (limits.maxUrgentItemsPerMonth !== null &&
          usage.urgentItemsCreated >= limits.maxUrgentItemsPerMonth) {
        return {
          allowed: false,
          reason: `Urgent item limit reached (${limits.maxUrgentItemsPerMonth}/month). Upgrade for more.`,
        };
      }
      break;
  }

  return { allowed: true };
}

/**
 * Create a shopping list with server-side limit validation
 */
export const createList = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Must be authenticated to create a list'
    );
  }

  const userId = request.auth.uid;
  const { name, familyGroupId } = request.data;

  if (!name || !familyGroupId) {
    throw new HttpsError(
      'invalid-argument',
      'List name and family group ID are required'
    );
  }

  // Check subscription limit
  const permission = await checkSubscriptionLimit(userId, familyGroupId, 'lists');
  if (!permission.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      permission.reason || 'List limit reached'
    );
  }

  // Create list and increment counter atomically
  const listId = database.ref().push().key;
  if (!listId) {
    throw new HttpsError('internal', 'Failed to generate list ID');
  }

  const listData = {
    id: listId,
    name,
    familyGroupId,
    createdBy: userId,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    status: 'active',
    isLocked: false,
  };

  const updates: Record<string, any> = {};
  updates[`/familyGroups/${familyGroupId}/lists/${listId}`] = listData;
  updates[`/users/${userId}/usageCounters/listsCreated`] =
    admin.database.ServerValue.increment(1);

  await database.ref().update(updates);

  return { listId, list: listData };
});

/**
 * Process OCR with server-side validation and API key protection
 */
export const processOCR = onCall(
  { secrets: [visionApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Must be authenticated to process OCR'
      );
    }

    const userId = request.auth.uid;
    const { image, familyGroupId } = request.data;

    if (!image || !familyGroupId) {
      throw new HttpsError(
        'invalid-argument',
        'Image and family group ID are required'
      );
    }

    // Check subscription limit
    const permission = await checkSubscriptionLimit(userId, familyGroupId, 'ocr');
    if (!permission.allowed) {
      throw new HttpsError(
        'resource-exhausted',
        permission.reason || 'OCR limit reached'
      );
    }

    // Get API key from Secret Manager
    const apiKey = visionApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'Vision API key not configured'
      );
    }

    try {
      // Call Google Cloud Vision API
      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          requests: [
            {
              image: { content: image },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      // Increment usage counter
      await database
        .ref(`/users/${userId}/usageCounters/ocrProcessed`)
        .set(admin.database.ServerValue.increment(1));

      return {
        success: true,
        result: response.data.responses[0],
      };
    } catch (error: any) {
      console.error('Vision API error:', error.message);
      throw new HttpsError(
        'internal',
        'Failed to process image'
      );
    }
  }
);

/**
 * Create urgent item with server-side validation
 */
export const createUrgentItem = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Must be authenticated to create urgent item'
    );
  }

  const userId = request.auth.uid;
  const { name, familyGroupId, requestedBy } = request.data;

  if (!name || !familyGroupId) {
    throw new HttpsError(
      'invalid-argument',
      'Item name and family group ID are required'
    );
  }

  // Check subscription limit
  const permission = await checkSubscriptionLimit(userId, familyGroupId, 'urgentItems');
  if (!permission.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      permission.reason || 'Urgent item limit reached'
    );
  }

  // Create urgent item and increment counter atomically
  const itemId = database.ref().push().key;
  if (!itemId) {
    throw new HttpsError('internal', 'Failed to generate item ID');
  }

  const itemData = {
    id: itemId,
    name,
    familyGroupId,
    createdBy: userId,
    requestedBy: requestedBy || userId,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    status: 'pending',
  };

  const updates: Record<string, any> = {};
  updates[`/familyGroups/${familyGroupId}/urgentItems/${itemId}`] = itemData;
  updates[`/users/${userId}/usageCounters/urgentItemsCreated`] =
    admin.database.ServerValue.increment(1);

  await database.ref().update(updates);

  return { itemId, item: itemData };
});

/**
 * Sync subscription tier from RevenueCat webhook
 * This should be called by RevenueCat webhook, not client
 */
export const syncSubscriptionFromWebhook = onRequest(
  { secrets: [revenuecatWebhookToken] },
  async (req, res) => {
    // Verify webhook signature (RevenueCat sends this)
    const authHeader = req.headers.authorization;
    const expectedToken = revenuecatWebhookToken.value();

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body;

    try {
      const userId = event.app_user_id;
      const productId = event.product_id;

      // Map product ID to tier
      let tier = 'free';
      if (productId?.includes('premium')) {
        tier = 'premium';
      } else if (productId?.includes('family')) {
        tier = 'family';
      }

      // Get user's family group
      const userSnapshot = await database.ref(`/users/${userId}`).once('value');
      const user = userSnapshot.val();

      if (user?.familyGroupId) {
        await database
          .ref(`/familyGroups/${user.familyGroupId}/subscriptionTier`)
          .set(tier);
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(500).send('Error processing webhook');
    }
  }
);
