/**
 * Guards against regressions in the categoryHistory Firebase write/read path.
 *
 * Key invariant: category is the Firebase node key — it must never be written
 * as a field inside the data payload, and reads must use the node key, not data.category.
 */

const mockRunTransaction = jest.fn();
const mockRef = jest.fn().mockReturnValue({});
const mockGetDatabase = jest.fn().mockReturnValue({});

jest.mock('@react-native-firebase/database', () => ({
  getDatabase: () => mockGetDatabase(),
  ref: (...args: any[]) => mockRef(...args),
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
}));
jest.mock('../LocalStorageManager', () => ({
  default: {
    getCategoryHistoryForItem: jest.fn().mockResolvedValue([]),
    saveCategoryHistory: jest.fn().mockResolvedValue(undefined),
    updateCategoryHistory: jest.fn().mockResolvedValue(undefined),
  },
}));

import CategoryHistoryService from '../CategoryHistoryService';

describe('CategoryHistoryService — Firebase write path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunTransaction.mockImplementation(async (_ref: any, cb: any) => cb(null));
  });

  it('does not write category field in transaction data for a new entry', async () => {
    let writtenData: any;
    mockRunTransaction.mockImplementation(async (_ref: any, cb: any) => {
      writtenData = cb(null);
    });

    await (CategoryHistoryService as any).syncCategoryToFirebase('group1', 'banana', 'Produce');

    expect(writtenData).toBeDefined();
    expect(writtenData).not.toHaveProperty('category');
    expect(writtenData).toHaveProperty('usageCount', 1);
    expect(writtenData).toHaveProperty('createdAt');
    expect(writtenData).toHaveProperty('lastUsedAt');
  });

  it('does not write category field when incrementing an existing entry', async () => {
    let writtenData: any;
    mockRunTransaction.mockImplementation(async (_ref: any, cb: any) => {
      writtenData = cb({ usageCount: 3, lastUsedAt: 1000, createdAt: 500 });
    });

    await (CategoryHistoryService as any).syncCategoryToFirebase('group1', 'apples', 'Produce');

    expect(writtenData).not.toHaveProperty('category');
    expect(writtenData.usageCount).toBe(4);
  });

  it('writes to the correct Firebase path using the category as the key', async () => {
    await (CategoryHistoryService as any).syncCategoryToFirebase('group1', 'banana', 'Produce');

    expect(mockRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('/Produce')
    );
  });
});
