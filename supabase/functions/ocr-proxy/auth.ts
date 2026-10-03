/**
 * Pure helpers for the proxy's token check, kept out of index.ts so they run
 * under jest (index.ts imports Deno's std server and cannot).
 */

/** At most one signing-key fetch per this window when a kid is unknown. */
export const KEY_REFETCH_MIN_GAP_MS = 60_000

/**
 * Whether to fetch Google's signing keys before checking a token.
 *
 * An expired cache always refetches. A kid the cache doesn't know refetches
 * too — Google rotates keys — but at most once per KEY_REFETCH_MIN_GAP_MS:
 * the kid comes from an unverified header, so without the gap every request
 * carrying a made-up kid would cost a fetch from Google.
 */
export function shouldRefetchKeys(
  now: number,
  cacheExpiry: number,
  kidKnown: boolean,
  lastFetchAt: number,
): boolean {
  if (now > cacheExpiry) return true
  if (kidKnown) return false
  return now - lastFetchAt >= KEY_REFETCH_MIN_GAP_MS
}

/**
 * The token from the body if it carries one, else the X-Firebase-Token
 * header. An empty form part counts as absent, so it cannot mask a header.
 */
export function pickIdToken(formToken: string | null, headerToken: string | null): string | null {
  return formToken || headerToken || null
}
