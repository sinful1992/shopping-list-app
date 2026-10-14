/**
 * The urgent push (task 49) goes through the existing upsert-urgent-item
 * function, with the item's id as the row id. It is fire-and-forget: a failed
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

it('sends the item as an active urgent row keyed by the item id', async () => {
  notifyItemUrgent(item);
  await flush();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke).toHaveBeenCalledWith('upsert-urgent-item', {
    body: expect.objectContaining({
      idToken: 'id-token', id: 'item-9', name: 'Nappies', family_group_id: 'fam-1',
      created_by: 'user-1', created_by_name: 'Giedrius', status: 'active',
    }),
  });
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
