/**
 * Script to update family group subscription tier
 *
 * Usage:
 *   node scripts/update-family-tier.js YOUR_FAMILY_GROUP_ID family
 *
 * Requirements:
 *   - Firebase Admin SDK initialized
 *   - Service account credentials
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
try {
  const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://YOUR_PROJECT_ID.firebaseio.com' // Update with your project ID
  });

  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  console.log('\nPlease ensure you have:');
  console.log('1. Downloaded service account key from Firebase Console');
  console.log('2. Saved it as serviceAccountKey.json in project root');
  console.log('3. Updated databaseURL with your project ID');
  process.exit(1);
}

/**
 * Update family group subscription tier
 */
async function updateFamilyTier(familyGroupId, tier) {
  const validTiers = ['free', 'premium', 'family'];

  // Validate tier
  if (!validTiers.includes(tier)) {
    console.error(`❌ Invalid tier: ${tier}`);
    console.log(`Valid tiers: ${validTiers.join(', ')}`);
    process.exit(1);
  }

  try {
    // Get reference to family group
    const familyRef = admin.database().ref(`/familyGroups/${familyGroupId}`);

    // Check if family group exists
    const snapshot = await familyRef.once('value');
    if (!snapshot.exists()) {
      console.error(`❌ Family group not found: ${familyGroupId}`);
      process.exit(1);
    }

    const familyData = snapshot.val();
    console.log('\n📋 Current Family Group:');
    console.log(`   ID: ${familyGroupId}`);
    console.log(`   Name: ${familyData.name || 'N/A'}`);
    console.log(`   Current Tier: ${familyData.subscriptionTier || 'free'}`);
    console.log(`   Members: ${familyData.members ? Object.keys(familyData.members).length : 0}`);

    // Update subscription tier
    await familyRef.update({
      subscriptionTier: tier,
      updatedAt: Date.now(),
    });

    console.log(`\n✅ Successfully updated subscription tier to: ${tier}`);

    // Show tier benefits
    const benefits = {
      free: ['4 Lists', '1 OCR/month', '1 Urgent Item/month'],
      premium: ['Unlimited Lists', '20 OCR/month', '3 Urgent Items/month'],
      family: ['Unlimited Everything', '10 Family Members', 'All Features'],
    };

    console.log('\n🎁 Tier Benefits:');
    benefits[tier].forEach(benefit => console.log(`   ✓ ${benefit}`));

    console.log('\n📱 Next Steps:');
    console.log('   1. All family members should restart the app');
    console.log('   2. New limits will be applied immediately');
    console.log('   3. Usage counters will reset monthly');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating family tier:', error);
    process.exit(1);
  }
}

/**
 * List all family groups
 */
async function listFamilyGroups() {
  try {
    const familyGroupsRef = admin.database().ref('/familyGroups');
    const snapshot = await familyGroupsRef.once('value');
    const familyGroups = snapshot.val();

    if (!familyGroups) {
      console.log('No family groups found');
      return;
    }

    console.log('\n📋 All Family Groups:\n');
    Object.entries(familyGroups).forEach(([id, data]) => {
      console.log(`ID: ${id}`);
      console.log(`   Name: ${data.name || 'N/A'}`);
      console.log(`   Tier: ${data.subscriptionTier || 'free'}`);
      console.log(`   Members: ${data.members ? Object.keys(data.members).length : 0}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error listing family groups:', error);
    process.exit(1);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--list') {
  console.log('📋 Listing all family groups...\n');
  listFamilyGroups();
} else if (args.length === 2) {
  const [familyGroupId, tier] = args;
  console.log(`🔄 Updating family group ${familyGroupId} to ${tier} tier...\n`);
  updateFamilyTier(familyGroupId, tier);
} else {
  console.log('Usage:');
  console.log('  node scripts/update-family-tier.js --list');
  console.log('  node scripts/update-family-tier.js FAMILY_GROUP_ID TIER');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/update-family-tier.js --list');
  console.log('  node scripts/update-family-tier.js -Abc123XyZ family');
  console.log('');
  console.log('Valid tiers: free, premium, family');
  process.exit(1);
}
