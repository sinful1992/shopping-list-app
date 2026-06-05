import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// --- Firebase ID-token verification + membership (inlined; the Supabase
// bundler does not resolve ../_shared imports for these functions) ---
const _authServiceAccount = (() => {
  try { return JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}') } catch { return {} }
})()
const _authProjectId: string = _authServiceAccount.project_id || ''
const _authDbUrl = Deno.env.get('FIREBASE_DATABASE_URL') || ''
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
  const k = _authKeyCache[kid]
  if (!k) throw new Error('Unknown token signing key')
  return k
}
async function verifyFirebaseIdToken(idToken: unknown): Promise<string> {
  if (typeof idToken !== 'string' || !idToken) throw new Error('Missing Firebase ID token')
  if (!_authProjectId) throw new Error('Server misconfigured: project ID unavailable')
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed ID token')
  const header = JSON.parse(_authB64urlToString(parts[0]))
  const payload = JSON.parse(_authB64urlToString(parts[1]))
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unexpected token header')
  const key = await _authGetKey(header.kid)
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, _authB64urlToBytes(parts[2]),
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
function _authPemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}
async function _authDbToken(): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const claim = btoa(JSON.stringify({
    iss: _authServiceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  }))
  const input = `${header}.${claim}`
  const pk = await crypto.subtle.importKey(
    'pkcs8', _authPemToArrayBuffer(_authServiceAccount.private_key),
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
  return d.access_token
}
async function assertGroupMember(uid: string, familyGroupId: unknown): Promise<void> {
  if (typeof familyGroupId !== 'string' || !familyGroupId) throw new Error('Missing family group ID')
  const token = await _authDbToken()
  const res = await fetch(`${_authDbUrl}/familyGroups/${familyGroupId}/memberIds/${uid}.json?access_token=${token}`)
  if (!res.ok) throw new Error('Membership check failed')
  const isMember = await res.json()
  if (isMember !== true) throw new Error('Caller is not a member of this family group')
}

// --- Request validation (inlined; the Supabase bundler does not resolve
// ../_shared imports). hard = would-500-today set → 400; strict = stricter rules
// shadow-logged post-auth, never rejected, so no shipped client regresses.
const deviceHard = z.object({
  // user_id is a Firebase Auth UID and family_group_id is a push() key — neither
  // is a UUID, so validate them as non-empty strings. They do not 500 today, so
  // they must not be in the hard (would-500) reject set.
  user_id: z.string().min(1),
  family_group_id: z.string().min(1),
  fcm_token: z.string().min(1),
  platform: z.string().min(1),
}).passthrough()

const deviceStrict = z.object({
  platform: z.enum(['android', 'ios']),
  fcm_token: z.string().max(4096),
}).passthrough()

const SHADOW_SAMPLE_RATE = 0.1

function strictIssues(schema: z.ZodTypeAny, body: unknown): { rule: string; field: string }[] {
  const r = schema.safeParse(body)
  if (r.success) return []
  return r.error.issues.map((i) => ({ rule: i.code, field: i.path.join('.') || '(root)' }))
}

async function shadowLog(
  supabase: ReturnType<typeof createClient>,
  fn: string,
  issues: { rule: string; field: string }[],
): Promise<void> {
  if (issues.length === 0) return
  if (Math.random() > SHADOW_SAMPLE_RATE) return
  try {
    await supabase
      .from('validation_shadow_log')
      .insert(issues.map((i) => ({ fn, rule: i.rule, field: i.field })))
  } catch (_e) { /* never fail the request on a diagnostic log error */ }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Per-UID rate limiting (inlined; the Supabase bundler does not resolve
// ../_shared imports). Postgres fixed-window counter keyed on the verified uid.
// Abuse/cost protection only — fails OPEN so a limiter blip never denies a legit
// caller; a working limiter caps spam. ---
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  uid: string,
  fn: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_uid: uid, p_fn: fn, p_window_seconds: windowSeconds,
    })
    if (error) { console.error('rate-limit rpc error:', error.message); return true }
    return typeof data === 'number' ? data <= limit : true
  } catch (e) {
    console.error('rate-limit check failed:', (e as Error).message)
    return true
  }
}
function rateLimited(): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests' }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { idToken, user_id, family_group_id, fcm_token, platform } = body

    // Hard reject the version-independent invalid set (would 500 at upsert anyway).
    if (!deviceHard.safeParse(body).success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // A caller may only register their own device, in a group they belong to.
    // Otherwise an attacker could attach their FCM token to a victim's group
    // and receive that family's notifications.
    let callerUid: string
    try {
      callerUid = await verifyFirebaseIdToken(idToken)
      if (user_id !== callerUid) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: user_id does not match authenticated user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      await assertGroupMember(callerUid, family_group_id)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: (authError as Error).message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Per-UID rate limit (post-auth, keyed on the verified caller).
    if (!(await checkRateLimit(supabase, callerUid, 'register-device-token', 10, 60))) {
      return rateLimited()
    }

    // Shadow-log stricter-rule violations (post-auth, sampled). Never rejects.
    await shadowLog(supabase, 'register-device-token', strictIssues(deviceStrict, body))

    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id,
          family_group_id,
          fcm_token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,fcm_token' }
      )

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
