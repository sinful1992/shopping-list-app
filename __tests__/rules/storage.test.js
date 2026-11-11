/**
 * SH-5 (audit 137, team task 142): receipt uploads are bounded. Before the
 * fix any member could store any file of any size and type under
 * receipts/<own family>/. The app uploads `receipts/{group}/{list}/{ms}.jpg`
 * with content type image/jpeg (React Native Firebase sets it from the .jpg
 * name), a few MB at most.
 *
 * Run with `npm run test:rules` (database + storage emulators).
 */
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

const MB = 1024 * 1024;
const G = 'group-a';
let testEnv;

function storageAddress() {
  const raw = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
  const [host, port] = raw.split(':');
  return { host, port: Number(port) };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-shopping-rules',
    storage: {
      rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'storage.rules'), 'utf8'),
      ...storageAddress(),
    },
  });
});
afterAll(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearStorage(); });

const member = (groupId = G) => testEnv.authenticatedContext('alice', { familyGroupId: groupId }).storage();
const put = (st, p, size, contentType) => st.ref(p).put(new Uint8Array(size), contentType ? { contentType } : undefined);
const RECEIPT = `receipts/${G}/list-1/1731300000000.jpg`;

describe('SH-5: receipt uploads have a size and type limit', () => {
  it('allows the app\'s upload: a 3 MB image/jpeg at receipts/{group}/{list}/{ms}.jpg', async () => {
    await assertSucceeds(put(member(), RECEIPT, 3 * MB, 'image/jpeg'));
  });

  it('allows reading and deleting it again (the rescan path)', async () => {
    await assertSucceeds(put(member(), RECEIPT, 1000, 'image/jpeg'));
    await assertSucceeds(member().ref(RECEIPT).getDownloadURL());
    await assertSucceeds(member().ref(RECEIPT).delete());
  });

  it('denies a 50 MB upload', async () => {
    await assertFails(put(member(), RECEIPT, 50 * MB, 'image/jpeg'));
  });

  it('denies an upload just over 15 MB and allows exactly 15 MB', async () => {
    await assertFails(put(member(), RECEIPT, 15 * MB + 1, 'image/jpeg'));
    await assertSucceeds(put(member(), RECEIPT, 15 * MB, 'image/jpeg'));
  });

  it('allows the other photo types a phone may send', async () => {
    for (const t of ['image/png', 'image/webp', 'image/heic', 'image/heif']) {
      await assertSucceeds(put(member(), RECEIPT, 1000, t));
    }
  });

  it('denies image/svg+xml and image/gif', async () => {
    await assertFails(put(member(), RECEIPT, 1000, 'image/svg+xml'));
    await assertFails(put(member(), RECEIPT, 1000, 'image/gif'));
  });

  // Builds before 1.53.25 send no type (ada #10233): accepted for the app's own name only.
  it('allows application/octet-stream for the app\'s {ms}.jpg name (old builds)', async () => {
    await assertSucceeds(put(member(), RECEIPT, 1000, 'application/octet-stream'));
  });

  it('denies application/octet-stream for any other name', async () => {
    await assertFails(put(member(), `receipts/${G}/list-1/1731300000000.zip`, 1000, 'application/octet-stream'));
    await assertFails(put(member(), `receipts/${G}/list-1/evil.jpg`, 1000, 'application/octet-stream'));
    await assertFails(put(member(), `receipts/${G}/list-1/1731300000000.jpg.exe`, 1000, 'application/octet-stream'));
    await assertFails(put(member(), `receipts/${G}/list-1/1731300000000xjpg`, 1000, 'application/octet-stream'));
  });

  it('still caps old-build uploads at 15 MB', async () => {
    await assertFails(put(member(), RECEIPT, 15 * MB + 1, 'application/octet-stream'));
  });

  it('denies a zip', async () => {
    await assertFails(put(member(), `receipts/${G}/list-1/1731300000000.zip`, 1000, 'application/zip'));
  });

  it('denies a non-image type even with a .jpg name', async () => {
    await assertFails(put(member(), RECEIPT, 1000, 'application/zip'));
    await assertFails(put(member(), RECEIPT, 1000, 'text/html'));
  });

  it('denies an empty file', async () => {
    await assertFails(put(member(), RECEIPT, 0, 'image/jpeg'));
  });

  it('denies a file outside the {list}/{file} shape', async () => {
    await assertFails(put(member(), `receipts/${G}/big.jpg`, 1000, 'image/jpeg'));
    await assertFails(put(member(), `receipts/${G}/a/b/c.jpg`, 1000, 'image/jpeg'));
  });

  it('still denies another family\'s folder and signed-out users', async () => {
    await assertFails(put(member('group-b'), RECEIPT, 1000, 'image/jpeg'));
    await assertFails(put(testEnv.unauthenticatedContext().storage(), RECEIPT, 1000, 'image/jpeg'));
    await assertFails(member('group-b').ref(RECEIPT).getDownloadURL());
  });

  it('still denies anything outside receipts/', async () => {
    await assertFails(put(member(), `other/${G}/x.jpg`, 1000, 'image/jpeg'));
  });
});
