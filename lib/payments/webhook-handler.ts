// Handles a PayPal webhook delivery: verify signature → dedupe by event id → reconcile the payout.

import { eq } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { webhookEvents } from '@/lib/db/schema'
import { payoutBatchIdFromEvent, verifyWebhookSignature, type PayPalWebhookEvent } from '@/lib/paypal/webhooks'
import { paypalGateway, reconcileBatch, type PayoutGateway } from './payouts-service'

export interface WebhookResult {
  status: number
  body: Record<string, unknown>
}

export async function handlePayPalWebhook(
  db: Db,
  rawBody: string,
  headers: Headers,
  deps: { verify?: typeof verifyWebhookSignature; gateway?: PayoutGateway } = {},
): Promise<WebhookResult> {
  const verify = deps.verify ?? verifyWebhookSignature

  let event: PayPalWebhookEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } }
  }
  if (typeof event?.id !== 'string' || typeof event?.event_type !== 'string') {
    return { status: 400, body: { error: 'Not a PayPal event' } }
  }

  let verified: boolean
  try {
    verified = await verify(headers, event)
  } catch (err) {
    // Couldn't reach PayPal or not configured: 5xx makes PayPal retry later.
    console.error('Webhook verification error:', err)
    return { status: 503, body: { error: 'Verification unavailable' } }
  }
  if (!verified) return { status: 401, body: { error: 'Invalid signature' } }

  const [seen] = await db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, event.id))
  if (seen) return { status: 200, body: { ok: true, duplicate: true } }

  let updated = 0
  if (event.event_type.startsWith('PAYMENT.PAYOUTS')) {
    const batchId = payoutBatchIdFromEvent(event)
    if (batchId) updated = (await reconcileBatch(db, batchId, deps.gateway)).length
  }

  // Recorded only after processing succeeded, so a failure above gets retried by PayPal.
  await db
    .insert(webhookEvents)
    .values({ id: event.id, eventType: event.event_type, resourceId: payoutBatchIdFromEvent(event), payload: event })
    .onConflictDoNothing()
  return { status: 200, body: { ok: true, updated } }
}
