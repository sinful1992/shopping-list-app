/**
 * The urgent push (task 49) goes through the existing upsert-urgent-item
 * function. Each marking is a new row with a fresh id: the push trigger fires
 * on INSERT only, so a re-used id would make a re-mark silent (ada 1.51.2).
 * It is fire-and-forget: a failed
 * or impossible send is reported, never thrown into the add or edit.
 */
const mockInvoke = jest.fn();
const mockCurrentUser = { current: { uid: 'user-1' } as { uid: string } | null };
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({ get currentUser() { return mockCurrentUser.current; } }),
  getIdToken: jest.fn(async () => 'id-token'),
}));
jest.mock('../SupabaseClient', () => ({ __esModule: true, default: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } } }));
jest.mock('../AuthenticationModule', () => ({
  __esModule: true,
  default: { getCurrentUser: jest.fn(async () => ({ familyGroupId: 'fam-1', displayName: 'Giedrius' })) },
}));
const mockRecordError = jest.fn();
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: (...a: unknown[]) => mockRecordError(...a) } }));

import { notifyItemUrgent } from '../UrgentNotifier';
import AuthenticationModule from '../AuthenticationModule';

const item = { id: 'item-9', listId: 'list-1', name: 'Nappies', isUrgent: true } as any;
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser.current = { uid: 'user-1' };
  mockInvoke.mockResolvedValue({ error: null });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it('sends the item as a new active urgent row', async () => {
  notifyItemUrgent(item);
  await flush();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke).toHaveBeenCalledWith('upsert-urgent-item', {
    body: expect.objectContaining({
      idToken: 'id-token', id: expect.stringMatching(UUID), name: 'Nappies', family_group_id: 'fam-1',
      created_by: 'user-1', created_by_name: 'Giedrius', status: 'active',
    }),
  });
});

it('marking the same item twice sends two different row ids, so both push', async () => {
  notifyItemUrgent(item);
  notifyItemUrgent(item);
  await flush();
  const ids = mockInvoke.mock.calls.map(c => c[1].body.id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
  expect(ids[0]).not.toBe('item-9');
});

it('a function error is reported, not thrown', async () => {
  mockInvoke.mockResolvedValue({ error: new Error('rate limited') });
  expect(() => notifyItemUrgent(item)).not.toThrow();
  await flush();
  expect(mockRecordError).toHaveBeenCalledTimes(1);
});

it('a network failure is reported, not thrown', async () => {
  mockInvoke.mockRejectedValue(new Error('offline'));
  expect(() => notifyItemUrgent(item)).not.toThrow();
  await flush();
  expect(mockRecordError).toHaveBeenCalledTimes(1);
});

it('signed out or no family: nothing is sent', async () => {
  mockCurrentUser.current = null;
  notifyItemUrgent(item);
  await flush();
  (AuthenticationModule.getCurrentUser as jest.Mock).mockResolvedValueOnce({ familyGroupId: null });
  mockCurrentUser.current = { uid: 'user-1' };
  notifyItemUrgent(item);
  await flush();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockRecordError).not.toHaveBeenCalled();
});
