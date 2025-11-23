import database from '@react-native-firebase/database';

/**
 * DatabaseMigration
 *
 * Handles all database migrations for the shopping list app.
 *
 * MIGRATION HISTORY:
 * -----------------
 * 1. memberIds format migration (v1.0)
 *    - Converts memberIds from array format to object format
 *    - Required for Firebase security rules to work with hasChild()/exists()
 *    - Old: memberIds: ["uid1", "uid2"]
 *    - New: memberIds: { "uid1": true, "uid2": true }
 *
 * 2. Old path cleanup (v1.0)
 *    - Removes deprecated database paths that are no longer used
 *    - Old paths: shoppingLists/{familyGroupId}, items/{listId}
 *    - New paths: familyGroups/{familyGroupId}/lists, familyGroups/{familyGroupId}/items
 */
class DatabaseMigration {
  /**
   * Convert memberIds from array to object format
   * This is required for Firebase security rules to work properly
   */
  async migrateMemberIds(familyGroupId: string): Promise<{ success: boolean; migrated: boolean; error?: string }> {
    try {
      console.log(`Checking memberIds format for family group: ${familyGroupId}`);

      const memberIdsRef = database().ref(`familyGroups/${familyGroupId}/memberIds`);
      const snapshot = await memberIdsRef.once('value');

      if (!snapshot.exists()) {
        console.log('No memberIds found');
        return { success: true, migrated: false };
      }

      const memberIds = snapshot.val();

      // Check if already in object format
      if (!Array.isArray(memberIds)) {
        console.log('memberIds already in object format, no migration needed');
        return { success: true, migrated: false };
      }

      // Convert array to object
      console.log(`Converting memberIds from array (${memberIds.length} members) to object format`);
      const memberIdsObject: { [key: string]: boolean } = {};
      memberIds.forEach((uid: string) => {
        memberIdsObject[uid] = true;
      });

      // Update in database
      await memberIdsRef.set(memberIdsObject);
      console.log('memberIds migration completed successfully');

      return { success: true, migrated: true };
    } catch (error: any) {
      console.error('memberIds migration failed:', error);
      return { success: false, migrated: false, error: error.message };
    }
  }

  /**
   * Clean up old database paths that are no longer used
   * Old structure: shoppingLists/{familyGroupId}, items/{listId}
   * New structure: familyGroups/{familyGroupId}/lists, familyGroups/{familyGroupId}/items
   */
  async cleanupOldPaths(familyGroupId: string): Promise<{ success: boolean; cleaned: string[]; error?: string }> {
    try {
      console.log(`Cleaning up old database paths for family group: ${familyGroupId}`);
      const cleaned: string[] = [];

      // Check and remove old shoppingLists path
      const oldListsPath = `shoppingLists/${familyGroupId}`;
      const oldListsSnapshot = await database().ref(oldListsPath).once('value');

      if (oldListsSnapshot.exists()) {
        console.log(`Found old lists at ${oldListsPath}, removing...`);
        await database().ref(oldListsPath).remove();
        cleaned.push(oldListsPath);
      }

      // Check and remove old items paths
      // First, get all list IDs from the new location
      const listsSnapshot = await database().ref(`familyGroups/${familyGroupId}/lists`).once('value');

      if (listsSnapshot.exists()) {
        const lists = listsSnapshot.val();
        const listIds = Object.keys(lists);

        for (const listId of listIds) {
          const oldItemsPath = `items/${listId}`;
          const oldItemsSnapshot = await database().ref(oldItemsPath).once('value');

          if (oldItemsSnapshot.exists()) {
            console.log(`Found old items at ${oldItemsPath}, removing...`);
            await database().ref(oldItemsPath).remove();
            cleaned.push(oldItemsPath);
          }
        }
      }

      if (cleaned.length > 0) {
        console.log(`Cleanup completed. Removed paths: ${cleaned.join(', ')}`);
      } else {
        console.log('No old paths found to clean up');
      }

      return { success: true, cleaned };
    } catch (error: any) {
      console.error('Old path cleanup failed:', error);
      return { success: false, cleaned: [], error: error.message };
    }
  }

  /**
   * Run all migrations for a family group
   */
  async runAllMigrations(familyGroupId: string): Promise<void> {
    console.log('=== Starting Database Migrations ===');
    console.log(`Family Group ID: ${familyGroupId}`);

    // Migration 1: Convert memberIds to object format
    const memberIdsResult = await this.migrateMemberIds(familyGroupId);
    if (!memberIdsResult.success) {
      console.error('Migration failed at memberIds conversion');
      throw new Error(`memberIds migration failed: ${memberIdsResult.error}`);
    }

    // Migration 2: Clean up old paths
    const cleanupResult = await this.cleanupOldPaths(familyGroupId);
    if (!cleanupResult.success) {
      console.error('Migration failed at old path cleanup');
      throw new Error(`Old path cleanup failed: ${cleanupResult.error}`);
    }

    console.log('=== All Migrations Completed Successfully ===');
  }

  /**
   * Check if any migrations are needed
   */
  async needsMigration(familyGroupId: string): Promise<boolean> {
    try {
      // Check 1: Is memberIds in array format?
      const memberIdsSnapshot = await database().ref(`familyGroups/${familyGroupId}/memberIds`).once('value');
      if (memberIdsSnapshot.exists() && Array.isArray(memberIdsSnapshot.val())) {
        console.log('Migration needed: memberIds is in array format');
        return true;
      }

      // Check 2: Do old paths exist?
      const oldListsSnapshot = await database().ref(`shoppingLists/${familyGroupId}`).once('value');
      if (oldListsSnapshot.exists()) {
        console.log('Migration needed: old shoppingLists path exists');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  }
}

export default new DatabaseMigration();
