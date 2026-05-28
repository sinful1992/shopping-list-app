/**
 * Convert a stored receipt path to a URI the React Native Image component can load.
 *
 * Three forms arrive from the DB:
 *   - Already-schemed URIs  (file://, content://, https://) → pass through unchanged
 *   - Absolute local paths  (/data/…, /storage/…)           → prepend file://
 *   - Relative paths        (receipts/familyId/…)           → Firebase storage paths;
 *     pass through unchanged so Image.onError fires instead of silently
 *     loading the wrong file
 */
export function toFileUri(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  if (path.startsWith('/')) return `file://${path}`;
  return path;
}
