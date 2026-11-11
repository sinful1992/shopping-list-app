/**
 * UsageTracker (was 0 % covered, Fable audit task 137).
 *
 * Bug found while covering it: creating a list waited on a Firebase
 * transaction for the usage counter, and on a server read of the family tier.
 * Offline a transaction never completes, so Partial Shop's new list (and the
 * receipt screen's carry-over list) was saved but its items never copied, with
 * the spinner left on. The tier read also downloaded the whole family group.
 */
function never(): Promise<never> { return new Promise<never>(() => {}); }
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockTransaction = jest.fn();
const mockRef = jest.fn((_db: unknown, path: string) => ({ path }));
const mockClaims = jest.fn();
let mockCurrentUser: { uid: string } | null = { uid: 'u1' };
// jest.config maps every @react-native-firebase/* package to one mock file,
// so both packages get one factory (a second jest.mock would replace the first).
function mockFirebase() { return ({
  getDatabase: () => ({}),
  ref: (db: unknown, path: string) => mockRef(db, path),
  get: (...a: unknown[]) => mockGet(...a),
  set: (...a: unknown[]) => mockSet(...a),
  runTransaction: (...a: unknown[]) => mockTransaction(...a),
  getAuth: () => ({ get currentUser() { return mockCurrentUser; } }),
  getIdTokenResult: (...a: unknown[]) => mockClaims(...a),
}); }
jest.mock('@react-native-firebase/database', () => mockFirebase());
jest.mock('@react-native-firebase/auth', () => mockFirebase());
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a) } }));

import UsageTracker from '../UsageTracker';
import { SUBSCRIPTION_LIMITS } from '../../models/SubscriptionConfig';

const NOV = Date.UTC(2026, 10, 11, 12);
const OCT = Date.UTC(2026, 9, 20, 12);
const user = (over: Record<string, unknown> = {}) => ({
  uid: 'u1', familyGroupId: 'fam',
  usageCounters: { listsCreated: 3, ocrProcessed: 2, urgentItemsCreated: 1, lastResetDate: NOV - 1000 },
  ...over,
}) as any;
const tick = () => new Promise(r => setTimeout(r, 0));
const savedLimits = JSON.parse(JSON.stringify(SUBSCRIPTION_LIMITS));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOV);
  mockCurrentUser = { uid: 'u1' };
  mockGet.mockResolvedValue({ val: () => 'premium' });
  mockSet.mockResolvedValue(undefined);
  mockTransaction.mockResolvedValue(undefined);
  mockClaims.mockResolvedValue({ claims: {} });
  Object.assign(SUBSCRIPTION_LIMITS, JSON.parse(JSON.stringify(savedLimits)));
});
afterEach(() => jest.restoreAllMocks());

const withCap = (max: number) => { (SUBSCRIPTION_LIMITS as any).free = { ...SUBSCRIPTION_LIMITS.free, maxLists: max }; };

describe('canCreateList', () => {
  it('no tier has a cap (today): allowed at once, with no server read at all (same month: no write either)', async () => {
    expect(await UsageTracker.canCreateList(user())).toEqual({ allowed: true });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockClaims).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a new month: creating a list still resets the counters, without waiting on the write (Fable review)', async () => {
    mockSet.mockImplementation(never);
    const r = await UsageTracker.canCreateList(user({ usageCounters: { ...user().usageCounters, lastResetDate: OCT } }));
    expect(r).toEqual({ allowed: true });
    expect(mockSet).toHaveBeenCalledWith({ path: '/users/u1/usageCounters' }, { listsCreated: 0, ocrProcessed: 0, urgentItemsCreated: 0, lastResetDate: NOV });
  });

  it('offline (every server call hangs): still answers', async () => {
    mockGet.mockImplementation(never);
    mockSet.mockImplementation(never);
    mockClaims.mockImplementation(never);
    await expect(UsageTracker.canCreateList(user())).resolves.toEqual({ allowed: true });
  });

  it('with a cap: under it allowed, at it refused with the reason; an admin always allowed', async () => {
    withCap(3);
    mockGet.mockResolvedValue({ val: () => 'free' });
    expect((await UsageTracker.canCreateList(user({ usageCounters: { ...user().usageCounters, listsCreated: 2 } }))).allowed).toBe(true);
    const refused = await UsageTracker.canCreateList(user());
    expect(refused).toEqual({ allowed: false, reason: expect.stringContaining('limit of 3 lists') });
    mockClaims.mockResolvedValue({ claims: { admin: true } });
    expect((await UsageTracker.canCreateList(user())).allowed).toBe(true);
  });

  it('with a cap, a failing claims read counts as not admin', async () => {
    withCap(1);
    mockGet.mockResolvedValue({ val: () => 'free' });
    mockClaims.mockRejectedValue(new Error('x'));
    expect((await UsageTracker.canCreateList(user())).allowed).toBe(false);
    mockCurrentUser = null;
    expect((await UsageTracker.canCreateList(user())).allowed).toBe(false);
  });
});

