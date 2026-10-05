// Integration test: multi-turn conversations end to end (Postgres + scripted AI + fake PayPal).
// Runs only when TEST_DATABASE_URL is set (the database is wiped).

import 'dotenv/config'
import { asc, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { StructuredCall } from '@/lib/ai/llm'
import { handleTurn, type TurnInput } from '@/lib/conversation/service'
import { createDb } from '@/lib/db/client'
import { conversations, messages, payments } from '@/lib/db/schema'
import { seedDemo } from '@/lib/db/seed'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import type { PayoutGateway } from '@/lib/payments/payouts-service'
import type { PayoutRequest } from '@/lib/paypal/payouts'

const url = process.env.TEST_DATABASE_URL

type Parse = { payee_name: string | null; amount: number | null; amount_quote: string | null; purpose?: string | null }
type Risk = { risk_level: 'low' | 'medium' | 'high'; next_question?: string | null; signals?: string[] }

// Scripted AI: parse and risk answers are queued per test, in order.
class ScriptedAI {
  parses: (Parse | Error)[] = []
  risks: Risk[] = []
  call: StructuredCall = async (req) => {
    if (req.schemaName === 'payment_request') {
      const next = this.parses.shift()
      if (!next) throw new Error('No scripted parse left')
      if (next instanceof Error) throw next
      return { is_payment_request: true, purpose: null, clarifying_question: null, ...next }
    }
    const r = this.risks.shift() ?? { risk_level: 'low' }
    return { reason: `AI says ${r.risk_level}.`, signals: [], next_question: null, ...r }
  }
}

class FakePayPal implements PayoutGateway {
  created: PayoutRequest[] = []
  async createPayout(req: PayoutRequest) {
    this.created.push(req)
    return { batchId: `BATCH-${this.created.length}`, batchStatus: 'PENDING' }
  }
  async getPayoutBatch(): Promise<never> {
    throw new Error('not used')
  }
}

describe.skipIf(!url)('conversations', async () => {
  const { db, pool } = createDb(url!)
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date('2026-10-04T17:00:00Z')
  let ai: ScriptedAI
  let paypal: FakePayPal

  beforeEach(async () => {
    await seedDemo(db, now)
    ai = new ScriptedAI()
    paypal = new FakePayPal()
  })
  afterAll(() => pool.end())

  const turn = (input: Omit<TurnInput, 'seniorId'>) =>
    handleTurn(db, { seniorId: DEMO_SENIOR_ID, ...input }, { call: ai.call, gateway: paypal, now })
  const transcript = async (conversationId: string) =>
    (
      await db
        .select({ role: messages.role, text: messages.text })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt))
    ).map((m) => `${m.role}: ${m.text}`)
  const paymentRow = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0]

  it('demo 1: Maria $85 → confirm → yes → sent to PayPal', async () => {
    ai.parses = [{ payee_name: 'Maria', amount: 85, amount_quote: '$85', purpose: 'groceries' }]
    const first = await turn({ text: 'Send Maria $85 for groceries' })
    expect(first).toMatchObject({
      reply: 'Send $85 to Maria for groceries?',
      stage: 'awaiting_confirmation',
      payment: { payeeName: 'Maria Adams', amountCents: 8500, status: 'awaiting_confirmation' },
    })

    const second = await turn({ conversationId: first.conversationId, action: 'confirm' })
    expect(second).toMatchObject({
      reply: 'Done. $85 is on its way to Maria Adams.',
      stage: 'done',
      payment: { status: 'sending' },
    })
    expect(paypal.created).toHaveLength(1)
    expect(await paymentRow(second.payment!.id)).toMatchObject({
      riskLevel: 'low',
      aiRiskLevel: 'low',
      paypalBatchId: 'BATCH-1',
      conversationId: first.conversationId,
    })
    expect(await transcript(first.conversationId)).toEqual([
      'senior: Send Maria $85 for groceries',
      'haven: Send $85 to Maria for groceries?',
      'senior: Yes, send it.',
      'haven: Done. $85 is on its way to Maria Adams.',
    ])
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, first.conversationId))
    expect(conv.status).toBe('completed')
  })

  it('accepts a spoken yes, and re-asks on an unclear answer', async () => {
    ai.parses = [{ payee_name: 'Maria', amount: 85, amount_quote: '$85' }]
    const first = await turn({ text: 'Send Maria $85' })
    const unclear = await turn({ conversationId: first.conversationId, text: 'hmm what' })
    expect(unclear).toMatchObject({
      reply: 'Should I send $85 to Maria Adams? Please say yes or no.',
      stage: 'awaiting_confirmation',
    })
    expect(paypal.created).toHaveLength(0)
    const yes = await turn({ conversationId: first.conversationId, text: 'Yes please' })
    expect(yes.stage).toBe('done')
    expect(paypal.created).toHaveLength(1)
  })

  it('a spoken no cancels without paying', async () => {
    ai.parses = [{ payee_name: 'Maria', amount: 85, amount_quote: '$85' }]
    const first = await turn({ text: 'Send Maria $85' })
    const no = await turn({ conversationId: first.conversationId, text: "No, don't" })
    expect(no).toMatchObject({ reply: "Okay, I won't send it.", stage: 'done', payment: { status: 'cancelled' } })
    expect(paypal.created).toHaveLength(0)
  })

  it('confirming twice pays once', async () => {
    ai.parses = [{ payee_name: 'Maria', amount: 85, amount_quote: '$85' }]
    const first = await turn({ text: 'Send Maria $85' })
    await Promise.all([
      turn({ conversationId: first.conversationId, action: 'confirm' }),
      turn({ conversationId: first.conversationId, action: 'confirm' }),
    ])
    expect(paypal.created).toHaveLength(1)
  })

  it("demo 2: Joe's Plumbing $350 → held, nothing sent", async () => {
    ai.parses = [{ payee_name: "Joe's Plumbing", amount: 350, amount_quote: '$350' }]
    const r = await turn({ text: "Pay Joe's Plumbing $350" })
    expect(r).toMatchObject({
      reply: "I've asked Sarah to take a look before this goes out.",
      stage: 'done',
      payment: { status: 'held', amountCents: 35000 },
    })
    const row = await paymentRow(r.payment!.id)
    expect(row.rulesTriggered.map((t) => t.code)).toEqual(['MAX_SINGLE', 'DAILY_LIMIT'])
    expect(row.riskLevel).toBe('high')
    expect(paypal.created).toHaveLength(0)
  })

  it('demo 3: Kevin bail → held with the AI reason and no PayPal email', async () => {
    ai.parses = [{ payee_name: 'Kevin', amount: 450, amount_quote: '$450', purpose: 'bail' }]
    ai.risks = [{ risk_level: 'high', signals: ['impersonation', 'secrecy'] }]
    const r = await turn({ text: 'My grandson Kevin is in jail and needs $450 for bail, he said not to tell anyone' })
    const row = await paymentRow(r.payment!.id)
    expect(row).toMatchObject({
      status: 'held',
      payeeName: 'Kevin',
      payeeEmail: null,
      trustedPayeeId: null,
      aiRiskLevel: 'high',
      aiSignals: ['impersonation', 'secrecy'],
    })
    expect(row.reason).toContain('AI says high.')
  })

  it('asks for a missing amount, then continues', async () => {
    ai.parses = [
      { payee_name: 'Linda', amount: null, amount_quote: null },
      { payee_name: 'Linda', amount: 40, amount_quote: '$40' },
    ]
    const first = await turn({ text: 'I need to pay Linda' })
    expect(first).toMatchObject({
      reply: 'How much would you like to send to Linda?',
      stage: 'collecting',
      payment: null,
    })
    const second = await turn({ conversationId: first.conversationId, text: '$40' })
    expect(second).toMatchObject({ reply: 'Send $40 to Linda?', stage: 'awaiting_confirmation' })
  })

  it('medium risk asks follow-ups, then escalates to a hold after two', async () => {
    const grace = { payee_name: 'Grace', amount: 40, amount_quote: '$40', purpose: 'bake sale' }
    ai.parses = [grace, grace, grace]
    ai.risks = [
      { risk_level: 'medium', next_question: 'Is Grace someone you know from church?' },
      { risk_level: 'medium', next_question: 'Have you met her in person?' },
      { risk_level: 'medium', next_question: 'Anything else?' },
    ]
    // Grace is a new payee, so allow new payees under $200 for this test.
    const { ruleSettings } = await import('@/lib/db/schema')
    await db.update(ruleSettings).set({ newPayeeMode: 'over_amount' })

    const a = await turn({ text: 'Send Grace $40 for the bake sale' })
    expect(a).toMatchObject({ reply: 'Is Grace someone you know from church?', stage: 'collecting' })
    const b = await turn({ conversationId: a.conversationId, text: 'I think so' })
    expect(b).toMatchObject({ reply: 'Have you met her in person?', stage: 'collecting' })
    const c = await turn({ conversationId: a.conversationId, text: 'Not really' })
    expect(c).toMatchObject({
      reply: "I've asked Sarah to take a look before this goes out.",
      payment: { status: 'held' },
    })
    expect((await paymentRow(c.payment!.id)).reason).toContain('Still unclear after 2 follow-up questions')
  })

  it('medium then low after an answer → still held, because a new payee has no PayPal email', async () => {
    const grace = { payee_name: 'Grace', amount: 40, amount_quote: '$40' }
    ai.parses = [grace, grace]
    ai.risks = [{ risk_level: 'medium', next_question: 'Do you know Grace from church?' }, { risk_level: 'low' }]
    const { ruleSettings } = await import('@/lib/db/schema')
    await db.update(ruleSettings).set({ newPayeeMode: 'over_amount' })
    const a = await turn({ text: 'Send Grace $40' })
    const b = await turn({ conversationId: a.conversationId, text: 'Yes, from choir, for years' })
    expect(b).toMatchObject({
      reply: "I've asked Sarah to take a look before this goes out.",
      payment: { status: 'held' },
    })
    const row = await paymentRow(b.payment!.id)
    expect(row).toMatchObject({ riskLevel: 'low', payeeEmail: null })
    expect(row.reason).toContain("Haven doesn't have a PayPal email for Grace yet.")
  })

  it('re-checks the rules at confirmation time', async () => {
    ai.parses = [{ payee_name: 'Maria', amount: 85, amount_quote: '$85' }]
    const first = await turn({ text: 'Send Maria $85' })
    // Meanwhile another payment uses up most of today's limit.
    await db.insert(payments).values({
      seniorId: DEMO_SENIOR_ID,
      payeeName: 'Linda Park',
      amountCents: 25000,
      status: 'held',
      riskLevel: 'high',
      createdAt: new Date(now.getTime() - 60_000),
    })
    const r = await turn({ conversationId: first.conversationId, action: 'confirm' })
    expect(r).toMatchObject({
      reply: "I've asked Sarah to take a look before this goes out.",
      payment: { status: 'held' },
    })
    expect(paypal.created).toHaveLength(0)
  })

  it('says sorry and keeps the draft when parsing fails', async () => {
    ai.parses = [new Error('model timeout'), { payee_name: 'Maria', amount: 85, amount_quote: '$85' }]
    const a = await turn({ text: 'Send Maria $85' })
    expect(a).toMatchObject({ reply: "Sorry, I didn't catch that. Could you say it again?", stage: 'collecting' })
    const b = await turn({ conversationId: a.conversationId, text: 'Send Maria $85' })
    expect(b.stage).toBe('awaiting_confirmation')
  })

  it('starting over cancels an unconfirmed payment from before', async () => {
    ai.parses = [
      { payee_name: 'Maria', amount: 85, amount_quote: '$85' },
      { payee_name: 'Linda', amount: 20, amount_quote: '$20' },
    ]
    const first = await turn({ text: 'Send Maria $85' })
    const second = await turn({ text: 'Send Linda $20' })
    expect(second.conversationId).not.toBe(first.conversationId)
    expect((await paymentRow(first.payment!.id)).status).toBe('cancelled')
  })

  it('cancel while collecting stops cleanly', async () => {
    ai.parses = [{ payee_name: 'Linda', amount: null, amount_quote: null }]
    const a = await turn({ text: 'Pay Linda' })
    const b = await turn({ conversationId: a.conversationId, action: 'cancel' })
    expect(b).toMatchObject({ reply: "Okay, I've stopped. Nothing was sent.", stage: 'done', payment: null })
  })

  it('ignores a conversation id that belongs to someone else', async () => {
    ai.parses = [{ payee_name: 'Maria', amount: 85, amount_quote: '$85' }]
    const r = await turn({ conversationId: '00000000-0000-4000-8000-0000000000aa', text: 'Send Maria $85' })
    expect(r.conversationId).not.toBe('00000000-0000-4000-8000-0000000000aa')
  })
})
