import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildUpstreamForm } from './upstreamForm.ts'

// Server-side hop between the app and the self-hosted PaddleOCR Space.
//
// The app used to call the Space directly with a shared secret compiled into
// the bundle, which meant the secret was readable by anyone with the APK or
// the public repo. Here the secret lives only in this function's environment:
// the caller proves identity with a Firebase ID token instead, so a leaked
// build grants nothing that a signed-in user does not already have.

const OCR_SERVER_URL = (Deno.env.get('OCR_SERVER_URL') || '').replace(/\/+$/, '')
const OCR_SHARED_SECRET = Deno.env.get('OCR_SHARED_SECRET') || ''

// Supabase edge functions cap the request body well below the Space's own
// 15MB limit (the platform limit is ~10MB and undocumented). The app caps
// captures at 4096px to stay clear of this; the check is here so an
// oversized upload fails with a readable error rather than a platform 413.
const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

// --- Firebase ID-token verification (inlined; the Supabase bundler does not
// resolve ../_shared imports for these functions) ---
const _authProjectId: string = (() => {
  const explicit = Deno.env.get('FIREBASE_PROJECT_ID')
  if (explicit) return explicit
  try {
    return JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}').project_id || ''
  } catch {
    return ''
  }
})()
const _authJwkUrl =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
let _authKeyCache: Record<string, CryptoKey> = {}
let _authKeyExpiry = 0

function _authB64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function _authB64urlToString(s: string): string {
  return new TextDecoder().decode(_authB64urlToBytes(s))
}

async function _authLoadKeys(): Promise<void> {
  const res = await fetch(_authJwkUrl)
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
  _authKeyCache = next
  _authKeyExpiry = Date.now() + 3600_000
}

async function _authGetKey(kid: string): Promise<CryptoKey> {
  if (Date.now() > _authKeyExpiry || !_authKeyCache[kid]) await _authLoadKeys()
  const key = _authKeyCache[kid]
  if (!key) throw new Error('Unknown token key id')
  return key
}

async function verifyFirebaseIdToken(idToken: unknown): Promise<string> {
  if (typeof idToken !== 'string' || !idToken) throw new Error('Missing Firebase ID token')
  if (!_authProjectId) throw new Error('Server misconfigured: project ID unavailable')
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed ID token')
  // Decoding is its own failure mode: a three-segment string is not
  // necessarily base64url, and neither atob nor JSON.parse produces an error
  // worth returning to a caller. Both collapse to one honest message.
  let header: { alg?: string; kid?: string }
  let payload: { exp?: unknown; iat?: unknown; aud?: unknown; iss?: unknown; sub?: unknown }
  let signature: Uint8Array
  try {
    header = JSON.parse(_authB64urlToString(parts[0]))
    payload = JSON.parse(_authB64urlToString(parts[1]))
    signature = _authB64urlToBytes(parts[2])
  } catch {
    throw new Error('Malformed ID token')
  }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token header')
  const key = await _authGetKey(header.kid)
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, signature,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  )
  if (!ok) throw new Error('Invalid token signature')
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Token expired')
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('Token issued-at invalid')
  if (payload.aud !== _authProjectId) throw new Error('Token audience mismatch')
  if (payload.iss !== `https://securetoken.google.com/${_authProjectId}`) throw new Error('Token issuer mismatch')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Token subject missing')
  return payload.sub
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!OCR_SERVER_URL) {
    return json({ error: 'Server misconfigured: OCR_SERVER_URL unset' }, 500)
  }

  let file: File
  let formToken: string | null = null
  let hints: unknown = null
  try {
    const form = await req.formData()
    const candidate = form.get('file')
    if (!(candidate instanceof File)) {
      return json({ error: 'Missing "file" part in multipart body' }, 400)
    }
    file = candidate
    const tokenPart = form.get('idToken')
    if (typeof tokenPart === 'string') formToken = tokenPart
    hints = form.get('hints')
  } catch {
    return json({ error: 'Malformed multipart body' }, 400)
  }

  // The token is read from the body first: Supabase's gateway has been
  // observed stripping non-standard request headers before the function
  // runs, so X-Firebase-Token alone is not dependable. The header is kept
  // as a fallback for callers that set it. Parsing the body before
  // authenticating costs little — the platform bounds the body size anyway.
  try {
    await verifyFirebaseIdToken(formToken ?? req.headers.get('X-Firebase-Token'))
  } catch (err) {
    return json({ error: (err as Error).message }, 401)
  }

  if (file.size === 0) {
    return json({ error: 'Empty file uploaded' }, 400)
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json(
      { error: `Upload too large — limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB` },
      413,
    )
  }

  // Rebuild the multipart body rather than streaming the original through:
  // formData() has already consumed it, and the Space reads only "file" and
  // the optional "hints".
  const upstreamForm = buildUpstreamForm(file, hints)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (OCR_SHARED_SECRET) headers['X-OCR-Key'] = OCR_SHARED_SECRET

  // Preserve the caller's ?debug=1 without forwarding anything else.
  const debug = new URL(req.url).searchParams.get('debug')
  const upstreamUrl = `${OCR_SERVER_URL}/ocr${debug === 'true' || debug === '1' ? '?debug=true' : ''}`

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, { method: 'POST', body: upstreamForm, headers })
  } catch (err) {
    return json({ error: `OCR server unreachable: ${(err as Error).message}` }, 502)
  }

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  })
})
