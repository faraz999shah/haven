// Webhook signature verification via PayPal's verify endpoint.
// Docs: https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post
// Note: events sent with the dashboard's webhook *simulator* cannot be verified this way.

import { paypalRequest } from './client'

export interface PayPalWebhookEvent {
  id: string
  event_type: string
  resource?: Record<string, unknown>
}

export async function verifyWebhookSignature(headers: Headers, event: PayPalWebhookEvent): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID is not set')
  const h = (name: string) => headers.get(name)
  const required = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ]
  if (required.some((name) => !h(name))) return false

  const res = await paypalRequest<{ verification_status: string }>(
    'POST',
    '/v1/notifications/verify-webhook-signature',
    {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    },
  )
  return res.verification_status === 'SUCCESS'
}

// Payout batch id from either a batch event (PAYMENT.PAYOUTSBATCH.*) or an item event (PAYMENT.PAYOUTS-ITEM.*).
export function payoutBatchIdFromEvent(event: PayPalWebhookEvent): string | null {
  const r = event.resource ?? {}
  const fromItem = typeof r.payout_batch_id === 'string' ? r.payout_batch_id : null
  const header = r.batch_header as { payout_batch_id?: unknown } | undefined
  const fromBatch = typeof header?.payout_batch_id === 'string' ? header.payout_batch_id : null
  return fromItem ?? fromBatch
}
