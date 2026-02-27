import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
      id, name, family_group_id, created_by, created_by_name, created_at,
      resolved_by, resolved_by_name, resolved_at, price, status,
    } = body

    if (!id || !name || !family_group_id || !created_by || !created_at) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id, name, family_group_id, created_by, created_at' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { error } = await supabase
      .from('urgent_items')
      .upsert(
        {
          id, name, family_group_id, created_by, created_by_name, created_at,
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
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
