import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'
import { assertGroupMember, verifyFirebaseIdToken } from './firebaseAuth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!


// --- Request validation (inlined; the Supabase bundler does not resolve
// ../_shared imports). Two layers:
//   hard   — payloads that already 500 today (missing NOT NULL columns, wrong
//            type, malformed UUID). Rejected up front with a clean 400 instead
//            of an ugly 500, and before any DB write.
//   strict — stricter rules (enum, length caps) that do NOT fail today. These are
//            shadow-logged for one release and never rejected, so no shipped
//            client version regresses. Promote a rule to `hard` only once
//            validation_shadow_log shows no legit client trips it.
const upsertHard = z.object({
  // id is a client-generated uuidv4 (UrgentItemManager) — keep the uuid check.
  // family_group_id is a push() key and created_by is a Firebase Auth UID —
  // neither is a UUID, so validate as non-empty strings.
  id: z.string().uuid(),
  name: z.string().min(1),
  family_group_id: z.string().min(1),
  created_by: z.string().min(1),
  created_by_name: z.string().min(1),
  created_at: z.number(),
}).passthrough()

const upsertStrict = z.object({
  name: z.string().max(200),
  created_by_name: z.string().max(100),
  status: z.enum(['active', 'resolved']).optional(),
  price: z.number().min(0).max(99999).nullish(),
  resolved_by: z.string().min(1).nullish(),
  resolved_at: z.number().nullish(),
}).passthrough()

const SHADOW_SAMPLE_RATE = 0.1

function strictIssues(schema: z.ZodTypeAny, body: unknown): { rule: string; field: string }[] {
  const r = schema.safeParse(body)
  if (r.success) return []
  return r.error.issues.map((i) => ({ rule: i.code, field: i.path.join('.') || '(root)' }))
}

// Post-auth, sampled write. Diagnostic only — a failure here must never fail the
// request.
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
    const {
      idToken, id, name, family_group_id, created_by_name, created_at,
      resolved_by, resolved_by_name, resolved_at, price, status,
    } = body

    // Hard reject the version-independent invalid set (would 500 at insert anyway).
    if (!upsertHard.safeParse(body).success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify caller identity and family-group membership. Any member may create
    // or resolve an item, so membership is the authorization boundary — but
    // created_by attribution is locked to the caller / original creator below.
    let callerUid: string
    try {
      callerUid = await verifyFirebaseIdToken(idToken)
      await assertGroupMember(callerUid, family_group_id)
    } catch (authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', detail: (authError as Error).message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Per-UID rate limit (post-auth, keyed on the verified caller).
    if (!(await checkRateLimit(supabase, callerUid, 'upsert-urgent-item', 10, 60))) {
      return rateLimited()
    }

    // Shadow-log stricter-rule violations (post-auth, sampled). Never rejects.
    await shadowLog(supabase, 'upsert-urgent-item', strictIssues(upsertStrict, body))

    // Lock created_by: keep whatever was stored on first insert, and default to
    // the verified caller on creation. The body's created_by is never trusted,
    // so a member can't attribute an item to another member.
    const { data: existingItem, error: lookupError } = await supabase
      .from('urgent_items')
      .select('created_by')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) throw lookupError
    const effectiveCreatedBy = existingItem?.created_by ?? callerUid

    const { error } = await supabase
      .from('urgent_items')
      .upsert(
        {
          id, name, family_group_id, created_by: effectiveCreatedBy, created_by_name, created_at,
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
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
