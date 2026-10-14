/**
 * Home (urgent count on active lists) and the open list share one Firebase
 * items listener per list (ada 1.51.3), so it is reference-counted: each
 * holder's unsubscribe releases only its own hold, the listener stops with the
 * last one, and a hold left over from before stopAllListeners never tears down
 * the listener opened after it.
 */
const mockOpened: Array<{ path: string; stopped: number }> = [];

jest.mock('@react-native-firebase/database', () => {
  const listen = (q: { listId: string }) => {
    const entry = { path: q.listId, stopped: 0 };
    mockOpened.push(entry);
    return () => { entry.stopped++; };
  };
  return {
    getDatabase: jest.fn(() => ({})),
    ref: jest.fn(() => ({})),
    child: jest.fn(() => ({})),
    query: jest.fn((_r: unknown, _o: unknown, eq: { listId: string }) => eq),
    orderByChild: jest.fn(),
    equalTo: jest.fn((listId: string) => ({ listId })),
    startAt: jest.fn(),
    get: jest.fn(() => Promise.resolve({ forEach: () => false })),
    // One entry per Firebase listener: only child_added is counted, the
    // other two are opened and closed with it.
    onChildAdded: jest.fn((q: { listId: string }) => listen(q)),
    onChildChanged: jest.fn(() => () => {}),
    onChildRemoved: jest.fn(() => () => {}),
  };
});
jest.mock('../LocalStorageManager', () => ({
  __esModule: true,
  default: { saveItemsBatchUpsert: jest.fn(() => Promise.resolve()), getItemsForList: jest.fn(() => Promise.resolve([])) },
}));
jest.mock('../CrashReporting', () => ({ __esModule: true, default: { recordError: jest.fn(), log: jest.fn() } }));

import FirebaseSyncListener from '../FirebaseSyncListener';

const opened = (listId: string) => mockOpened.filter(o => o.path === listId);
const live = (listId: string) => opened(listId).filter(o => o.stopped === 0).length;

beforeEach(() => {
  FirebaseSyncListener.stopAllListeners();
  mockOpened.length = 0;
});

describe('items listener reference counting', () => {
  it('two holders share one Firebase listener', () => {
    FirebaseSyncListener.startListeningToItems('g', 'list-a');
    FirebaseSyncListener.startListeningToItems('g', 'list-a');
    expect(opened('list-a')).toHaveLength(1);
  });

  it('releasing one of two keeps it live; releasing both stops it once', () => {
    const home = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    const detail = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    detail();
    expect(live('list-a')).toBe(1);
    home();
    expect(live('list-a')).toBe(0);
    expect(opened('list-a')[0].stopped).toBe(1);
  });

  it('releasing the same hold twice counts once', () => {
    const home = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    const detail = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    detail();
    detail();
    expect(live('list-a')).toBe(1);
    home();
    expect(live('list-a')).toBe(0);
  });

  it('after the last release a new holder opens a fresh listener', () => {
    FirebaseSyncListener.startListeningToItems('g', 'list-a')();
    FirebaseSyncListener.startListeningToItems('g', 'list-a');
    expect(opened('list-a')).toHaveLength(2);
    expect(live('list-a')).toBe(1);
  });

  it('a stale hold from before stopAllListeners does not stop the new listener', () => {
    const stale = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    FirebaseSyncListener.stopAllListeners();
    expect(live('list-a')).toBe(0);
    const fresh = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    stale();
    expect(live('list-a')).toBe(1);
    fresh();
    expect(live('list-a')).toBe(0);
  });

  it('a holder that opens after stopAll starts its own count at one', () => {
    FirebaseSyncListener.startListeningToItems('g', 'list-a');
    FirebaseSyncListener.startListeningToItems('g', 'list-a');
    FirebaseSyncListener.stopAllListeners();
    const only = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    only();
    expect(live('list-a')).toBe(0);
  });

  it('lists are counted separately', () => {
    const a = FirebaseSyncListener.startListeningToItems('g', 'list-a');
    FirebaseSyncListener.startListeningToItems('g', 'list-b');
    a();
    expect(live('list-a')).toBe(0);
    expect(live('list-b')).toBe(1);
  });
});
