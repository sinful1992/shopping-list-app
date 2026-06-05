import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Firebase RTDB helpers (inlined to avoid _shared import issues) ---

const FIREBASE_DATABASE_URL = Deno.env.get('FIREBASE_DATABASE_URL')!
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

let serviceAccount: any = null
try {
  serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT)
} catch {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT')
}

// --- Firebase ID-token verification (inlined; the Supabase bundler does not
// resolve ../_shared imports for these functions). Verifies the caller's
// identity from a client-supplied ID token, mirroring upsert-urgent-item. ---
const _authProjectId: string = serviceAccount?.project_id || ''
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

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function getFirebaseAccessToken(): Promise<string> {
  if (!serviceAccount) {
    throw new Error('Firebase service account not configured')
  }

  const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))

  const now = Math.floor(Date.now() / 1000)
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet))

  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput)
  )

  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${signatureInput}.${signatureBase64}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

async function firebaseGet(path: string): Promise<any> {
  const accessToken = await getFirebaseAccessToken()
  const response = await fetch(
    `${FIREBASE_DATABASE_URL}${path}.json?access_token=${accessToken}`
  )
  if (!response.ok) {
    throw new Error(`Firebase GET failed: ${response.statusText}`)
  }
  return response.json()
}

async function firebaseUpdate(path: string, data: any): Promise<void> {
  const accessToken = await getFirebaseAccessToken()
  const response = await fetch(
    `${FIREBASE_DATABASE_URL}${path}.json?access_token=${accessToken}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
  if (!response.ok) {
    throw new Error(`Firebase UPDATE failed: ${response.statusText}`)
  }
}

// --- Reconciliation logic ---

const ENTITLEMENT_ID = 'Family shopping list pro'
const PRODUCT_TIER_MAP: Record<string, string> = {
  monthly: 'premium',
  yearly: 'family',
  lifetime: 'family',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Per-UID rate limiting (inlined; the Supabase bundler does not resolve
// ../_shared imports). Postgres fixed-window counter keyed on the verified uid.
// Abuse/cost protection only — fails OPEN so a limiter blip never denies a legit
// caller; a working limiter caps spam (and RevenueCat API hammering). ---
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
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { appUserId, familyGroupId, idToken } = body

  if (!appUserId || typeof appUserId !== 'string' || !familyGroupId || typeof familyGroupId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: appUserId, familyGroupId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verify the caller's identity from their Firebase ID token, and require that
  // they are reconciling their own RevenueCat subscriber id. This closes an
  // unauthenticated trigger vector — only the signed-in user may kick off a
  // reconcile for their own appUserId.
  let callerUid: string
  try {
    callerUid = await verifyFirebaseIdToken(idToken)
  } catch (authError) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', detail: (authError as Error).message }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (callerUid !== appUserId) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Per-UID rate limit (post-auth). Keeps a client from hammering the RevenueCat
  // API via repeated reconciles. Low cap — reconcile is a cold-start operation.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  if (!(await checkRateLimit(supabase, callerUid, 'reconcile-subscription', 5, 60))) {
    return rateLimited()
  }

  if (appUserId.includes('/') || appUserId.includes('..')) {
    return new Response(
      JSON.stringify({ error: 'Invalid appUserId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!UUID_REGEX.test(familyGroupId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid familyGroupId format' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Ownership check: verify appUserId belongs to familyGroupId in Firebase
    const storedFamilyGroupId = await firebaseGet(`/users/${appUserId}/familyGroupId`)
    if (storedFamilyGroupId !== familyGroupId) {
      console.warn(`Ownership check failed: user ${appUserId} belongs to ${storedFamilyGroupId}, not ${familyGroupId}`)
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call RevenueCat REST API server-side
    const rcSecretKey = Deno.env.get('REVENUECAT_SECRET_KEY')
    if (!rcSecretKey) {
      throw new Error('REVENUECAT_SECRET_KEY not configured')
    }

    const rcResponse = await fetch(`https://api.revenuecat.com/v1/subscribers/${appUserId}`, {
      headers: {
        'Authorization': `Bearer ${rcSecretKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!rcResponse.ok) {
      throw new Error(`RevenueCat API failed: ${rcResponse.status} ${rcResponse.statusText}`)
    }

    const rcData = await rcResponse.json()
    const entitlement = rcData?.subscriber?.entitlements?.[ENTITLEMENT_ID]

    if (!entitlement) {
      return new Response(
        JSON.stringify({ reconciled: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const isActive = entitlement.expires_date === null || new Date(entitlement.expires_date) > new Date()
    if (!isActive) {
      return new Response(
        JSON.stringify({ reconciled: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const productId = entitlement.product_identifier
    const reconciledTier = PRODUCT_TIER_MAP[productId]
    if (!reconciledTier) {
      console.warn('Unknown product_identifier:', productId)
      return new Response(
        JSON.stringify({ reconciled: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    await firebaseUpdate(`/familyGroups/${familyGroupId}`, {
      subscriptionTier: reconciledTier,
      tierUpdatedAt: Date.now(),
    })

    console.log(`Reconciled tier=${reconciledTier} for group ${familyGroupId} (user ${appUserId})`)

    return new Response(
      JSON.stringify({ reconciled: true, tier: reconciledTier }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('reconcile-subscription error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
