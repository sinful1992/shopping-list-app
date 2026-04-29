/**
 * One-time admin script: backfill invitationCode onto existing family groups.
 *
 * Usage:
 *   SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json \
 *   FIREBASE_DB_URL=https://your-project.firebaseio.com \
 *   npx ts-node scripts/backfill-invitation-codes.ts
 *
 * The script reads every entry under /invitations and writes the code back
 * onto the corresponding /familyGroups/{groupId}/invitationCode node.
 * Orphan invitation codes (whose groupId no longer exists) are logged.
 *
 * Run against staging first. Deploy security-rule tightening only after
 * this completes successfully in production.
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';

const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;
const databaseURL = process.env.FIREBASE_DB_URL;

if (!serviceAccountPath || !databaseURL) {
  console.error('Set SERVICE_ACCOUNT_PATH and FIREBASE_DB_URL env vars');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
});

const db = admin.database();

async function run() {
  const invitationsSnap = await db.ref('/invitations').once('value');
  const invitations = invitationsSnap.val() as Record<string, { groupId: string; createdAt: number }> | null;

  if (!invitations) {
    console.log('No invitation entries found — nothing to backfill.');
    return;
  }

  const updates: Record<string, string> = {};
  const orphans: string[] = [];

  for (const [code, entry] of Object.entries(invitations)) {
    const groupSnap = await db.ref(`/familyGroups/${entry.groupId}`).once('value');
    if (!groupSnap.exists()) {
      orphans.push(code);
      continue;
    }
    updates[`/familyGroups/${entry.groupId}/invitationCode`] = code;
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
    console.log(`Backfilled invitationCode for ${Object.keys(updates).length} group(s).`);
  } else {
    console.log('All groups already have invitationCode — nothing to write.');
  }

  if (orphans.length > 0) {
    console.warn(`Orphan invitation codes (groupId not found): ${orphans.join(', ')}`);
  }
}

run()
  .then(() => { process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
