import { Q } from '@nozbe/watermelondb';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocalStorageManager from './LocalStorageManager';
import { ShoppingListModel } from '../database/models/ShoppingList';

const BACKFILL_FLAG = '@receipt_sync_backfill_v1';
const MAX_ATTEMPTS = 3;

export async function runReceiptSyncBackfill(): Promise<void> {
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
        // Increment attempt count before the write so a crash mid-transaction still counts
        await AsyncStorage.setItem(BACKFILL_FLAG, String(attemptCount + 1));

        const database = LocalStorageManager.getDatabase();
        const orphans = await database.get<ShoppingListModel>('shopping_lists')
          .query(
            Q.where('receipt_data', Q.notEq(null)),
            Q.where('sync_status', Q.notIn(['pending', 'syncing'])),
          )
          .fetch();

        if (orphans.length === 0) {
          await AsyncStorage.setItem(BACKFILL_FLAG, 'done');
          resolve();
          return;
        }

        const prepared = orphans.map(row =>
          row.prepareUpdate(r => {
            r.syncStatus = 'pending';
          })
        );

        await database.write(async () => {
          await database.batch(...prepared);
        }, 'receipt backfill');

        await AsyncStorage.setItem(BACKFILL_FLAG, 'done');
      } catch (e) {
        console.warn('Receipt sync backfill failed:', e);
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
