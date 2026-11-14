// SH-3 (audit 137, task 142): a list that did not change must not look changed when the sync listener
// compares the local copy with the same list from Firebase. Before, `archived` was null locally and false
// from Firebase (and an empty storeName "" from Firebase was null locally), so every list was rewritten
// in the local DB on every listener start.
import { applyListCreate, hasListChanged, listModelToType } from '../../src/services/storage/mappers';
import { mapFirebaseList } from '../../src/services/storage/firebaseMappers';

// What the local DB gives back for a list saved with applyListCreate: a WatermelonDB-like record
// (fields are plain properties, created_at lives in _raw).
function roundTrip(list: ReturnType<typeof mapFirebaseList>) {
  const record: any = { _raw: {}, _setRaw(k: string, v: unknown) { this._raw[k] = v; } };
  Object.defineProperty(record, 'createdAt', { get() { return this._raw.created_at; } });
  Object.defineProperty(record, 'id', { get() { return this._raw.id; } });
  applyListCreate(record, list);
  return listModelToType(record);
}

const base = { name: 'Weekly shop', familyGroupId: 'fam1', createdBy: 'u1', createdAt: 1_790_000_000_000, status: 'active' as const };

describe('SH-3 hasListChanged after a local round trip', () => {
  const cases: Record<string, Record<string, unknown>> = {
    'no optional fields at all': {},
    'archived false': { archived: false },
    'archived true': { archived: true },
    'empty store name': { storeName: '' },
    'store name': { storeName: 'Tesco' },
    'locked list': { isLocked: true, lockedBy: 'u2', lockedByName: 'Ann', lockedByRole: 'Mom', lockedAt: 1_790_000_000_500 },
    'budget and receipt fields': { budget: 50, totalAmount: 12.5, merchantName: 'Lidl', purchaseDate: 1_790_000_000_900, currency: 'GBP' },
    'completed': { status: 'completed', completedAt: 1_790_000_001_000, completedBy: 'u1' },
    'layout applied': { layoutApplied: true },
  };
  for (const [name, extra] of Object.entries(cases)) {
    test(`unchanged: ${name}`, () => {
      const incoming = mapFirebaseList('l1', { ...base, ...extra } as any, 'fam1');
      expect(hasListChanged(roundTrip(incoming), incoming)).toBe(false);
    });
  }

  test('real changes are still seen', () => {
    const local = roundTrip(mapFirebaseList('l1', { ...base } as any, 'fam1'));
    for (const extra of [{ archived: true }, { storeName: 'Tesco' }, { name: 'Other' }, { budget: 10 }, { isLocked: true }]) {
      expect(hasListChanged(local, mapFirebaseList('l1', { ...base, ...extra } as any, 'fam1'))).toBe(true);
    }
    const archived = roundTrip(mapFirebaseList('l1', { ...base, archived: true } as any, 'fam1'));
    expect(hasListChanged(archived, mapFirebaseList('l1', { ...base, archived: false } as any, 'fam1'))).toBe(true);
    const shop = roundTrip(mapFirebaseList('l1', { ...base, storeName: 'Tesco' } as any, 'fam1'));
    expect(hasListChanged(shop, mapFirebaseList('l1', { ...base, storeName: '' } as any, 'fam1'))).toBe(true);
  });
});
