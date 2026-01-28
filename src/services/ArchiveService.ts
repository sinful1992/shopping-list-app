import LocalStorageManager from './LocalStorageManager';
import ShoppingListManager from './ShoppingListManager';
import { ShoppingList } from '../models/types';

/**
 * ArchiveService
 * Handles automatic archiving and permanent deletion of old lists
 * Implements Sprint 7: Archive functionality
 */
class ArchiveService {
  private static instance: ArchiveService;
  private readonly ARCHIVE_THRESHOLD_DAYS = 90;

  private constructor() {}

  static getInstance(): ArchiveService {
    if (!ArchiveService.instance) {
      ArchiveService.instance = new ArchiveService();
    }
    return ArchiveService.instance;
  }

  /**
   * Auto-archive completed lists older than 90 days
   * Should be called on app startup or periodically
   */
  async autoArchiveOldLists(familyGroupId: string): Promise<number> {
    try {
      const now = Date.now();
      const thresholdDate = now - (this.ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

      // Get all completed lists
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      // Find lists older than threshold and not yet archived
      const listsToArchive = completedLists.filter(list => {
        const completedAt = list.completedAt || 0;
        return completedAt < thresholdDate && !list.archived;
      });

      // Archive each list
      for (const list of listsToArchive) {
        await ShoppingListManager.updateList(list.id, { archived: true });
      }

      return listsToArchive.length;
    } catch {
      return 0;
    }
  }

  /**
   * Get all archived lists
   */
  async getArchivedLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      return completedLists
        .filter(list => list.archived === true)
        .sort((a, b) => {
          const dateA = a.completedAt || 0;
          const dateB = b.completedAt || 0;
          return dateB - dateA; // Most recent first
        });
    } catch {
      return [];
    }
  }

  /**
   * Get all non-archived completed lists
   */
  async getNonArchivedLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId);

      return completedLists
        .filter(list => !list.archived)
        .sort((a, b) => {
          const dateA = a.completedAt || 0;
          const dateB = b.completedAt || 0;
          return dateB - dateA; // Most recent first
        });
    } catch {
      return [];
    }
  }

  /**
   * Manually archive a list
   */
  async archiveList(listId: string): Promise<void> {
    try {
      await ShoppingListManager.updateList(listId, { archived: true });
    } catch (error: any) {
      throw new Error(`Failed to archive list: ${error.message}`);
    }
  }

  /**
   * Permanently delete a list (no undo)
   * Should only be used with double confirmation
   */
  async permanentlyDeleteList(listId: string): Promise<void> {
    try {
      await ShoppingListManager.deleteList(listId);
    } catch (error: any) {
      throw new Error(`Failed to permanently delete list: ${error.message}`);
    }
  }

  /**
   * Check if a list should be auto-archived
   */
  shouldAutoArchive(list: ShoppingList): boolean {
    if (list.status !== 'completed' || list.archived) {
      return false;
    }

    const now = Date.now();
    const thresholdDate = now - (this.ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const completedAt = list.completedAt || 0;

    return completedAt < thresholdDate;
  }

  /**
   * Get days until a list will be auto-archived
   * Returns null if already archived or not completed
   */
  getDaysUntilArchive(list: ShoppingList): number | null {
    if (list.status !== 'completed' || list.archived) {
      return null;
    }

    const now = Date.now();
    const completedAt = list.completedAt || 0;
    const archiveDate = completedAt + (this.ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((archiveDate - now) / (24 * 60 * 60 * 1000));

    return daysRemaining > 0 ? daysRemaining : 0;
  }
}

export default ArchiveService.getInstance();
