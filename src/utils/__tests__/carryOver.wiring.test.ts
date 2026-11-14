/**
 * ListDetailScreen has no render test, so a revert of its Partial Shop
 * carry-over to an inline map (dropping urgent) would pass every other test.
 * Both carry-over paths must hand their items to addItemsBatch through
 * carryOverFields, the one place that keeps isUrgent.
 */
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

function batchCalls(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf('ItemManager.addItemsBatch(');
  while (at !== -1) {
    let depth = 0;
    let i = src.indexOf('(', at);
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) break;
    }
    out.push(src.slice(start, i + 1));
    at = src.indexOf('ItemManager.addItemsBatch(', i);
  }
  return out;
}

describe('Partial Shop carry-over goes through carryOverFields', () => {
  test('list screen: its only batch add is uncheckedItems.map(carryOverFields)', () => {
    const calls = batchCalls(read('screens/lists/ListDetailScreen.tsx'));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/uncheckedItems\.map\(carryOverFields\)/);
  });

  test('receipt screen: the carry-over batch add is unchecked.map(carryOverFields)', () => {
    const calls = batchCalls(read('screens/receipts/ReceiptMatchScreen.tsx'));
    const carry = calls.filter(c => /\bunchecked\b/.test(c));
    expect(carry).toHaveLength(1);
    expect(carry[0]).toMatch(/unchecked\.map\(carryOverFields\)/);
  });
});
