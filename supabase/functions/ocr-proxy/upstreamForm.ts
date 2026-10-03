/**
 * The hints part is the shopping list as JSON. The Space reads at most 200
 * items of it but has no size cap of its own, so this is the only one.
 */
export const MAX_HINTS_BYTES = 64 * 1024

/**
 * The multipart body sent on to the Space: the receipt image, plus the
 * optional `hints` part when the app sent one. Nothing else is forwarded —
 * least of all `idToken`, which is for this function alone.
 */
export function buildUpstreamForm(file: File, hints: unknown): FormData {
  const form = new FormData()
  form.append('file', file, file.name || 'receipt.jpg')
  if (
    typeof hints === 'string' && hints.length > 0 &&
    new TextEncoder().encode(hints).length <= MAX_HINTS_BYTES
  ) {
    form.append('hints', hints)
  }
  return form
}
