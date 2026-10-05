// Integration test: sending, reconciling and webhook handling against Postgres, with a fake PayPal.
// Runs only when TEST_DATABASE_URL is set (the database is wiped).

import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '@/lib/db/client'
import { payments, webhookEvents } from '@/lib/db/schema'
import { seedDemo } from '@/lib/db/seed'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import type { PaymentStatus } from '@/lib/domain'
import { handlePayPalWebhook } from '@/lib/payments/webhook-handler'
import {
  PaymentStateError,
  reconcileBatch,
  reconcileInFlight,
  sendPayment,
  type PayoutGateway,
} from '@/lib/payments/payouts-service'
import { PayPalError } from '@/lib/paypal/client'
import type { PayoutRequest } from '@/lib/paypal/payouts'

const url = process.env.TEST_DATABASE_URL

class FakePayPal implements PayoutGateway {
  created: PayoutRequest[] = []
  itemStatus = 'PENDING'
  createErrors: Error[] = []

  async createPayout(req: PayoutRequest) {
    await new Promise((r) => setTimeout(r, 20)) // widen the race window for concurrency tests
    const err = this.createErrors.shift()
    if (err) throw err
    this.created.push(req)
    return { batchId: `BATCH-${req.paymentId.slice(0, 8)}`, batchStatus: 'PENDING' }
  }

  async getPayoutBatch(batchId: string) {
    const req = this.created.find((r) => batchId === `BATCH-${r.paymentId.slice(0, 8)}`)
    return {
      batchId,
      batchStatus: this.itemStatus === 'SUCCESS' ? 'SUCCESS' : 'PROCESSING',
      items: [
        {
          payoutItemId: `ITEM-${batchId}`,
          transactionStatus: this.itemStatus,
          senderItemId: req?.paymentId ?? null,
          error: this.itemStatus === 'FAILED' ? 'RECEIVER_UNREGISTERED' : null,
        },
      ],
    }
  }
}

