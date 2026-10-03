/**
 * Receipt aliases remember what receipt text the family confirmed an item
 * as. Runs against real WatermelonDB on the in-memory LokiJS adapter.
 */

import LocalStorageManager from '../LocalStorageManager';

describe('receipt aliases', () => {
  it('saves, replaces and forgets per family group', async () => {
    await LocalStorageManager.saveReceiptAliases('alias-g1', [
      { receiptKey: 'semi skm mlk', itemName: 'Milk' },
      { receiptKey: 'wht bread 800g', itemName: 'Bread' },
    ]);
    await LocalStorageManager.saveReceiptAliases('alias-g2', [{ receiptKey: 'semi skm mlk', itemName: 'Oat milk' }]);

    let g1 = await LocalStorageManager.getReceiptAliases('alias-g1');
    expect(g1.get('semi skm mlk')).toBe('Milk');
    expect(g1.get('wht bread 800g')).toBe('Bread');
    expect((await LocalStorageManager.getReceiptAliases('alias-g2')).get('semi skm mlk')).toBe('Oat milk');

    await LocalStorageManager.saveReceiptAliases(
      'alias-g1',
      [{ receiptKey: 'semi skm mlk', itemName: 'Semi-skimmed milk' }],
      ['wht bread 800g'],
    );
    g1 = await LocalStorageManager.getReceiptAliases('alias-g1');
    expect(g1.get('semi skm mlk')).toBe('Semi-skimmed milk');
    expect(g1.has('wht bread 800g')).toBe(false);
    expect(g1.size).toBe(1);
  });

  it('a key both learned and forgotten in one save is kept', async () => {
    await LocalStorageManager.saveReceiptAliases('alias-g3', [{ receiptKey: 'eggs', itemName: 'Eggs' }], ['eggs']);
    expect((await LocalStorageManager.getReceiptAliases('alias-g3')).get('eggs')).toBe('Eggs');
  });
});
