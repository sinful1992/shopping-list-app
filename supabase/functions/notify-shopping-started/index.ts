import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FIREBASE_SERVICE_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    const { family_group_id, user_id, user_name, store_name, list_name } = await req.json()

    if (!family_group_id || !user_id || !store_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: family_group_id, user_id, store_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