describe.skipIf(!url)('payouts', async () => {
  const { db, pool } = createDb(url!)
  await migrate(db, { migrationsFolder: './drizzle' })
  let paypal: FakePayPal

  beforeEach(async () => {
    await seedDemo(db)
    paypal = new FakePayPal()
  })
  afterAll(() => pool.end())

  async function newPayment(status: PaymentStatus, email: string | null = 'maria_personal@example.com') {
    const [p] = await db
      .insert(payments)
      .values({
        seniorId: DEMO_SENIOR_ID,
        payeeName: 'Maria Adams',
        payeeEmail: email,
        amountCents: 8500,
        purpose: 'groceries',
        status,
        riskLevel: 'low',
      })
      .returning()
    return p
  }
  const load = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0]

  describe('sendPayment', () => {
    it('sends a confirmed payment and stores the batch id', async () => {
      const p = await newPayment('awaiting_confirmation')
      const sent = await sendPayment(db, p.id, paypal)
      expect(sent).toMatchObject({
        status: 'sending',
        paypalBatchId: `BATCH-${p.id.slice(0, 8)}`,
        paypalStatus: 'PENDING',
      })
      expect(paypal.created).toEqual([
        {
          paymentId: p.id,
          receiverEmail: 'maria_personal@example.com',
          amountCents: 8500,
          currency: 'USD',
          senderName: 'Margaret Adams',
          note: '$85 for groceries, sent with Haven',
        },
      ])
    })

    it('sends a caregiver-approved payment', async () => {
      const p = await newPayment('approved')
      expect((await sendPayment(db, p.id, paypal)).status).toBe('sending')
    })

    it('pays once when confirmed twice at the same time', async () => {
      const p = await newPayment('awaiting_confirmation')
      const results = await Promise.all([sendPayment(db, p.id, paypal), sendPayment(db, p.id, paypal)])
      expect(paypal.created).toHaveLength(1)
      expect(results.map((r) => r.status)).toEqual(['sending', 'sending'])
    })

    it.each(['held', 'declined', 'cancelled', 'failed'] as const)('refuses to send a %s payment', async (status) => {
      const p = await newPayment(status)
      await expect(sendPayment(db, p.id, paypal)).rejects.toBeInstanceOf(PaymentStateError)
      expect(paypal.created).toHaveLength(0)
      expect((await load(p.id)).status).toBe(status)
    })

    it('refuses to send without a PayPal email', async () => {
      const p = await newPayment('approved', null)
      await expect(sendPayment(db, p.id, paypal)).rejects.toThrow('no PayPal email')
    })

    it('marks the payment failed on a PayPal 4xx, without retrying', async () => {
      paypal.createErrors = [new PayPalError('PayPal POST → 422: INSUFFICIENT_FUNDS', 422, null)]
      const p = await newPayment('awaiting_confirmation')
      expect(await sendPayment(db, p.id, paypal)).toMatchObject({
        status: 'failed',
        paypalError: expect.stringContaining('INSUFFICIENT_FUNDS'),
      })
      expect(paypal.created).toHaveLength(0)
    })

    it('retries once on a network error or 5xx', async () => {
      paypal.createErrors = [new PayPalError('timeout', 0, null)]
      const p = await newPayment('awaiting_confirmation')
      expect((await sendPayment(db, p.id, paypal)).status).toBe('sending')
      expect(paypal.created).toHaveLength(1)
    })

    it('gives up after the retry also fails', async () => {
      paypal.createErrors = [new PayPalError('503', 503, null), new PayPalError('503 again', 503, null)]
      const p = await newPayment('awaiting_confirmation')
      expect(await sendPayment(db, p.id, paypal)).toMatchObject({ status: 'failed', paypalError: '503 again' })
    })
  })

  describe('reconcileBatch', () => {
    async function sending() {
      const p = await newPayment('awaiting_confirmation')
      return sendPayment(db, p.id, paypal)
    }

    it('SUCCESS → sent, with item id and sent time', async () => {
      const p = await sending()
      paypal.itemStatus = 'SUCCESS'
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      expect(await load(p.id)).toMatchObject({
        status: 'sent',
        paypalStatus: 'SUCCESS',
        paypalItemId: `ITEM-${p.paypalBatchId}`,
        sentAt: expect.any(Date),
      })
    })

    it('FAILED → failed with the reason', async () => {
      const p = await sending()
      paypal.itemStatus = 'FAILED'
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      expect(await load(p.id)).toMatchObject({ status: 'failed', paypalError: 'RECEIVER_UNREGISTERED' })
    })

    it('UNCLAIMED stays sending but records the PayPal status', async () => {
      const p = await sending()
      paypal.itemStatus = 'UNCLAIMED'
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      expect(await load(p.id)).toMatchObject({ status: 'sending', paypalStatus: 'UNCLAIMED' })
    })

    it('is idempotent and never moves backwards', async () => {
      const p = await sending()
      paypal.itemStatus = 'SUCCESS'
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      expect(await reconcileBatch(db, p.paypalBatchId!, paypal)).toHaveLength(0)
      paypal.itemStatus = 'PENDING' // stale data must not undo "sent"
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      expect((await load(p.id)).status).toBe('sent')
    })

    it('sent → failed when PayPal later returns the money', async () => {
      const p = await sending()
      paypal.itemStatus = 'SUCCESS'
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      paypal.itemStatus = 'RETURNED'
      await reconcileBatch(db, p.paypalBatchId!, paypal)
      expect((await load(p.id)).status).toBe('failed')
    })

    it('reconcileInFlight polls every sending payout', async () => {
      const a = await sending()
      const b = await sending()
      paypal.itemStatus = 'SUCCESS'
      const updated = await reconcileInFlight(db, paypal)
      expect(updated.map((u) => u.id).sort()).toEqual([a.id, b.id].sort())
    })
  })

  describe('handlePayPalWebhook', () => {
    const verifyOk = async () => true
    const event = (batchId: string, id = 'WH-1') =>
      JSON.stringify({ id, event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', resource: { payout_batch_id: batchId } })

    it('verifies, reconciles and records the event', async () => {
      const p = await sendPayment(db, (await newPayment('awaiting_confirmation')).id, paypal)
      paypal.itemStatus = 'SUCCESS'
      const r = await handlePayPalWebhook(db, event(p.paypalBatchId!), new Headers(), {
        verify: verifyOk,
        gateway: paypal,
      })
      expect(r).toEqual({ status: 200, body: { ok: true, updated: 1 } })
      expect((await load(p.id)).status).toBe('sent')
      expect(await db.select().from(webhookEvents)).toHaveLength(1)
    })

    it('ignores a redelivered event', async () => {
      const p = await sendPayment(db, (await newPayment('awaiting_confirmation')).id, paypal)
      await handlePayPalWebhook(db, event(p.paypalBatchId!), new Headers(), { verify: verifyOk, gateway: paypal })
      const again = await handlePayPalWebhook(db, event(p.paypalBatchId!), new Headers(), {
        verify: verifyOk,
        gateway: paypal,
      })
      expect(again.body).toMatchObject({ duplicate: true })
    })

    it('rejects a bad signature without touching payments', async () => {
      const p = await sendPayment(db, (await newPayment('awaiting_confirmation')).id, paypal)
      paypal.itemStatus = 'SUCCESS'
      const r = await handlePayPalWebhook(db, event(p.paypalBatchId!), new Headers(), {
        verify: async () => false,
        gateway: paypal,
      })
      expect(r.status).toBe(401)
      expect((await load(p.id)).status).toBe('sending')
      expect(await db.select().from(webhookEvents)).toHaveLength(0)
    })

    it('returns 503 when verification is unavailable, so PayPal retries', async () => {
      const r = await handlePayPalWebhook(db, event('B'), new Headers(), {
        verify: async () => {
          throw new Error('PAYPAL_WEBHOOK_ID is not set')
        },
      })
      expect(r.status).toBe(503)
    })

    it('rejects malformed bodies', async () => {
      expect((await handlePayPalWebhook(db, 'not json', new Headers(), { verify: verifyOk })).status).toBe(400)
      expect((await handlePayPalWebhook(db, '{"foo":1}', new Headers(), { verify: verifyOk })).status).toBe(400)
    })

    it('verifies against the real PayPal endpoint shape (no headers → false, no network call)', async () => {
      const { verifyWebhookSignature } = await import('@/lib/paypal/webhooks')
      process.env.PAYPAL_WEBHOOK_ID ||= 'test-webhook-id'
      expect(await verifyWebhookSignature(new Headers(), { id: 'x', event_type: 'y' })).toBe(false)
    })
  })
})
