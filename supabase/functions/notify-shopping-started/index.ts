import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!
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

// Parse the Firebase service account JSON
const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT)

// Function to get OAuth2 access token for FCM
async function getAccessToken(): Promise<string> {
  const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))

  const now = Math.floor(Date.now() / 1000)
  const jwtClaimSet = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet))

  const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  // Sign the JWT
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

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
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

    const { idToken, family_group_id, user_id, user_name, store_name, list_name } = await req.json()

    if (!family_group_id || !user_id || !store_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: family_group_id, user_id, store_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // A caller may only announce their own shopping, to a group they belong to.
    // Otherwise anyone could spam push notifications to arbitrary families.
    try {
      const uid = await verifyFirebaseIdToken(idToken)
      if (user_id !== uid) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: user_id does not match authenticated user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      await assertGroupMember(uid, family_group_id)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: (authError as Error).message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get all device tokens for the family group (excluding the shopper)
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('fcm_token, user_id')
      .eq('family_group_id', family_group_id)
      .neq('user_id', user_id)

    if (error) {
      console.error('Error fetching tokens:', error)
      throw error
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Get OAuth2 access token
    const accessToken = await getAccessToken()

    // Get project ID from service account
    const projectId = serviceAccount.project_id

    const displayName = user_name || 'A family member'

    // Send FCM notification to all family members using V1 API
    const fcmPromises = tokens.map((tokenData) => {
      const message = {
        message: {
          token: tokenData.fcm_token,
          notification: {
            title: `🛒 ${displayName} is shopping at ${store_name}`,
            body: `Shopping list: ${list_name || 'Untitled'}`,
          },
          android: {
            priority: 'normal',
            notification: {
              channel_id: 'shopping_updates',
              color: '#34C759',
              sound: 'default',
            },
          },
          data: {
            type: 'shopping_started',
            user_name: displayName,
            store_name: store_name,
            list_name: list_name || '',
          },
        },
      }

      return fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(message),
        }
      )
    })

    const responses = await Promise.all(fcmPromises)

    // Check for errors and collect stale tokens
    let successCount = 0
    let errorCount = 0
    const staleTokens: string[] = []

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i]
      if (response.ok) {
        successCount++
      } else {
        errorCount++
        const errorText = await response.text()
        console.error('FCM error:', errorText)

        if (errorText.includes('UNREGISTERED') || errorText.includes('NOT_FOUND') || errorText.includes('not a valid FCM registration token')) {
          staleTokens.push(tokens[i].fcm_token)
        }
      }
    }

    // Delete stale tokens
    if (staleTokens.length > 0) {
      const { error: deleteError } = await supabase
        .from('device_tokens')
        .delete()
        .in('fcm_token', staleTokens)

      if (deleteError) {
        console.error('Failed to delete stale tokens:', deleteError)
      } else {
        console.log(`Deleted ${staleTokens.length} stale tokens`)
      }
    }

    return new Response(
      JSON.stringify({
        message: `Sent notifications to ${successCount} devices (${errorCount} failed, ${staleTokens.length} stale tokens deleted)`,
        total: tokens.length,
        success: successCount,
        failed: errorCount,
        staleDeleted: staleTokens.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
