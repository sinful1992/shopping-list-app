import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Parse the Firebase service account JSON
const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT)

// Function to get OAuth2 access token
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

serve(async (req) => {
  try {
    const { record } = await req.json()

    // Only send notification for new urgent items
    if (!record || record.status !== 'active') {
      return new Response(JSON.stringify({ message: 'No notification needed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Get all device tokens for the family group (excluding creator)
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('fcm_token, user_id')
      .eq('family_group_id', record.family_group_id)
      .neq('user_id', record.created_by)

    if (error) {
      console.error('Error fetching tokens:', error)
      throw error
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Get OAuth2 access token
    const accessToken = await getAccessToken()

    // Get project ID from service account
    const projectId = serviceAccount.project_id

    // Send FCM notification to all family members using V1 API
    const fcmPromises = tokens.map((tokenData) => {
      const message = {
        message: {
          token: tokenData.fcm_token,
          notification: {
            title: `🔥 Urgent: ${record.name} needed!`,
            body: `${record.created_by_name} needs this right away`,
          },
          android: {
            priority: 'high',
            notification: {
              channel_id: 'urgent_items',
              color: '#FF6B35',
              sound: 'default',
            },
          },
          data: {
            type: 'urgent_item',
            item_id: record.id,
            item_name: record.name,
            created_by: record.created_by_name,
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

    // Check for errors
    let successCount = 0
    let errorCount = 0
    for (const response of responses) {
      if (response.ok) {
        successCount++
      } else {
        errorCount++
        const errorText = await response.text()
        console.error('FCM error:', errorText)
      }
    }

    return new Response(
      JSON.stringify({
        message: `Sent notifications to ${successCount} devices (${errorCount} failed)`,
        total: tokens.length,
        success: successCount,
        failed: errorCount
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