describe('getFamilySubscriptionTier', () => {
  it('reads only the tier field, not the whole family group', async () => {
    expect(await UsageTracker.getFamilySubscriptionTier('fam')).toBe('premium');
    expect(mockRef).toHaveBeenCalledWith(expect.anything(), '/familyGroups/fam/subscriptionTier');
  });

  it.each([
    ['no family', null, undefined, 'free'],
    ['no tier set', 'fam', null, 'free'],
    ['an unknown tier', 'fam', 'gold', 'free'],
    ['family tier', 'fam', 'family', 'family'],
  ])('%s -> %s', async (_l, fam, val, want) => {
    mockGet.mockResolvedValue({ val: () => val });
    expect(await UsageTracker.getFamilySubscriptionTier(fam as any)).toBe(want);
  });

  it('a failing read is free', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    expect(await UsageTracker.getFamilySubscriptionTier('fam')).toBe('free');
  });
});

describe('checkAndResetIfNeeded', () => {
  it('same month: counters as they are, no write', async () => {
    expect(await UsageTracker.checkAndResetIfNeeded(user())).toEqual(user().usageCounters);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('a new month (or a new year): zeroed, written, and not waited on', async () => {
    mockSet.mockImplementation(never);
    const r = await UsageTracker.checkAndResetIfNeeded(user({ usageCounters: { ...user().usageCounters, lastResetDate: OCT } }));
    expect(r).toEqual({ listsCreated: 0, ocrProcessed: 0, urgentItemsCreated: 0, lastResetDate: NOV });
    expect(mockRef).toHaveBeenCalledWith(expect.anything(), '/users/u1/usageCounters');
    const lastYear = await UsageTracker.checkAndResetIfNeeded(user({ usageCounters: { ...user().usageCounters, lastResetDate: Date.UTC(2025, 10, 11) } }));
    expect(lastYear.listsCreated).toBe(0);
  });

  it('a failing reset write is reported, not thrown', async () => {
    mockSet.mockRejectedValue(new Error('denied'));
    await UsageTracker.checkAndResetIfNeeded(user({ usageCounters: { ...user().usageCounters, lastResetDate: OCT } }));
    await tick();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'UsageTracker monthly reset');
  });

  it('a user with no counters saved yet gets fresh ones instead of a crash', async () => {
    const r = await UsageTracker.checkAndResetIfNeeded(user({ usageCounters: undefined }));
    expect(r.listsCreated).toBe(0);
  });
});

describe('incrementListCounter', () => {
  it('returns at once even when the transaction never completes (offline)', () => {
    mockTransaction.mockImplementation(never);
    expect(UsageTracker.incrementListCounter('u1')).toBeUndefined();
    const update = mockTransaction.mock.calls[0][1];
    expect(update(null)).toBe(1);
    expect(update(4)).toBe(5);
  });

  it('a failing transaction is reported', async () => {
    mockTransaction.mockRejectedValue(new Error('denied'));
    UsageTracker.incrementListCounter('u1');
    await tick();
    expect(mockRecordError).toHaveBeenCalledWith(expect.any(Error), 'UsageTracker incrementListCounter');
  });
});

describe('getUsageSummary', () => {
  it('used counts and the tier limits', async () => {
    expect(await UsageTracker.getUsageSummary(user())).toEqual({ lists: { used: 3, limit: null }, ocr: { used: 2, limit: null } });
  });

  it('an unknown tier uses the free limits instead of crashing', async () => {
    mockGet.mockResolvedValue({ val: () => 'gold' });
    await expect(UsageTracker.getUsageSummary(user())).resolves.toEqual(expect.objectContaining({ lists: { used: 3, limit: null } }));
  });
});
