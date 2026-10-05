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
 * across (new store empty -> read old -> write new -> delete old). A failed
 * old read writes nothing and is not retried until the next launch. Remove
 * this, and the dependency, once users have updated past 1.48.8.
 */

const SERVICE_PREFIX = 'fsl.';
const ACCOUNT = 'value';

const options = (key: string) => ({
  service: SERVICE_PREFIX + key,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
});

const migrations = new Map<string, Promise<void>>();

async function readNew(key: string): Promise<string | null> {
  const result = await Keychain.getGenericPassword(options(key));
  return result ? result.password : null;
}

async function migrate(key: string): Promise<void> {
  try {
    if ((await readNew(key)) !== null) {
      return;
    }
    const legacy = await EncryptedStorage.getItem(key);
    if (legacy) {
      await Keychain.setGenericPassword(ACCOUNT, legacy, options(key));
      await EncryptedStorage.removeItem(key);
    }
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
  await ensureMigrated(key);
  if (!value) {
    await Keychain.resetGenericPassword(options(key));
    return;
  }
  const stored = await Keychain.setGenericPassword(ACCOUNT, value, options(key));
  if (!stored) {
    throw new Error(`SecureStorage could not store ${key}`);
  }
}

async function removeItem(key: string): Promise<void> {
  await ensureMigrated(key);
  await Keychain.resetGenericPassword(options(key));
  await EncryptedStorage.removeItem(key).catch(() => undefined);
}

export default { getItem, setItem, removeItem };
