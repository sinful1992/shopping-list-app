import { Q } from '@nozbe/watermelondb';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocalStorageManager from './LocalStorageManager';
import { ShoppingListModel } from '../database/models/ShoppingList';
import { safeJsonParse } from '../utils/safeJsonParse';

/**
 * Bumped from @hoist_v15_backfill.
 *
 * The v15 repair matched only rows whose total_amount was NULL, but the
 * completion path it was written to repair stored 0 for a trip whose running
 * total was not known yet — so every one of those rows was skipped and the
 * total stayed in the receiptData JSON where nothing reads it. Those lists
 * then counted as £0 spend in Analytics, History and Budget alike, which is
 * not a free shop: it is a shop whose total was never hoisted. v15 is 'done'
 * on every affected device, so re-running needs a new key.
 */
const BACKFILL_FLAG = '@hoist_v16_backfill';
const MAX_ATTEMPTS = 3;

export async function runHoistedFieldsBackfill(): Promise<void> {
  const flagValue = await AsyncStorage.getItem(BACKFILL_FLAG);

  if (flagValue === 'done' || flagValue === 'failed') {
    return;
  }

  const attemptCount = flagValue ? parseInt(flagValue, 10) : 0;
  if (isNaN(attemptCount) || attemptCount >= MAX_ATTEMPTS) {
    await AsyncStorage.setItem(BACKFILL_FLAG, 'failed');
    return;
  }

  return new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(async () => {
      try {
        await AsyncStorage.setItem(BACKFILL_FLAG, String(attemptCount + 1));

        const database = LocalStorageManager.getDatabase();
        // @ts-ignore TS6 stricter generic constraint on Database.get — runtime works correctly
        const candidates = await database.get<ShoppingListModel>('shopping_lists')
          .query(Q.where('receipt_data', Q.notEq(null)))
          .fetch();

        // Filtered here rather than in the query: "no total on the column yet"
        // is both NULL and 0, and the two adapters do not agree on how a
        // null/0 comparison behaves. Only rows carrying receipt data reach
        // this, so the list is short and the JS pass is unambiguous.
        const rows = candidates.filter(row => row.totalAmount == null || row.totalAmount === 0);

        if (rows.length === 0) {
          await AsyncStorage.setItem(BACKFILL_FLAG, 'done');
          resolve();
          return;
        }

        const prepared = rows.map(row => {
          const parsed = safeJsonParse<any>(row.receiptData, null);
          if (!parsed) return null;
          return row.prepareUpdate((r: ShoppingListModel) => {
            if (parsed.totalAmount != null) r.totalAmount = parsed.totalAmount;
            if (parsed.merchantName != null) r.merchantName = parsed.merchantName;
            if (parsed.purchaseDate != null) r.purchaseDate = parsed.purchaseDate;
            if (parsed.currency != null) r.currency = parsed.currency;
          });
        }).filter(Boolean) as ReturnType<ShoppingListModel['prepareUpdate']>[];

        if (prepared.length > 0) {
          await database.write(async () => {
            await database.batch(...prepared);
          }, 'hoist v15 backfill');
        }

        await AsyncStorage.setItem(BACKFILL_FLAG, 'done');
      } catch (e) {
        if (__DEV__) console.warn('Hoisted fields backfill failed:', e);
        const current = await AsyncStorage.getItem(BACKFILL_FLAG);
        const count = current ? parseInt(current, 10) : 0;
        if (!isNaN(count) && count >= MAX_ATTEMPTS) {
          await AsyncStorage.setItem(BACKFILL_FLAG, 'failed');
        }
      }
      resolve();
    });
  });
}
