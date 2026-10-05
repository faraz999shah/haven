// Sends a real $1 sandbox payout to Maria through Haven's code path, then polls PayPal until it settles.
//   npm run paypal:smoke
//   npm run paypal:smoke -- --webhook   (don't poll; wait for the webhook to update the payment)

import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { createDb } from '@/lib/db/client'
import { payments, trustedPayees } from '@/lib/db/schema'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { reconcileBatch, sendPayment } from '@/lib/payments/payouts-service'

async function main() {
  const { db, pool } = createDb(process.env.DATABASE_URL!)
  const [maria] = await db.select().from(trustedPayees).where(eq(trustedPayees.name, 'Maria Adams'))
  const [payment] = await db
    .insert(payments)
    .values({
      seniorId: DEMO_SENIOR_ID,
      trustedPayeeId: maria.id,
      payeeName: maria.name,
      payeeEmail: maria.paypalEmail,
      amountCents: 100,
      purpose: 'Haven sandbox test',
      status: 'awaiting_confirmation',
      riskLevel: 'low',
    })
    .returning()
  console.log(`Payment ${payment.id}: $1 to ${maria.paypalEmail}`)

  const sent = await sendPayment(db, payment.id)
  console.log(
    `→ ${sent.status}, batch ${sent.paypalBatchId}, PayPal ${sent.paypalStatus}${sent.paypalError ? `, error: ${sent.paypalError}` : ''}`,
  )
  if (!sent.paypalBatchId) return pool.end()

  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    if (!process.argv.includes('--webhook')) await reconcileBatch(db, sent.paypalBatchId)
    const [now] = await db.select().from(payments).where(eq(payments.id, payment.id))
    console.log(`  ${(i + 1) * 5}s: ${now.status} (PayPal ${now.paypalStatus})`)
    if (now.status !== 'sending' || now.paypalStatus === 'UNCLAIMED') break
  }
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
