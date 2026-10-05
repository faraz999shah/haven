// Registers Haven's webhook endpoint with the PayPal sandbox app and prints its id.
//   npm run paypal:webhook -- https://your-public-host
// Put the printed id in PAYPAL_WEBHOOK_ID. Re-running with the same URL reuses the existing webhook.

import 'dotenv/config'
import { paypalRequest } from '@/lib/paypal/client'

const EVENTS = [
  'PAYMENT.PAYOUTSBATCH.SUCCESS',
  'PAYMENT.PAYOUTSBATCH.DENIED',
  'PAYMENT.PAYOUTSBATCH.PROCESSING',
  'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
  'PAYMENT.PAYOUTS-ITEM.FAILED',
  'PAYMENT.PAYOUTS-ITEM.BLOCKED',
  'PAYMENT.PAYOUTS-ITEM.CANCELED',
  'PAYMENT.PAYOUTS-ITEM.HELD',
  'PAYMENT.PAYOUTS-ITEM.REFUNDED',
  'PAYMENT.PAYOUTS-ITEM.RETURNED',
  'PAYMENT.PAYOUTS-ITEM.UNCLAIMED',
]

async function main() {
  const host = process.argv[2]?.replace(/\/+$/, '')
  if (!host?.startsWith('https://')) throw new Error('Usage: npm run paypal:webhook -- https://your-public-host')
  const url = `${host}/api/webhooks/paypal`

  const { webhooks } = await paypalRequest<{ webhooks: { id: string; url: string }[] }>(
    'GET',
    '/v1/notifications/webhooks',
  )
  const existing = webhooks.find((w) => w.url === url)
  if (existing) {
    console.log(`Already registered: ${url}\nPAYPAL_WEBHOOK_ID=${existing.id}`)
    return
  }
  const created = await paypalRequest<{ id: string }>('POST', '/v1/notifications/webhooks', {
    url,
    event_types: EVENTS.map((name) => ({ name })),
  })
  console.log(`Registered: ${url}\nPAYPAL_WEBHOOK_ID=${created.id}`)
}

main().catch((err) => {
  console.error(err.body ? JSON.stringify(err.body, null, 2) : err)
  process.exit(1)
})
