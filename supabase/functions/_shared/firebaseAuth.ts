// Firebase ID-token verification + family membership check, shared by the
// edge functions that act for a signed-in user (Fable audit, task 137).
//
// This is the one source. `node scripts/sync-edge-auth.mjs` copies it into
// each function's own folder as firebaseAuth.ts, which the function imports
// from './firebaseAuth.ts' (the same-folder import ocr-proxy already deploys
// with). Edit this file and re-run the script; the jest test
// `supabase/functions/_shared/firebaseAuth.test.ts` fails when a copy differs.

const JWK_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const DB_SCOPE =
  'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'

// A Google access token lives 3600 s. One is reused until it has less than
// this left, so a request never starts with a token about to expire.
export const DB_TOKEN_MIN_LEFT_S = 300

type ServiceAccount = { project_id?: string; client_email?: string; private_key?: string }

// Read on first use, not at import: tests load this module with their own env.
function env(name: string): string {
  return (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(name) || ''
}
let _serviceAccount: ServiceAccount | null = null
function serviceAccount(): ServiceAccount {
  if (!_serviceAccount) {
    try { _serviceAccount = JSON.parse(env('FIREBASE_SERVICE_ACCOUNT') || '{}') } catch { _serviceAccount = {} }
  }
  return _serviceAccount as ServiceAccount
}

let _keyCache: Record<string, CryptoKey> = {}
let _keyExpiry = 0
let _dbToken: { token: string; exp: number } | null = null
let _dbTokenInFlight: Promise<{ token: string; exp: number }> | null = null

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s))
}
async function loadKeys(): Promise<void> {
  const res = await fetch(JWK_URL)
  if (!res.ok) throw new Error('Failed to fetch Firebase signing keys')
  const jwks = await res.json()
  const next: Record<string, CryptoKey> = {}
  for (const jwk of jwks.keys || []) {
    try {
      next[jwk.kid] = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
      )
    } catch { /* skip unusable key */ }
  }
  _keyCache = next
  _keyExpiry = Date.now() + 3600_000
}
async function getKey(kid: string): Promise<CryptoKey> {
  if (Date.now() > _keyExpiry || !_keyCache[kid]) await loadKeys()
  const k = _keyCache[kid]
  if (!k) throw new Error('Unknown token signing key')
  return k
}

export async function verifyFirebaseIdToken(idToken: unknown): Promise<string> {
  if (typeof idToken !== 'string' || !idToken) throw new Error('Missing Firebase ID token')
  const projectId = serviceAccount().project_id || ''
  if (!projectId) throw new Error('Server misconfigured: project ID unavailable')
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed ID token')
  // Decoding is its own failure mode: a three-segment string is not
  // necessarily base64url, and neither atob nor JSON.parse produces an error
  // worth returning to a caller. Both collapse to one honest message.
  let header: { alg?: string; kid?: string }
  let payload: { exp?: unknown; iat?: unknown; aud?: unknown; iss?: unknown; sub?: unknown }
  let signature: Uint8Array
  try {
    header = JSON.parse(b64urlToString(parts[0]))
    payload = JSON.parse(b64urlToString(parts[1]))
    signature = b64urlToBytes(parts[2])
  } catch {
    throw new Error('Malformed ID token')
  }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token header')
  const key = await getKey(header.kid)
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, signature,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  )
  if (!ok) throw new Error('Invalid token signature')
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Token expired')
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('Token issued-at invalid')
  if (payload.aud !== projectId) throw new Error('Token audience mismatch')
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Token issuer mismatch')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Token subject missing')
  return payload.sub
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

async function mintDbToken(): Promise<{ token: string; exp: number }> {
  const sa = serviceAccount()
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: DB_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }))
  const input = `${header}.${claim}`
  const pk = await crypto.subtle.importKey(
    'pkcs8', pemToArrayBuffer(sa.private_key || ''),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pk, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = `${input}.${sigB64}`
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('Failed to get Firebase access token')
  const lifetime = typeof d.expires_in === 'number' && d.expires_in > 0 ? d.expires_in : 3600
  return { token: d.access_token, exp: Math.floor(Date.now() / 1000) + lifetime }
}

/**
 * An access token for the Realtime Database REST API. Minted once and reused
 * across requests on a warm instance until DB_TOKEN_MIN_LEFT_S before it
 * expires; requests arriving together share one mint. A failed mint is not
 * cached, so the next request tries again.
 */
export async function dbAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (_dbToken && _dbToken.exp - now > DB_TOKEN_MIN_LEFT_S) return _dbToken.token
  if (!_dbTokenInFlight) {
    _dbTokenInFlight = mintDbToken()
      .then(t => { _dbToken = t; return t })
      .finally(() => { _dbTokenInFlight = null })
  }
  return (await _dbTokenInFlight).token
}

export async function assertGroupMember(uid: string, familyGroupId: unknown): Promise<void> {
  if (typeof familyGroupId !== 'string' || !familyGroupId) throw new Error('Missing family group ID')
  const url = (token: string) =>
    `${env('FIREBASE_DATABASE_URL')}/familyGroups/${familyGroupId}/memberIds/${uid}.json?access_token=${token}`
  const cached = _dbToken?.token
  let res = await fetch(url(await dbAccessToken()))
  if ((res.status === 401 || res.status === 403) && cached !== undefined) {
    // A reused token the database no longer accepts (key rotated, revoked):
    // drop it and try once with a fresh one, so this request does not fail.
    _dbToken = null
    res = await fetch(url(await dbAccessToken()))
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) _dbToken = null
    throw new Error('Membership check failed')
  }
  const isMember = await res.json()
  if (isMember !== true) throw new Error('Caller is not a member of this family group')
}

/** @internal test seam: forget cached keys, tokens and env. */
export function __resetAuthCacheForTests(): void {
  _serviceAccount = null
  _keyCache = {}
  _keyExpiry = 0
  _dbToken = null
  _dbTokenInFlight = null
}
