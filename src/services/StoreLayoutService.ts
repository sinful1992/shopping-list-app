import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { StoreLayout } from '../models/types';
import { CategoryType } from './CategoryService';
import LocalStorageManager from './LocalStorageManager';
import SyncEngine from './SyncEngine';

class StoreLayoutService {
  async getLayoutForStore(storeName: string, familyGroupId: string): Promise<StoreLayout | null> {
    return LocalStorageManager.getStoreLayoutByStore(storeName, familyGroupId);
  }

  async saveLayout(
    storeName: string,
    familyGroupId: string,
    categoryOrder: CategoryType[],
    createdBy: string,
  ): Promise<StoreLayout> {
    if (categoryOrder.length === 0) {
      throw new Error('categoryOrder must not be empty — Firebase RTDB serializes empty arrays as null');
    }

    const existing = await LocalStorageManager.getStoreLayoutByStore(storeName, familyGroupId);

    if (existing) {
      const updated = await LocalStorageManager.updateStoreLayout(existing.id, {
        categoryOrder,
        updatedAt: Date.now(),
        syncStatus: 'pending',
      });
      SyncEngine.pushChange('storeLayout', existing.id, 'update').catch(() => {});
      return updated;
    }

    const now = Date.now();
    const layout: StoreLayout = {
      id: uuidv4(),
      familyGroupId,
      storeName,
      categoryOrder,
      createdBy,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const saved = await LocalStorageManager.saveStoreLayout(layout);
    SyncEngine.pushChange('storeLayout', saved.id, 'create').catch(() => {});
    return saved;
  }
}

export default new StoreLayoutService();
