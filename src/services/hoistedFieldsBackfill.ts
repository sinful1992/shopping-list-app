import { Q } from '@nozbe/watermelondb';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocalStorageManager from './LocalStorageManager';
import { ShoppingListModel } from '../database/models/ShoppingList';
import { safeJsonParse } from '../utils/safeJsonParse';

const BACKFILL_FLAG = '@hoist_v15_backfill';
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
        const rows = await database.get<ShoppingListModel>('shopping_lists')
          .query(
            Q.where('receipt_data', Q.notEq(null)),
            Q.where('total_amount', Q.eq(null)),
          )
          .fetch();

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
        console.warn('Hoisted fields backfill failed:', e);
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
