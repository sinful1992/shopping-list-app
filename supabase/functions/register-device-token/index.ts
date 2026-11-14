import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'
import { assertGroupMember, verifyFirebaseIdToken } from './firebaseAuth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!


// --- Request validation (inlined; the Supabase bundler does not resolve
// ../_shared imports). hard = would-500-today set → 400; strict = stricter rules
// shadow-logged post-auth, never rejected, so no shipped client regresses.
const deviceHard = z.object({
  // user_id is a Firebase Auth UID and family_group_id is a push() key — neither
  // is a UUID, so validate them as non-empty strings. They do not 500 today, so
  // they must not be in the hard (would-500) reject set.
  user_id: z.string().min(1),
  family_group_id: z.string().min(1),
  fcm_token: z.string().min(1),
  platform: z.string().min(1),
}).passthrough()

const deviceStrict = z.object({
  platform: z.enum(['android', 'ios']),
  fcm_token: z.string().max(4096),
}).passthrough()

const SHADOW_SAMPLE_RATE = 0.1

function strictIssues(schema: z.ZodTypeAny, body: unknown): { rule: string; field: string }[] {
  const r = schema.safeParse(body)
  if (r.success) return []
  return r.error.issues.map((i) => ({ rule: i.code, field: i.path.join('.') || '(root)' }))
}

async function shadowLog(
  supabase: ReturnType<typeof createClient>,
  fn: string,
  issues: { rule: string; field: string }[],
): Promise<void> {
  if (issues.length === 0) return
  if (Math.random() > SHADOW_SAMPLE_RATE) return
  try {
    await supabase
      .from('validation_shadow_log')
      .insert(issues.map((i) => ({ fn, rule: i.rule, field: i.field })))
  } catch (_e) { /* never fail the request on a diagnostic log error */ }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Per-UID rate limiting (inlined; the Supabase bundler does not resolve
// ../_shared imports). Postgres fixed-window counter keyed on the verified uid.
// Abuse/cost protection only — fails OPEN so a limiter blip never denies a legit
// caller; a working limiter caps spam. ---
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
    const { idToken, user_id, family_group_id, fcm_token, platform } = body

    // Hard reject the version-independent invalid set (would 500 at upsert anyway).
    if (!deviceHard.safeParse(body).success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // A caller may only register their own device, in a group they belong to.
    // Otherwise an attacker could attach their FCM token to a victim's group
    // and receive that family's notifications.
    let callerUid: string
    try {
      callerUid = await verifyFirebaseIdToken(idToken)
      if (user_id !== callerUid) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: user_id does not match authenticated user' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      await assertGroupMember(callerUid, family_group_id)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: (authError as Error).message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Per-UID rate limit (post-auth, keyed on the verified caller).
    if (!(await checkRateLimit(supabase, callerUid, 'register-device-token', 10, 60))) {
      return rateLimited()
    }

    // Shadow-log stricter-rule violations (post-auth, sampled). Never rejects.
    await shadowLog(supabase, 'register-device-token', strictIssues(deviceStrict, body))

    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          user_id,
          family_group_id,
          fcm_token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,fcm_token' }
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
