// Integration test: caregiver approve/decline, notices, and saving protection rules.
// Runs only when TEST_DATABASE_URL is set (the database is wiped).

import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  acknowledgeNotices,
  approvePayment,
  declinePayment,
  getPaymentDetail,
  getRules,
  listPayments,
  pendingNotices,
  RulesSchema,
  saveRules,
} from '@/lib/caregiver/service'
import { createDb } from '@/lib/db/client'
import { payments, trustedPayees } from '@/lib/db/schema'
import { seedDemo } from '@/lib/db/seed'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { PaymentStateError, type PayoutGateway } from '@/lib/payments/payouts-service'
import type { PayoutRequest } from '@/lib/paypal/payouts'
import { checkPaymentRules } from '@/lib/rules/check-payment'

const url = process.env.TEST_DATABASE_URL

class FakePayPal implements PayoutGateway {
  created: PayoutRequest[] = []
  async createPayout(req: PayoutRequest) {
    await new Promise((r) => setTimeout(r, 10))
    this.created.push(req)
    return { batchId: `BATCH-${this.created.length}`, batchStatus: 'PENDING' }
  }
  async getPayoutBatch(): Promise<never> {
    throw new Error('not used')
  }
}

describe.skipIf(!url)('caregiver', async () => {
  const { db, pool } = createDb(url!)
  await migrate(db, { migrationsFolder: './drizzle' })
  let paypal: FakePayPal

  beforeEach(async () => {
    await seedDemo(db)
    paypal = new FakePayPal()
  })
  afterAll(() => pool.end())

  async function held(payeeName: string, payeeEmail: string | null, amountCents = 35000) {
    const [p] = await db
      .insert(payments)
      .values({ seniorId: DEMO_SENIOR_ID, payeeName, payeeEmail, amountCents, status: 'held', riskLevel: 'high' })
      .returning()
    return p
  }
  const load = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0]

  describe('approve', () => {
    it("demo 2: approving Joe's held payment sends it", async () => {
      const p = await held("Joe's Plumbing", 'joe@example.com')
      const approved = await approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal)
      expect(approved).toMatchObject({ status: 'sending', paypalBatchId: 'BATCH-1', decidedAt: expect.any(Date) })
      expect(paypal.created[0]).toMatchObject({ receiverEmail: 'joe@example.com', amountCents: 35000 })
    })

    it('requires a PayPal email for a new payee, and uses the one given', async () => {
      const p = await held('Kevin', null, 45000)
      await expect(approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal)).rejects.toThrow('Add a PayPal email')
      expect((await load(p.id)).status).toBe('held')

      await expect(approvePayment(db, DEMO_SENIOR_ID, p.id, { payeeEmail: 'not an email' }, paypal)).rejects.toThrow(
        'doesn’t look right',
      )
      const ok = await approvePayment(db, DEMO_SENIOR_ID, p.id, { payeeEmail: ' Kevin@Example.com ' }, paypal)
      expect(ok).toMatchObject({ status: 'sending', payeeEmail: 'kevin@example.com' })
    })

    it('can add the payee to the trusted list while approving', async () => {
      const p = await held('Grace Thompson', null, 4000)
      await approvePayment(
        db,
        DEMO_SENIOR_ID,
        p.id,
        { payeeEmail: 'grace@example.com', addToTrusted: { relationship: 'Church friend' } },
        paypal,
      )
      const [grace] = await db.select().from(trustedPayees).where(eq(trustedPayees.name, 'Grace Thompson'))
      expect(grace).toMatchObject({ relationship: 'Church friend', paypalEmail: 'grace@example.com' })
      expect((await load(p.id)).trustedPayeeId).toBe(grace.id)
    })

    it('approving twice at once pays once', async () => {
      const p = await held("Joe's Plumbing", 'joe@example.com')
      const results = await Promise.allSettled([
        approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal),
        approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(paypal.created).toHaveLength(1)
    })

    it.each(['declined', 'sent', 'cancelled'] as const)('refuses to approve a %s payment', async (status) => {
      const p = await held("Joe's Plumbing", 'joe@example.com')
      await db.update(payments).set({ status }).where(eq(payments.id, p.id))
      await expect(approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal)).rejects.toBeInstanceOf(PaymentStateError)
      expect(paypal.created).toHaveLength(0)
    })

    it("refuses another senior's payment", async () => {
      const p = await held("Joe's Plumbing", 'joe@example.com')
      await expect(approvePayment(db, '00000000-0000-4000-8000-0000000000ff', p.id, {}, paypal)).rejects.toThrow(
        'not found',
      )
    })
  })

  describe('decline', () => {
    it('demo 3: declining Kevin cancels it and queues a gentle notice for Margaret', async () => {
      const p = await held('Kevin', null, 45000)
      expect(await declinePayment(db, DEMO_SENIOR_ID, p.id)).toMatchObject({ status: 'declined' })
      expect(paypal.created).toHaveLength(0)

      const notices = await pendingNotices(db, DEMO_SENIOR_ID)
      expect(notices).toEqual([{ id: p.id, payeeName: 'Kevin', amountCents: 45000, status: 'declined' }])
      await acknowledgeNotices(db, DEMO_SENIOR_ID, [p.id])
      expect(await pendingNotices(db, DEMO_SENIOR_ID)).toEqual([])
    })

    it('cannot decline something already sent', async () => {
      const p = await held("Joe's Plumbing", 'joe@example.com')
      await approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal)
      await expect(declinePayment(db, DEMO_SENIOR_ID, p.id)).rejects.toThrow('already sending')
    })

    it('approvals also produce a notice; seeded history does not', async () => {
      expect(await pendingNotices(db, DEMO_SENIOR_ID)).toEqual([])
      const p = await held("Joe's Plumbing", 'joe@example.com')
      await approvePayment(db, DEMO_SENIOR_ID, p.id, {}, paypal)
      expect((await pendingNotices(db, DEMO_SENIOR_ID)).map((n) => n.status)).toEqual(['sending'])
    })
  })

  describe('views', () => {
    it('lists payments newest first, without unconfirmed drafts', async () => {
      await db.insert(payments).values({
        seniorId: DEMO_SENIOR_ID,
        payeeName: 'Draft',
        amountCents: 100,
        status: 'awaiting_confirmation',
        riskLevel: 'low',
      })
      const list = await listPayments(db, DEMO_SENIOR_ID)
      expect(list.map((p) => p.payeeName)).not.toContain('Draft')
      expect(list[0].payeeName).toBe('Linda Park') // seeded 2 days ago, the newest
    })

    it('returns the transcript with the payment detail', async () => {
      const [maria] = (await listPayments(db, DEMO_SENIOR_ID)).filter((p) => p.payeeName === 'Maria Adams')
      const detail = await getPaymentDetail(db, DEMO_SENIOR_ID, maria.id)
      expect(detail?.transcript.map((t) => t.role)).toEqual(['senior', 'haven', 'senior', 'haven'])
    })
  })

  describe('rules', () => {
    it('saves settings and syncs the trusted list (edit, add, remove)', async () => {
      const { settings, payees } = await getRules(db, DEMO_SENIOR_ID)
      const [maria, joe] = payees
      const input = RulesSchema.parse({
        settings: {
          ...settings,
          maxSinglePaymentCents: 40000,
          newPayeeMode: 'over_amount',
          newPayeeThresholdCents: 5000,
        },
        payees: [
          { id: maria.id, name: 'Maria Adams', relationship: 'Granddaughter', paypalEmail: 'MARIA@new.example.com' },
          {
            id: joe.id,
            name: joe.name,
            relationship: joe.relationship,
            paypalEmail: joe.paypalEmail,
            aliases: joe.aliases,
          },
          { name: 'Grace Thompson', relationship: 'Church friend', paypalEmail: '' },
        ],
      })
      const saved = await saveRules(db, DEMO_SENIOR_ID, input)
      expect(saved.settings).toMatchObject({ maxSinglePaymentCents: 40000, newPayeeMode: 'over_amount' })
      expect(saved.payees.map((p) => p.name)).toEqual(['Maria Adams', "Joe's Plumbing", 'Grace Thompson'])
      expect(saved.payees[0].paypalEmail).toBe('maria@new.example.com')
      expect(saved.payees[2].paypalEmail).toBeNull()
    })

    it('new limits take effect in the rules engine immediately', async () => {
      const { settings, payees } = await getRules(db, DEMO_SENIOR_ID)
      const joe = payees.find((p) => p.name === "Joe's Plumbing")!
      const before = await checkPaymentRules(db, {
        seniorId: DEMO_SENIOR_ID,
        amountCents: 35000,
        payeeName: joe.name,
        trustedPayeeId: joe.id,
      })
      expect(before.verdict).toBe('HOLD')
      await saveRules(
        db,
        DEMO_SENIOR_ID,
        RulesSchema.parse({
          settings: { ...settings, maxSinglePaymentCents: 50000, dailyLimitCents: 100000 },
          payees,
        }),
      )
      const after = await checkPaymentRules(db, {
        seniorId: DEMO_SENIOR_ID,
        amountCents: 35000,
        payeeName: joe.name,
        trustedPayeeId: joe.id,
      })
      expect(after.verdict).toBe('PASS')
    })

    it.each([
      ['negative limit', { maxSinglePaymentCents: -1 }],
      ['fractional cents', { dailyLimitCents: 10.5 }],
      ['zero rapid count', { rapidMaxCount: 0 }],
      ['unknown mode', { newPayeeMode: 'never' }],
    ])('rejects %s', async (_, bad) => {
      const { settings } = await getRules(db, DEMO_SENIOR_ID)
      expect(RulesSchema.safeParse({ settings: { ...settings, ...bad }, payees: [] }).success).toBe(false)
    })

    it('rejects a bad payee email', () => {
      const settings = {
        maxSinglePaymentCents: 1,
        dailyLimitCents: 1,
        newPayeeMode: 'always',
        newPayeeThresholdCents: 1,
        rapidMaxCount: 1,
        rapidWindowMinutes: 1,
      }
      expect(RulesSchema.safeParse({ settings, payees: [{ name: 'X', paypalEmail: 'nope' }] }).success).toBe(false)
    })
  })
})
