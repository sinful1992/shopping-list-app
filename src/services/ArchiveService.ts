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

      const PAGE = 100;
      let offset = 0;
      let archivedCount = 0;

      while (true) {
        const page = await LocalStorageManager.getCompletedLists(familyGroupId, undefined, undefined, PAGE, offset);
        const toArchive = page.filter(list => {
          const completedAt = list.completedAt || 0;
          return completedAt < thresholdDate && !list.archived;
        });
        for (const list of toArchive) {
          await ShoppingListManager.updateList(list.id, { archived: true });
          archivedCount++;
        }
        if (page.length < PAGE) break;
        offset += PAGE;
      }

      return archivedCount;
    } catch {
      return 0;
    }
  }

  /** Every archived completed list, newest completion first. */
  async getArchivedLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      return await LocalStorageManager.getCompletedListsByArchived(familyGroupId, true);
    } catch {
      return [];
    }
  }

  /** Every completed list that is not archived, newest completion first. */
  async getNonArchivedLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      return await LocalStorageManager.getCompletedListsByArchived(familyGroupId, false);
    } catch {
      return [];
    }
  }
}

export default ArchiveService.getInstance();
