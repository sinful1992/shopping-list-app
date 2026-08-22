const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const RULES_PATH = path.resolve(__dirname, '..', '..', 'database.rules.json');

// `firebase emulators:exec` exports this; fall back so the file can also be run
// against a manually started emulator.
function emulatorAddress() {
  const raw = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
  const [host, port] = raw.split(':');
  return { host, port: Number(port) };
}

async function createTestEnv() {
  const { host, port } = emulatorAddress();
  return initializeTestEnvironment({
    projectId: 'shopping-rules-test',
    database: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host,
      port,
    },
  });
}

// The app only wires email/password and Google, so every token carries an email.
// Passing it explicitly is what lets the S5 assertions vary the *token* email
// independently of the payload being written.
function asUser(testEnv, uid, email) {
  return testEnv.authenticatedContext(uid, { email }).database();
}

function makeUser(uid, email, displayName, familyGroupId = null) {
  return {
    uid,
    email,
    displayName,
    familyGroupId,
    createdAt: 1700000000000,
    usageCounters: {
      listsCreated: 0,
      ocrProcessed: 0,
      urgentItemsCreated: 0,
      lastResetDate: 1700000000000,
    },
  };
}

function makeGroup(groupId, createdBy, memberIds, invitationCode) {
  return {
    id: groupId,
    name: 'Test Family',
    invitationCode,
    createdBy,
    memberIds,
    createdAt: 1700000000000,
    subscriptionTier: 'free',
  };
}

function makeJoinRequest(userId, groupId, email, displayName, status = 'pending') {
  return {
    userId,
    groupId,
    displayName,
    email,
    requestedAt: 1700000100000,
    status,
  };
}

module.exports = { createTestEnv, asUser, makeUser, makeGroup, makeJoinRequest };
