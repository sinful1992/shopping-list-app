#!/usr/bin/env node

/**
 * Admin script: update-family-tier.js
 *
 * Usage:
 *   node scripts/update-family-tier.js <familyGroupId> <tier>
 *   node scripts/update-family-tier.js --list
 *
 * Examples:
 *   node scripts/update-family-tier.js -Kx1234abc premium
 *   node scripts/update-family-tier.js -Kx1234abc free
 *   node scripts/update-family-tier.js --list
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account key,
 * or run from an environment with default credentials (e.g., Cloud Shell).
 */

const admin = require('firebase-admin');

const VALID_TIERS = ['free', 'premium', 'family'];

async function main() {
  admin.initializeApp();
  const db = admin.database();

  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  if (args[0] === '--list') {
    await listFamilyGroups(db);
    return;
  }

  if (args.length < 2) {
    console.error('Error: Missing arguments. Provide <familyGroupId> <tier>');
    printUsage();
    process.exit(1);
  }

  const [familyGroupId, tier] = args;

  if (!VALID_TIERS.includes(tier)) {
    console.error(`Error: Invalid tier "${tier}". Must be one of: ${VALID_TIERS.join(', ')}`);
    process.exit(1);
  }

  const groupSnapshot = await db.ref(`/familyGroups/${familyGroupId}`).once('value');
  if (!groupSnapshot.exists()) {
    console.error(`Error: Family group "${familyGroupId}" not found`);
    process.exit(1);
  }

  const group = groupSnapshot.val();
  const oldTier = group.subscriptionTier || 'free';

  await db.ref(`/familyGroups/${familyGroupId}`).update({
    subscriptionTier: tier,
    tierUpdatedAt: Date.now(),
  });

  console.log(`Updated family group "${familyGroupId}" (${group.name})`);
  console.log(`  Tier: ${oldTier} -> ${tier}`);
  console.log('Done.');
}

async function listFamilyGroups(db) {
  const snapshot = await db.ref('/familyGroups').once('value');
  const groups = snapshot.val();

  if (!groups) {
    console.log('No family groups found.');
    return;
  }

  console.log('Family Groups:');
  console.log('-'.repeat(80));
  console.log(
    padRight('ID', 25) +
    padRight('Name', 25) +
    padRight('Tier', 10) +
    padRight('Members', 10)
  );
  console.log('-'.repeat(80));

  for (const [id, group] of Object.entries(groups)) {
    const g = group;
    const memberCount = g.memberIds ? Object.keys(g.memberIds).length : 0;
    console.log(
      padRight(id, 25) +
      padRight(g.name || '(unnamed)', 25) +
      padRight(g.subscriptionTier || 'free', 10) +
      padRight(String(memberCount), 10)
    );
  }
}

function padRight(str, len) {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/update-family-tier.js <familyGroupId> <tier>');
  console.log('  node scripts/update-family-tier.js --list');
  console.log('');
  console.log('Tiers: free, premium, family');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
