import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  checkSubscriptionLimit,
  incrementUsageCounter,
  firebasePush,
  firebaseUpdate
} from '../_shared/firebase.ts'

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { name, familyGroupId, userId, requestedBy } = await req.json()

    if (!name || !familyGroupId || !userId) {
      return new Response(
        JSON.stringify({ error: 'name, familyGroupId, and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check subscription limit
    const permission = await checkSubscriptionLimit(userId, familyGroupId, 'urgentItems')
    if (!permission.allowed) {
      return new Response(
        JSON.stringify({ error: permission.reason, code: 'LIMIT_EXCEEDED' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create urgent item data
    const itemData = {
      name,
      familyGroupId,
      createdBy: userId,
      requestedBy: requestedBy || userId,
      createdAt: Date.now(),
      status: 'pending',
    }

    // Push to Firebase and get generated key
    const itemId = await firebasePush(`/familyGroups/${familyGroupId}/urgentItems`, itemData)

    // Update the item with its own ID
    await firebaseUpdate(`/familyGroups/${familyGroupId}/urgentItems/${itemId}`, { id: itemId })

    // Increment usage counter
    await incrementUsageCounter(userId, 'urgentItemsCreated')

    return new Response(
      JSON.stringify({
        success: true,
        itemId,
        item: { ...itemData, id: itemId },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
