import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const {
      idToken, id, name, family_group_id, created_by, created_by_name, created_at,
      resolved_by, resolved_by_name, resolved_at, price, status,
    } = body

    if (!id || !name || !family_group_id || !created_by || !created_at) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id, name, family_group_id, created_by, created_at' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify caller identity and family-group membership. Any member may create
    // or resolve an item, so membership is the authorization boundary — but
    // created_by attribution is locked to the caller / original creator below.
    let callerUid: string
    try {
      callerUid = await verifyFirebaseIdToken(idToken)
      await assertGroupMember(callerUid, family_group_id)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: (authError as Error).message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Lock created_by: keep whatever was stored on first insert, and default to
    // the verified caller on creation. The body's created_by is never trusted,
    // so a member can't attribute an item to another member.
    const { data: existingItem, error: lookupError } = await supabase
      .from('urgent_items')
      .select('created_by')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) throw lookupError
    const effectiveCreatedBy = existingItem?.created_by ?? callerUid

    const { error } = await supabase
      .from('urgent_items')
      .upsert(
        {
          id, name, family_group_id, created_by: effectiveCreatedBy, created_by_name, created_at,
          resolved_by: resolved_by ?? null,
          resolved_by_name: resolved_by_name ?? null,
          resolved_at: resolved_at ?? null,
          price: price ?? null,
          status: status ?? 'active',
          sync_status: 'synced',
        },
        { onConflict: 'id' }
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
