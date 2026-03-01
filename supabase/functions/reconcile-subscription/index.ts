import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// --- Firebase RTDB helpers (inlined to avoid _shared import issues) ---

const FIREBASE_DATABASE_URL = Deno.env.get('FIREBASE_DATABASE_URL')!
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!

let serviceAccount: any = null
try {
  serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT)
} catch {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT')
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

  const { appUserId, familyGroupId } = body

  if (!appUserId || typeof appUserId !== 'string' || !familyGroupId || typeof familyGroupId !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: appUserId, familyGroupId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
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
