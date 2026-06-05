import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Public liveness probe for an external uptime monitor (UptimeRobot — see
// RUNBOOK §6). No auth: it returns only a status, never data. Checks that both
// backends are reachable and answers 200 (ok) or 503 (degraded) so the monitor
// can alert.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FIREBASE_DATABASE_URL = Deno.env.get('FIREBASE_DATABASE_URL') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Short cache so a monitor (or an abuser) hitting this repeatedly can't multiply
// load on the backends — one real probe per CACHE_MS across warm invocations.
let _cache: { ts: number; body: string; status: number } | null = null
const CACHE_MS = 15_000

async function checkDb(): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { error } = await supabase
      .from('processed_webhook_events')
      .select('event_id')
      .limit(1)
    return !error
  } catch {
    return false
  }
}

async function checkRtdb(): Promise<boolean> {
  try {
    // Unauthenticated shallow probe: any HTTP response (even a 401 from the
    // deny-by-default rules) proves RTDB is reachable. Only a network error or a
    // 5xx counts as down.
    const res = await fetch(`${FIREBASE_DATABASE_URL}/.json?shallow=true`)
    return res.status < 500
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const now = Date.now()
  if (_cache && now - _cache.ts < CACHE_MS) {
    return new Response(_cache.body, {
      status: _cache.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const [db, rtdb] = await Promise.all([checkDb(), checkRtdb()])
  const ok = db && rtdb
  const body = JSON.stringify({ status: ok ? 'ok' : 'degraded', db, rtdb, ts: now })
  _cache = { ts: now, body, status: ok ? 200 : 503 }

  return new Response(body, {
    status: ok ? 200 : 503,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
