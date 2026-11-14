import { v4 as uuidv4 } from 'uuid';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { getAuth, getIdToken } from '@react-native-firebase/auth';
import { Item } from '../models/types';
import AuthenticationModule from './AuthenticationModule';
import LocalStorageManager from './LocalStorageManager';
import CrashReporting from './CrashReporting';
import supabase from './SupabaseClient';

/**
 * Tells the rest of the family that an item was marked urgent. The
 * upsert-urgent-item function stores the row, and the database webhook on
 * that table sends the push (notify-urgent-item). That trigger fires on
 * INSERT only, so every time an item turns urgent gets a row of its own;
 * reusing the item's id would make a second marking silent.
 *
 * Fire-and-forget: a failed push never blocks or undoes the urgent flag.
 *
 * Offline (the call never reached the server), the marking waits in a small
 * outbox kept on the phone and is sent when the connection returns or the app
 * next starts. It is sent only while it still means something: the same
 * account and family, the item still there and still urgent, and not older
 * than OUTBOX_MAX_AGE_MS, and one per item. A call the server refused is not
 * retried; one it rate-limited (429) is.
 */

export interface PendingUrgent {
  id: string;
  itemId: string;
  name: string;
  familyGroupId: string;
  uid: string;
  createdByName: string;
  createdAt: number;
}

export const OUTBOX_KEY = '@urgent_outbox';
export const OUTBOX_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const OUTBOX_MAX = 20;

let watching = false;
let wasOnline = true;
// Every read-modify-write of the stored outbox, and every flush, runs one at
// a time, so a marking added while a flush runs is neither lost nor sent twice.
let chain: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task);
  chain = run.catch(() => undefined);
  return run;
}

export function notifyItemUrgent(item: Item): void {
  build(item)
    .then(pending => {
      if (!pending) return;
      return sendOrKeep(pending);
    })
    .catch(error => {
      CrashReporting.recordError(error as Error, 'UrgentNotifier.notifyItemUrgent');
    });
}

async function build(item: Item): Promise<PendingUrgent | null> {
  const authUser = getAuth().currentUser;
  if (!authUser) return null;
  const user = await AuthenticationModule.getCurrentUser();
  if (!user?.familyGroupId) return null;
  return {
    id: uuidv4(),
    itemId: item.id,
    name: item.name,
    familyGroupId: user.familyGroupId,
    uid: authUser.uid,
    createdByName: user.displayName || 'Someone',
    createdAt: Date.now(),
  };
}

/**
 * Worth trying again later: the request never got an answer (offline, or the
 * login token could not be refreshed offline), or the server asked us to slow
 * down (429). Any other answer is final.
 */
function isRetryable(error: unknown): boolean {
  const e = error as { name?: string; code?: string; context?: { status?: number } } | null;
  if (!e) return false;
  if (e.name === 'FunctionsFetchError' || e.name === 'TypeError' || e.name === 'AbortError') return true;
  if (e.code === 'auth/network-request-failed') return true;
  return e.name === 'FunctionsHttpError' && e.context?.status === 429;
}

async function send(pending: PendingUrgent): Promise<void> {
  const authUser = getAuth().currentUser;
  if (!authUser) throw new Error('signed out');
  const { error } = await supabase.functions.invoke('upsert-urgent-item', {
    body: {
      idToken: await getIdToken(authUser),
      id: pending.id,
      name: pending.name,
      family_group_id: pending.familyGroupId,
      created_by: pending.uid,
      created_by_name: pending.createdByName,
      created_at: pending.createdAt,
      status: 'active',
    },
  });
  if (error) throw error;
}

async function sendOrKeep(pending: PendingUrgent): Promise<void> {
  try {
    await send(pending);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    await serial(async () => {
      // One waiting push per item: marking it urgent again offline is the same news.
      const outbox = (await readOutbox()).filter(p => p.itemId !== pending.itemId);
      outbox.push(pending);
      await writeOutbox(outbox.slice(-OUTBOX_MAX));
    });
    watchConnection();
  }
}

async function readOutbox(): Promise<PendingUrgent[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOutbox(outbox: PendingUrgent[]): Promise<void> {
  if (outbox.length === 0) await AsyncStorage.removeItem(OUTBOX_KEY);
  else await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
}

/** Whether a waiting marking should still be sent now. */
async function stillWanted(pending: PendingUrgent, now: number): Promise<boolean> {
  if (now - pending.createdAt > OUTBOX_MAX_AGE_MS) return false;
  const authUser = getAuth().currentUser;
  if (!authUser || authUser.uid !== pending.uid) return false;
  const user = await AuthenticationModule.getCurrentUser();
  if (user?.familyGroupId !== pending.familyGroupId) return false;
  const item = await LocalStorageManager.getItem(pending.itemId);
  return item?.isUrgent === true;
}

/**
 * Send what waits in the outbox. Runs at app start and when the connection
 * returns. A marking that fails on the network again stays for the next try;
 * one the server refuses, or that no longer applies, is dropped.
 */
export function flushUrgentOutbox(): Promise<void> {
  watchConnection();
  return serial(async () => {
    const outbox = await readOutbox();
    if (outbox.length === 0) return;
    const keep: PendingUrgent[] = [];
    const now = Date.now();
    for (const pending of outbox) {
      try {
        if (!(await stillWanted(pending, now))) continue;
        await send(pending);
      } catch (error) {
        if (isRetryable(error)) keep.push(pending);
        else CrashReporting.recordError(error as Error, 'UrgentNotifier.flushUrgentOutbox');
      }
    }
    await writeOutbox(keep);
  }).catch(error => {
    CrashReporting.recordError(error as Error, 'UrgentNotifier.flushUrgentOutbox');
  });
}

/** Registered on first use, not at import, like ImageStorageManager. */
function watchConnection(): void {
  if (watching) return;
  watching = true;
  NetInfo.addEventListener(state => {
    const online = state.isConnected !== false;
    if (online && !wasOnline) flushUrgentOutbox();
    wasOnline = online;
  });
}

/** @internal test seam */
export function __resetUrgentNotifierForTests(): void {
  watching = false;
  wasOnline = true;
  chain = Promise.resolve();
}
