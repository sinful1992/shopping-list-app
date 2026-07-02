import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import CrashReporting from '../CrashReporting';
import { schema } from '../../database/schema';
import migrations from '../../database/migrations';
import { ShoppingListModel } from '../../database/models/ShoppingList';
import { ItemModel } from '../../database/models/Item';
import { SyncQueueModel } from '../../database/models/SyncQueue';
import { UrgentItemModel } from '../../database/models/UrgentItem';
import { CategoryHistoryModel } from '../../database/models/CategoryHistory';
import { PriceHistoryModel } from '../../database/models/PriceHistory';
import StoreLayoutModel from '../../database/models/StoreLayout';
import { ItemPreferenceModel } from '../../database/models/ItemPreference';

/**
 * Constructs the single WatermelonDB instance shared by all storage domains.
 * Only LocalStorageManager (the facade) should call this — domains receive
 * the handle, they never create one.
 */
export function createDatabase(): Database {
  const adapter = new SQLiteAdapter({
    schema,
    migrations, // Enable schema migrations
    jsi: true, // Use JSI for better performance
    onSetUpError: (error) => {
      // Crashlytics native SDK is active by default — no JS init required
      CrashReporting.recordError(error, 'WatermelonDB onSetUpError');
    },
  });

  return new Database({
    adapter,
    modelClasses: [ShoppingListModel, ItemModel, SyncQueueModel, UrgentItemModel, CategoryHistoryModel, PriceHistoryModel, StoreLayoutModel, ItemPreferenceModel],
  });
}
