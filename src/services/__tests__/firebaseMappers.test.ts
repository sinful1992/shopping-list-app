import {
  mapFirebaseList,
  mapFirebaseItem,
  mapFirebaseUrgentItem,
  mapFirebaseStoreLayout,
} from '../storage/firebaseMappers';

describe('firebaseMappers', () => {
  describe('mapFirebaseList', () => {
    it('fills every default for an empty payload', () => {
      const list = mapFirebaseList('list-1', {}, 'fg-1');
      expect(list).toMatchObject({
        id: 'list-1',
        name: '',
        familyGroupId: 'fg-1',
        createdBy: '',
        status: 'active',
        completedAt: null,
        completedBy: null,
        receiptUrl: null,
        receiptData: null,
        syncStatus: 'synced',
        isLocked: false,
        lockedBy: null,
        budget: null,
        storeName: null,
        archived: false,
        layoutApplied: false,
        totalAmount: null,
        merchantName: null,
        purchaseDate: null,
        currency: null,
      });
      expect(typeof list.createdAt).toBe('number');
    });

    it('preserves 0 for budget and totalAmount (?? not ||)', () => {
      const list = mapFirebaseList('l', { budget: 0, totalAmount: 0 }, 'fg');
      expect(list.budget).toBe(0);
      expect(list.totalAmount).toBe(0);
    });

    it('keeps explicit false booleans and explicit nulls', () => {
      const list = mapFirebaseList('l', { isLocked: false, archived: null, lockedBy: null }, 'fg');
      expect(list.isLocked).toBe(false);
      expect(list.archived).toBe(false); // null coalesces to default false
      expect(list.lockedBy).toBeNull();
    });

    it('prefers the payload familyGroupId over the fallback', () => {
      expect(mapFirebaseList('l', { familyGroupId: 'own' }, 'fallback').familyGroupId).toBe('own');
    });

    it('handles a legacy record missing newer fields', () => {
      const legacy = mapFirebaseList('l', { name: 'Weekly', createdBy: 'u1', status: 'completed' }, 'fg');
      expect(legacy.name).toBe('Weekly');
      expect(legacy.status).toBe('completed');
      expect(legacy.layoutApplied).toBe(false);
      expect(legacy.currency).toBeNull();
    });

    it('always stamps syncStatus synced', () => {
      expect(mapFirebaseList('l', {}, 'fg').syncStatus).toBe('synced');
    });
  });

  describe('mapFirebaseItem', () => {
    it('fills defaults for an empty payload', () => {
      const item = mapFirebaseItem('i-1', 'list-1', {});
      expect(item).toMatchObject({
        id: 'i-1',
        listId: 'list-1',
        name: '',
        quantity: null,
        price: null,
        checked: false,
        createdBy: '',
        syncStatus: 'synced',
        category: null,
        sortOrder: null,
        unitQty: null,
        measurementUnit: null,
        measurementValue: null,
      });
    });

    it('preserves 0 price and 0 sortOrder', () => {
      const item = mapFirebaseItem('i', 'l', { price: 0, sortOrder: 0, measurementValue: 0 });
      expect(item.price).toBe(0);
      expect(item.sortOrder).toBe(0);
      expect(item.measurementValue).toBe(0);
    });

    it('preserves explicit checked=false and true', () => {
      expect(mapFirebaseItem('i', 'l', { checked: false }).checked).toBe(false);
      expect(mapFirebaseItem('i', 'l', { checked: true }).checked).toBe(true);
    });

    it('uses provided timestamps instead of Date.now()', () => {
      const item = mapFirebaseItem('i', 'l', { createdAt: 111, updatedAt: 222 });
      expect(item.createdAt).toBe(111);
      expect(item.updatedAt).toBe(222);
    });
  });

  describe('mapFirebaseUrgentItem', () => {
    it('fills defaults for an empty payload', () => {
      const urgent = mapFirebaseUrgentItem('u-1', {}, 'fg-1');
      expect(urgent).toMatchObject({
        id: 'u-1',
        name: '',
        familyGroupId: 'fg-1',
        createdBy: '',
        createdByName: '',
        resolvedBy: null,
        resolvedByName: null,
        resolvedAt: null,
        price: null,
        status: 'active',
        syncStatus: 'synced',
      });
    });

    it('preserves 0 price and resolved fields', () => {
      const urgent = mapFirebaseUrgentItem('u', { price: 0, resolvedAt: 123, resolvedBy: 'x' }, 'fg');
      expect(urgent.price).toBe(0);
      expect(urgent.resolvedAt).toBe(123);
      expect(urgent.resolvedBy).toBe('x');
    });
  });

  describe('mapFirebaseStoreLayout', () => {
    it('fills defaults for an empty payload', () => {
      const layout = mapFirebaseStoreLayout('s-1', {}, 'fg-1');
      expect(layout.id).toBe('s-1');
      expect(layout.familyGroupId).toBe('fg-1');
      expect(layout.storeName).toBe('');
      expect(layout.categoryOrder).toEqual([]);
      expect(layout.syncStatus).toBe('synced');
    });

    it('passes categoryOrder through untouched', () => {
      const order = ['produce', 'dairy'] as any;
      expect(mapFirebaseStoreLayout('s', { categoryOrder: order }, 'fg').categoryOrder).toBe(order);
    });
  });
});
