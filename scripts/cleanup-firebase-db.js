#!/usr/bin/env node

/**
 * One-time cleanup script for Firebase Realtime Database.
 *
 * Fixes:
 *   1. Deletes orphaned `itemPreferences` node (feature removed in v1.12.0)
 *   2. Removes redundant `category` field from all `categoryHistory` entries
 *      (category is already the Firebase key — storing it inside was redundant)
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node scripts/cleanup-firebase-db.js
 *
 * Dry run (inspect only, no writes):
 *   DRY_RUN=true GOOGLE_APPLICATION_CREDENTIALS=... node scripts/cleanup-firebase-db.js
 */

const admin = require('firebase-admin');

const DRY_RUN = process.env.DRY_RUN === 'true';
const DATABASE_URL = 'https://shopinglist-8b921-default-rtdb.europe-west1.firebasedatabase.app';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: DATABASE_URL,
});

const db = admin.database();

async function cleanItemPreferences(groupId) {
  const ref = db.ref(`familyGroups/${groupId}/itemPreferences`);
  const snap = await ref.once('value');
  if (!snap.exists()) {
    console.log(`  [${groupId}] itemPreferences: not present, skipping`);
    return;
  }
  const count = Object.keys(snap.val()).length;
  console.log(`  [${groupId}] itemPreferences: found ${count} entries — ${DRY_RUN ? 'DRY RUN, skipping delete' : 'deleting...'}`);
  if (!DRY_RUN) await ref.remove();
}

async function cleanCategoryHistoryFields(groupId) {
  const ref = db.ref(`familyGroups/${groupId}/categoryHistory`);
  const snap = await ref.once('value');
  if (!snap.exists()) {
    console.log(`  [${groupId}] categoryHistory: not present, skipping`);
    return;
  }

  const updates = {};
  let fieldCount = 0;

  snap.forEach((itemSnap) => {
    const itemHash = itemSnap.key;
    itemSnap.forEach((categorySnap) => {
      const categoryKey = categorySnap.key;
      const data = categorySnap.val();
      if (data && data.category !== undefined) {
        updates[`familyGroups/${groupId}/categoryHistory/${itemHash}/${categoryKey}/category`] = null;
        fieldCount++;
      }
    });
  });

  console.log(`  [${groupId}] categoryHistory: found ${fieldCount} redundant category fields — ${DRY_RUN ? 'DRY RUN, skipping update' : 'removing...'}`);
  if (!DRY_RUN && fieldCount > 0) await db.ref('/').update(updates);
}

async function main() {
  console.log(`Firebase DB cleanup — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const groupsSnap = await db.ref('familyGroups').once('value');
  if (!groupsSnap.exists()) {
    console.log('No family groups found.');
    process.exit(0);
  }

  const groupIds = Object.keys(groupsSnap.val());
  console.log(`Found ${groupIds.length} family group(s)\n`);

  for (const groupId of groupIds) {
    console.log(`Processing group: ${groupId}`);
    await cleanItemPreferences(groupId);
    await cleanCategoryHistoryFields(groupId);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
