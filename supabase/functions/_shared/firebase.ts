// Firebase Realtime Database REST API helper

const FIREBASE_DATABASE_URL = Deno.env.get('FIREBASE_DATABASE_URL')!
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!

// Parse the Firebase service account JSON
let serviceAccount: any = null
try {
  serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT)
} catch (e) {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT')
}

// Function to get OAuth2 access token for Firebase
export async function getFirebaseAccessToken(): Promise<string> {
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
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  }
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

// Firebase Realtime Database operations
export async function firebaseGet(path: string): Promise<any> {
  const accessToken = await getFirebaseAccessToken()
  const response = await fetch(
    `${FIREBASE_DATABASE_URL}${path}.json?access_token=${accessToken}`
  )
  if (!response.ok) {
    throw new Error(`Firebase GET failed: ${response.statusText}`)
  }
  return response.json()
}

export async function firebaseSet(path: string, data: any): Promise<void> {
  const accessToken = await getFirebaseAccessToken()
  const response = await fetch(
    `${FIREBASE_DATABASE_URL}${path}.json?access_token=${accessToken}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
  if (!response.ok) {
    throw new Error(`Firebase SET failed: ${response.statusText}`)
  }
}

export async function firebaseUpdate(path: string, data: any): Promise<void> {
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

export async function firebasePush(path: string, data: any): Promise<string> {
  const accessToken = await getFirebaseAccessToken()
  const response = await fetch(
    `${FIREBASE_DATABASE_URL}${path}.json?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
  if (!response.ok) {
    throw new Error(`Firebase PUSH failed: ${response.statusText}`)
  }
  const result = await response.json()
  return result.name // Returns the generated key
}

// Subscription limits configuration
export const SUBSCRIPTION_LIMITS: Record<string, {
  maxLists: number | null
  maxOCRPerMonth: number | null
  maxUrgentItemsPerMonth: number | null
}> = {
  free: {
    maxLists: 4,
    maxOCRPerMonth: 1,
    maxUrgentItemsPerMonth: 1,
  },
  premium: {
    maxLists: null,
    maxOCRPerMonth: 20,
    maxUrgentItemsPerMonth: 3,
  },
  family: {
    maxLists: null,
    maxOCRPerMonth: null,
    maxUrgentItemsPerMonth: null,
  },
}

// Check subscription limit
export async function checkSubscriptionLimit(
  userId: string,
  familyGroupId: string,
  limitType: 'lists' | 'ocr' | 'urgentItems'
): Promise<{ allowed: boolean; reason?: string }> {
  // Get family group subscription tier
  const tier = await firebaseGet(`/familyGroups/${familyGroupId}/subscriptionTier`) || 'free'

  // Get user's usage counters
  const usage = await firebaseGet(`/users/${userId}/usageCounters`) || {
    listsCreated: 0,
    ocrProcessed: 0,
    urgentItemsCreated: 0,
    lastResetDate: Date.now(),
  }

  const limits = SUBSCRIPTION_LIMITS[tier] || SUBSCRIPTION_LIMITS.free

  // Check monthly reset
  const now = new Date()
  const lastReset = new Date(usage.lastResetDate || 0)
  const needsReset = now.getMonth() !== lastReset.getMonth() ||
                    now.getFullYear() !== lastReset.getFullYear()

  if (needsReset) {
    // Reset monthly counters
    await firebaseUpdate(`/users/${userId}/usageCounters`, {
      ocrProcessed: 0,
      urgentItemsCreated: 0,
      lastResetDate: Date.now(),
    })
    usage.ocrProcessed = 0
    usage.urgentItemsCreated = 0
  }

  // Check specific limit
  switch (limitType) {
    case 'lists':
      if (limits.maxLists !== null && usage.listsCreated >= limits.maxLists) {
        return {
          allowed: false,
          reason: `List limit reached (${limits.maxLists}). Upgrade to create more lists.`,
        }
      }
      break
    case 'ocr':
      if (limits.maxOCRPerMonth !== null && usage.ocrProcessed >= limits.maxOCRPerMonth) {
        return {
          allowed: false,
          reason: `OCR limit reached (${limits.maxOCRPerMonth}/month). Upgrade for more scans.`,
        }
      }
      break
    case 'urgentItems':
      if (limits.maxUrgentItemsPerMonth !== null &&
          usage.urgentItemsCreated >= limits.maxUrgentItemsPerMonth) {
        return {
          allowed: false,
          reason: `Urgent item limit reached (${limits.maxUrgentItemsPerMonth}/month). Upgrade for more.`,
        }
      }
      break
  }

  return { allowed: true }
}

// Increment usage counter
export async function incrementUsageCounter(
  userId: string,
  counterName: 'listsCreated' | 'ocrProcessed' | 'urgentItemsCreated'
): Promise<void> {
  const usage = await firebaseGet(`/users/${userId}/usageCounters`) || {}
  const currentValue = usage[counterName] || 0
  await firebaseUpdate(`/users/${userId}/usageCounters`, {
    [counterName]: currentValue + 1,
  })
}
