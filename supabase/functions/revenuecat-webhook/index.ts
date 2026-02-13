import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { firebaseGet, firebaseUpdate } from '../_shared/firebase.ts'

const PRODUCT_TIER_MAP: Record<string, string> = {
  monthly: 'premium',
  yearly: 'family',
  lifetime: 'family',
}

const TIER_UPGRADE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
])

async function lookupFamilyGroupId(appUserId: string): Promise<string | null> {
  const familyGroupId = await firebaseGet(`/users/${appUserId}/familyGroupId`)
  return familyGroupId || null
}

async function setFamilyTier(
  familyGroupId: string,
  newTier: string,
  eventTimestampMs: number
): Promise<boolean> {
  const currentTimestamp = await firebaseGet(`/familyGroups/${familyGroupId}/tierUpdatedAt`)

  if (currentTimestamp && eventTimestampMs <= currentTimestamp) {
    console.log(
      `Skipping stale event for group ${familyGroupId}: event=${eventTimestampMs}, current=${currentTimestamp}`
    )
    return false
  }

  await firebaseUpdate(`/familyGroups/${familyGroupId}`, {
    subscriptionTier: newTier,
    tierUpdatedAt: eventTimestampMs,
  })

  console.log(`Set tier=${newTier} for group ${familyGroupId} at ${eventTimestampMs}`)
  return true
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('REVENUECAT_WEBHOOK_SECRET not configured')
    return new Response('Server misconfigured', { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
    console.warn('Unauthorized webhook request')
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!payload?.event) {
    return new Response('Missing event payload', { status: 400 })
  }

  const event = payload.event
  const { type, app_user_id, product_id, event_timestamp_ms } = event

  console.log(`Webhook event: type=${type}, user=${app_user_id}, product=${product_id}`)

  try {
    if (TIER_UPGRADE_EVENTS.has(type)) {
      if (!product_id) {
        console.warn(`No product_id in ${type} event for user ${app_user_id}`)
        return new Response('OK', { status: 200 })
      }

      const newTier = PRODUCT_TIER_MAP[product_id] || 'premium'
      const familyGroupId = await lookupFamilyGroupId(app_user_id)

      if (!familyGroupId) {
        console.warn(
          `User ${app_user_id} has no familyGroupId — tier will be reconciled when they join a group`
        )
        return new Response('OK', { status: 200 })
      }

      await setFamilyTier(familyGroupId, newTier, event_timestamp_ms)
      return new Response('OK', { status: 200 })
    }

    if (type === 'TRANSFER') {
      const transferredFrom: string[] = event.transferred_from || []
      for (const fromUserId of transferredFrom) {
        const fromGroupId = await lookupFamilyGroupId(fromUserId)
        if (fromGroupId) {
          await setFamilyTier(fromGroupId, 'free', event_timestamp_ms)
          console.log(`TRANSFER: set group ${fromGroupId} (from user ${fromUserId}) to free`)
        }
      }

      if (product_id) {
        const newTier = PRODUCT_TIER_MAP[product_id] || 'premium'
        const toGroupId = await lookupFamilyGroupId(app_user_id)
        if (toGroupId) {
          await setFamilyTier(toGroupId, newTier, event_timestamp_ms)
        } else {
          console.warn(`TRANSFER destination user ${app_user_id} has no familyGroupId`)
        }
      }

      return new Response('OK', { status: 200 })
    }

    if (type === 'EXPIRATION') {
      const familyGroupId = await lookupFamilyGroupId(app_user_id)
      if (familyGroupId) {
        await setFamilyTier(familyGroupId, 'free', event_timestamp_ms)
      } else {
        console.warn(`EXPIRATION: user ${app_user_id} has no familyGroupId`)
      }
      return new Response('OK', { status: 200 })
    }

    if (type === 'CANCELLATION') {
      return new Response('OK', { status: 200 })
    }

    if (type === 'BILLING_ISSUE') {
      console.warn(`BILLING_ISSUE for user ${app_user_id}, product=${product_id}`)
      return new Response('OK', { status: 200 })
    }

    console.log(`Unhandled webhook event type: ${type}`)
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error(`Webhook error processing ${type} for user ${app_user_id}:`, error)
    return new Response('Internal error', { status: 500 })
  }
})
