/**
 * The proxy rebuilds the multipart body it sends to the Space. Before the
 * hints part existed it forwarded only the image, so the list never reached
 * the reader; and it must never forward the caller's Firebase ID token.
 */
import { buildUpstreamForm, MAX_HINTS_BYTES } from './upstreamForm';

function names(form: FormData): string[] {
  const anyForm = form as any;
  if (typeof anyForm.getParts === 'function') {
    return anyForm.getParts().map((p: any) => p.fieldName);
  }
  if (Array.isArray(anyForm._parts)) return anyForm._parts.map(([k]: [string]) => k);
  return Array.from((form as any).keys());
}

function value(form: FormData, name: string): unknown {
  const anyForm = form as any;
  if (typeof anyForm.get === 'function') return anyForm.get(name);
  return anyForm._parts.find(([k]: [string]) => k === name)?.[1];
}

const receipt = new File([new Uint8Array([1, 2, 3])], 'receipt.jpg', { type: 'image/jpeg' });
const hints = JSON.stringify({ store: 'Tesco', items: [{ name: 'eggs', lastPrice: 3.3 }] });

describe('buildUpstreamForm', () => {
  it('forwards the hints part unchanged', () => {
    const form = buildUpstreamForm(receipt, hints);
    expect(names(form)).toEqual(['file', 'hints']);
    expect(value(form, 'hints')).toBe(hints);
  });

  it('forwards only the file when there are no hints', () => {
    expect(names(buildUpstreamForm(receipt, null))).toEqual(['file']);
    expect(names(buildUpstreamForm(receipt, ''))).toEqual(['file']);
  });

  it('drops a hints part that is not text', () => {
    expect(names(buildUpstreamForm(receipt, receipt))).toEqual(['file']);
  });

  it('drops oversized hints rather than failing the scan', () => {
    expect(names(buildUpstreamForm(receipt, 'x'.repeat(MAX_HINTS_BYTES + 1)))).toEqual(['file']);
  });
});
