/**
 * Regression test for the "Confidence 100%" wrong-parse bug.
 *
 * A skewed Tesco photo shifted the price column a row up, so the parser
 * assigned the wrong total (3.30 instead of 2.95) — yet every field was
 * present, so field-presence scoring showed 100% confidence on a parse whose
 * arithmetic was broken. Confidence must mirror the server's
 * is_complete_parse gate: line items net of discounts must sum to the total,
 * otherwise the score is capped below the "please verify" threshold.
 */
jest.mock('../LocalStorageManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ShoppingListManager', () => ({ __esModule: true, default: {} }));
jest.mock('../ImageStorageManager', () => ({ __esModule: true, default: {} }));

import ReceiptOCRService from '../ReceiptOCRService';

function serverResponse(overrides: Record<string, unknown> = {}) {
  return {
    merchant_name: 'TESCO',
    store_location: 'HYTHE',
    date: '2026-07-16',
    line_items: [
      { description: 'MILK', quantity: 1, unit_price: '1.20', total_price: '1.20', discount: null },
      { description: 'BREAD', quantity: 1, unit_price: '1.75', total_price: '1.75', discount: null },
    ],
    subtotal: '2.95',
    savings: null,
    total: '2.95',
    anomalies: [],
    ...overrides,
  };
}

function mockFetchJson(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('ReceiptOCRService confidence — arithmetic consistency gate', () => {
  it('scores 100 when items sum to the printed total', async () => {
    mockFetchJson(serverResponse());

    const result = await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    expect(result.success).toBe(true);
    expect(result.confidence).toBe(100);
    expect(result.error).toBeNull();
  });

  it('caps confidence at 50 when the total does not match the items sum (skewed-photo regression)', async () => {
    mockFetchJson(serverResponse({ total: '3.30' }));

    const result = await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    expect(result.confidence).toBe(50);
    expect(result.error).toBe('Low confidence result — please verify');
  });

  it('nets item discounts before comparing to the total', async () => {
    mockFetchJson(
      serverResponse({
        line_items: [
          { description: 'MILK', quantity: 1, unit_price: '1.20', total_price: '1.20', discount: null },
          { description: 'BREAD', quantity: 1, unit_price: '1.75', total_price: '1.75', discount: '-0.35' },
        ],
        subtotal: '2.95',
        total: '2.60',
      }),
    );

    const result = await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    expect(result.confidence).toBe(100);
  });

  it('caps confidence when an item price is unparseable (sum unverifiable)', async () => {
    mockFetchJson(
      serverResponse({
        line_items: [
          { description: 'MILK', quantity: 1, unit_price: '1.20', total_price: '1.20', discount: null },
          { description: 'BREAD', quantity: 1, unit_price: '', total_price: '', discount: null, needs_review: true },
        ],
      }),
    );

    const result = await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    expect(result.confidence).toBeLessThanOrEqual(50);
  });

  it('does not apply the cap when no total was extracted (already penalised by field scoring)', async () => {
    mockFetchJson(serverResponse({ total: null, subtotal: null }));

    const result = await ReceiptOCRService.extractReceipt('/tmp/receipt.jpg');

    // items 50 + merchant 15 + date 10 — missing total already costs its 20.
    expect(result.confidence).toBe(75);
  });
});
