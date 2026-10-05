import * as Keychain from 'react-native-keychain';
import EncryptedStorage from 'react-native-encrypted-storage';
import CrashReporting from './CrashReporting';

/**
 * Encrypted key-value storage on react-native-keychain (Android Keystore
 * AES-GCM, iOS Keychain), with the same getItem/setItem/removeItem shape as
 * react-native-encrypted-storage, which it replaces.
 *
 * Each key is one keychain entry (service = SERVICE_PREFIX + key). Storage is
 * pinned to AES-GCM without user authentication, so no read ever prompts for
 * biometrics or depends on the lock screen.
 *
 * Migration: react-native-encrypted-storage stays installed only as a
 * read-only source. The first operation on a key in a process moves its value
 * across (new store empty -> read old -> write new -> mark done -> delete old).
 * A failed old read writes nothing and is not retried until the next launch.
 * Once a key is marked done (a finished move, or any write or remove through
 * this module), the old store is never read for it again, so a value cleared
 * here cannot come back from an old copy that failed to delete. Remove this,
 * and the dependency, once users have updated past 1.48.9.
 */

const SERVICE_PREFIX = 'fsl.';
const MIGRATED_PREFIX = 'fsl.migrated.';
const ACCOUNT = 'value';

const entry = (service: string) => ({
  service,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
});
const options = (key: string) => entry(SERVICE_PREFIX + key);
const marker = (key: string) => entry(MIGRATED_PREFIX + key);

const migrations = new Map<string, Promise<void>>();
const migrated = new Set<string>();

async function readNew(key: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword(options(key));
  return result ? result.password : null;
}

async function isMigrated(key: string): Promise<boolean> {
  if (!migrated.has(key) && (await Keychain.getGenericPassword(marker(key)))) {
    migrated.add(key);
  }
  return migrated.has(key);
}

async function markMigrated(key: string): Promise<void> {
  if (migrated.has(key)) {
    return;
  }
  try {
    await Keychain.setGenericPassword(ACCOUNT, '1', marker(key));
    migrated.add(key);
  } catch (error) {
    CrashReporting.recordError(error as Error, `SecureStorage mark ${key}`);
  }
}

async function migrate(key: string): Promise<void> {
  try {
    if (await isMigrated(key)) {
      return;
    }
    if ((await readNew(key)) === null) {
      const legacy = await EncryptedStorage.getItem(key);
      if (legacy) {
        await Keychain.setGenericPassword(ACCOUNT, legacy, options(key));
      }
    }
    await markMigrated(key);
    await EncryptedStorage.removeItem(key);
  } catch (error) {
    CrashReporting.recordError(error as Error, `SecureStorage migrate ${key}`);
  }
}

function ensureMigrated(key: string): Promise<void> {
  let migration = migrations.get(key);
  if (!migration) {
    migration = migrate(key);
    migrations.set(key, migration);
  }
  return migration;
}

async function getItem(key: string): Promise<string | null> {
  await ensureMigrated(key);
  return readNew(key);
}

async function setItem(key: string, value: string | null | undefined): Promise<void> {
  if (!value) {
    return removeItem(key);
  }
  await ensureMigrated(key);
  const stored = await Keychain.setGenericPassword(ACCOUNT, value, options(key));
  if (!stored) {
    throw new Error(`SecureStorage could not store ${key}`);
  }
  await markMigrated(key);
}

async function removeItem(key: string): Promise<void> {
  await ensureMigrated(key);
  await Keychain.resetGenericPassword(options(key));
  await markMigrated(key);
  await EncryptedStorage.removeItem(key).catch(() => undefined);
}

export default { getItem, setItem, removeItem };
