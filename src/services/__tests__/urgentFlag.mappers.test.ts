/**
 * Urgent is a flag on a list item (task 49). Old items and old app versions
 * never set it, so a missing value must read as false everywhere, and what is
 * written (Watermelon, then Firebase set()) must always be a real boolean:
 * RTDB rejects undefined.
 */
import { mapFirebaseItem } from '../storage/firebaseMappers';
import { applyItemCreate, applyItemFullUpdate, itemModelToType } from '../storage/mappers';
import { schema } from '../../database/schema';
import migrations from '../../database/migrations';
import type { Item } from '../../models/types';

const base = { name: 'Milk', listId: 'list-1', createdBy: 'user-1', checked: false, createdAt: 1, updatedAt: 2 };

/** A stand-in Watermelon record: the mappers only assign fields. */
const record = (): any => ({ _raw: {}, _setRaw: jest.fn() });

const item = (isUrgent: boolean | undefined): Item => ({
  id: 'item-1', listId: 'list-1', name: 'Milk', quantity: null, price: null, checked: false,
  createdBy: 'user-1', createdAt: 1, updatedAt: 2, syncStatus: 'synced',
  ...(isUrgent === undefined ? {} : { isUrgent }),
});

describe('Firebase → item', () => {
  it.each([
    ['missing (old app, old item)', undefined, false],
    ['true', true, true],
    ['false', false, false],
    ['a non-boolean', 'yes', false],
  ])('isUrgent %s reads as %s', (_label, value, expected) => {
    const data: any = { ...base };
    if (value !== undefined) data.isUrgent = value;
    expect(mapFirebaseItem('item-1', 'list-1', data).isUrgent).toBe(expected);
  });
});

describe('item → Watermelon → item', () => {
  it.each([[undefined, false], [true, true], [false, false]])(
    'create with isUrgent %s round-trips as %s', (value, expected) => {
      const r = record();
      applyItemCreate(r, item(value));
      expect(r.isUrgent).toBe(expected);
      expect(itemModelToType(r).isUrgent).toBe(expected);
    });

  it('a full update (remote change) can clear the flag', () => {
    const r = record();
    applyItemCreate(r, item(true));
    applyItemFullUpdate(r, item(false));
    expect(itemModelToType(r).isUrgent).toBe(false);
  });

  it('a full update from an old app (no field) clears it rather than leaving undefined', () => {
    const r = record();
    applyItemCreate(r, item(true));
    applyItemFullUpdate(r, item(undefined));
    expect(r.isUrgent).toBe(false);
  });

  it('a column still null after the migration reads as false', () => {
    const r = record();
    applyItemCreate(r, item(undefined));
    r.isUrgent = null;
    expect(itemModelToType(r).isUrgent).toBe(false);
  });

  it('what is pushed to Firebase holds a boolean, never undefined', () => {
    const r = record();
    applyItemCreate(r, item(undefined));
    const pushed = itemModelToType(r);
    expect(typeof pushed.isUrgent).toBe('boolean');
  });
});

describe('schema and migration', () => {
  it('items has an optional boolean is_urgent column', () => {
    const col = (schema.tables as any).items.columns.is_urgent;
    expect(col).toMatchObject({ name: 'is_urgent', type: 'boolean', isOptional: true });
  });

  it('a phone on the previous schema gets the column added by a migration to the current version', () => {
    const latest = (migrations as any).sortedMigrations.slice(-1)[0];
    expect(latest.toVersion).toBe(schema.version);
    const added = latest.steps
      .filter((s: any) => s.type === 'add_columns' && s.table === 'items')
      .flatMap((s: any) => s.columns.map((c: any) => c.name));
    expect(added).toContain('is_urgent');
  });

  it('every schema version from 1 up has a migration path (no gap a 1.50.0 install falls into)', () => {
    const versions = (migrations as any).sortedMigrations.map((m: any) => m.toVersion);
    expect(versions[versions.length - 1]).toBe(schema.version);
    expect((migrations as any).maxVersion).toBe(schema.version);
  });
});
