import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { checkSubscriptionLimit, incrementUsageCounter } from '../_shared/firebase.ts'

const VISION_API_KEY = Deno.env.get('VISION_API_KEY')!

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
    const { image, familyGroupId, userId } = await req.json()

    if (!image || !familyGroupId || !userId) {
      return new Response(
        JSON.stringify({ error: 'image, familyGroupId, and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check subscription limit
    const permission = await checkSubscriptionLimit(userId, familyGroupId, 'ocr')
    if (!permission.allowed) {
      return new Response(
        JSON.stringify({ error: permission.reason, code: 'LIMIT_EXCEEDED' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if Vision API key is configured
    if (!VISION_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Vision API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      }
    )

    const visionData = await visionResponse.json()

    if (!visionResponse.ok) {
      console.error('Vision API error:', visionData)
      return new Response(
        JSON.stringify({ error: 'Failed to process image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Increment usage counter
    await incrementUsageCounter(userId, 'ocrProcessed')

    return new Response(
      JSON.stringify({
        success: true,
        result: visionData.responses[0],
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
