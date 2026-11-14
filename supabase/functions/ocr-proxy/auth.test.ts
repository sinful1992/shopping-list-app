/**
 * The proxy's token helpers. The kid in a token header is unverified, so an
 * unknown one must not cost a fetch from Google on every request.
 */
import { KEY_REFETCH_MIN_GAP_MS, pickIdToken, shouldRefetchKeys } from './auth';

describe('shouldRefetchKeys', () => {
  const now = 10_000_000;
  const fresh = now + 3_600_000;

  it('does not fetch for a known kid while the cache is fresh', () => {
    expect(shouldRefetchKeys(now, fresh, true, now - 1)).toBe(false);
  });

  it('always fetches once the cache has expired', () => {
    expect(shouldRefetchKeys(now, now - 1, true, now - 1)).toBe(true);
    expect(shouldRefetchKeys(now, now - 1, false, now - 1)).toBe(true);
  });

  it('fetches for an unknown kid only once per gap', () => {
    expect(shouldRefetchKeys(now, fresh, false, now - KEY_REFETCH_MIN_GAP_MS)).toBe(true);
    expect(shouldRefetchKeys(now, fresh, false, now - KEY_REFETCH_MIN_GAP_MS + 1)).toBe(false);
  });

  it('a flood of made-up kids costs at most one fetch per gap', () => {
    let fetchedAt = 0;
    let fetches = 0;
    for (let t = now; t < now + KEY_REFETCH_MIN_GAP_MS * 3; t += 100) {
      if (shouldRefetchKeys(t, fresh, false, fetchedAt)) {
        fetches++;
        fetchedAt = t;
      }
    }
    expect(fetches).toBe(3);
  });
});

describe('pickIdToken', () => {
  it('prefers the body token', () => {
    expect(pickIdToken('body', 'header')).toBe('body');
  });

  it('falls back to the header when the body has none', () => {
    expect(pickIdToken(null, 'header')).toBe('header');
  });

  it('does not let an empty body part mask the header', () => {
    expect(pickIdToken('', 'header')).toBe('header');
  });

  it('is null when neither carries one', () => {
    expect(pickIdToken('', null)).toBeNull();
  });
});
