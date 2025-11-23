import database from '@react-native-firebase/database';

/**
 * DatabaseMigration
 * One-time migration to move data from old paths to new paths
 */
class DatabaseMigration {
  /**
   * Migrate lists from old path to new path
   * Old: shoppingLists/{familyGroupId}/{listId}
   * New: familyGroups/{familyGroupId}/lists/{listId}
   */
  async migrateLists(familyGroupId: string): Promise<{ success: boolean; migratedCount: number; error?: string }> {
    try {
      console.log(`Starting migration for family group: ${familyGroupId}`);

      // Read from old path
      const oldPath = `shoppingLists/${familyGroupId}`;
      const snapshot = await database().ref(oldPath).once('value');

      if (!snapshot.exists()) {
        console.log('No data found at old path, migration not needed');
        return { success: true, migratedCount: 0 };
      }

      const listsData = snapshot.val();
      const listIds = Object.keys(listsData);
      console.log(`Found ${listIds.length} lists to migrate`);

      // Copy each list to new path
      const newBasePath = `familyGroups/${familyGroupId}/lists`;

      for (const listId of listIds) {
        const listData = listsData[listId];
        await database().ref(`${newBasePath}/${listId}`).set(listData);
        console.log(`Migrated list: ${listId}`);
      }

      console.log(`Successfully migrated ${listIds.length} lists`);

      // Optional: Remove old path after successful migration
      // Uncomment the line below if you want to clean up old data
      // await database().ref(oldPath).remove();

      return { success: true, migratedCount: listIds.length };
    } catch (error: any) {
      console.error('Migration failed:', error);
      return { success: false, migratedCount: 0, error: error.message };
    }
  }

  /**
   * Migrate items from old path to new path (if needed)
   * Old: items/{listId}/{itemId}
   * New: familyGroups/{familyGroupId}/items/{itemId}
   */
  async migrateItems(familyGroupId: string, listIds: string[]): Promise<{ success: boolean; migratedCount: number; error?: string }> {
    try {
      console.log(`Starting items migration for family group: ${familyGroupId}`);

      let totalMigrated = 0;

      for (const listId of listIds) {
        // Read from old path
        const oldPath = `items/${listId}`;
        const snapshot = await database().ref(oldPath).once('value');

        if (!snapshot.exists()) {
          continue;
        }

        const itemsData = snapshot.val();
        const itemIds = Object.keys(itemsData);
        console.log(`Found ${itemIds.length} items for list ${listId}`);

        // Copy each item to new path
        const newBasePath = `familyGroups/${familyGroupId}/items`;

        for (const itemId of itemIds) {
          const itemData = itemsData[itemId];
          await database().ref(`${newBasePath}/${itemId}`).set(itemData);
          console.log(`Migrated item: ${itemId}`);
        }

        totalMigrated += itemIds.length;

        // Optional: Remove old path after successful migration
        // Uncomment the line below if you want to clean up old data
        // await database().ref(oldPath).remove();
      }

      console.log(`Successfully migrated ${totalMigrated} items`);
      return { success: true, migratedCount: totalMigrated };
    } catch (error: any) {
      console.error('Items migration failed:', error);
      return { success: false, migratedCount: 0, error: error.message };
    }
  }

  /**
   * Run full migration for a family group
   */
  async runFullMigration(familyGroupId: string): Promise<void> {
    console.log('=== Starting Full Database Migration ===');

    // Step 1: Migrate lists
    const listsResult = await this.migrateLists(familyGroupId);
    console.log(`Lists migration: ${listsResult.success ? 'SUCCESS' : 'FAILED'}`, listsResult);

    if (!listsResult.success) {
      throw new Error(`Lists migration failed: ${listsResult.error}`);
    }

    // Step 2: Get list IDs for items migration
    const listsSnapshot = await database().ref(`familyGroups/${familyGroupId}/lists`).once('value');
    const listIds = listsSnapshot.exists() ? Object.keys(listsSnapshot.val()) : [];

    // Step 3: Migrate items
    if (listIds.length > 0) {
      const itemsResult = await this.migrateItems(familyGroupId, listIds);
      console.log(`Items migration: ${itemsResult.success ? 'SUCCESS' : 'FAILED'}`, itemsResult);
    }

    console.log('=== Migration Complete ===');
  }

  /**
   * Check if migration is needed
   */
  async needsMigration(familyGroupId: string): Promise<boolean> {
    try {
      const oldPath = `shoppingLists/${familyGroupId}`;
      const snapshot = await database().ref(oldPath).once('value');
      return snapshot.exists();
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }
}

export default new DatabaseMigration();
