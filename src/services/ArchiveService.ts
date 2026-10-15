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

  /**
   * Get all archived lists
   */
  async getArchivedLists(familyGroupId: string): Promise<ShoppingList[]> {
    try {
      // TODO: replace with a dedicated archived=true DB query when an archived-list UI screen exists
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId, undefined, undefined, 200);

      return completedLists
        .filter(list => list.archived === true)
        .sort((a, b) => {
          const dateA = a.completedAt || 0;
          const dateB = b.completedAt || 0;
          return dateB - dateA;
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
      // TODO: replace with a dedicated archived=false DB query when non-archived list pagination is needed
      const completedLists = await LocalStorageManager.getCompletedLists(familyGroupId, undefined, undefined, 200);

      return completedLists
        .filter(list => !list.archived)
        .sort((a, b) => {
          const dateA = a.completedAt || 0;
          const dateB = b.completedAt || 0;
          return dateB - dateA;
        });
    } catch {
      return [];
    }
  }
}

export default ArchiveService.getInstance();
