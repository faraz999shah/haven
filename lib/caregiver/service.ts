// Caregiver actions and views: approve/decline held payments, payment details, rules and trusted people.

import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/lib/db/client'
import { messages, payments, ruleSettings, trustedPayees, type Payment } from '@/lib/db/schema'
import { paypalGateway, PaymentStateError, sendPayment, type PayoutGateway } from '@/lib/payments/payouts-service'

export { PaymentStateError }

const email = z.string().trim().toLowerCase().email()

export interface ApproveOptions {
  payeeEmail?: string | null // required when the payment has none (new payees)
  addToTrusted?: { relationship: string } | null
}

export async function approvePayment(
  db: Db,
  seniorId: string,
  paymentId: string,
  opts: ApproveOptions = {},
  gateway: PayoutGateway = paypalGateway,
): Promise<Payment> {
  const [current] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.seniorId, seniorId)))
  if (!current) throw new PaymentStateError('Payment not found', null)
  if (current.status !== 'held') throw new PaymentStateError(`This payment is already ${current.status}`, current)

  let payeeEmail = current.payeeEmail
  if (opts.payeeEmail) {
    const parsed = email.safeParse(opts.payeeEmail)
    if (!parsed.success) throw new PaymentStateError('That PayPal email doesn’t look right', current)
    payeeEmail = parsed.data
  }
  if (!payeeEmail) throw new PaymentStateError('Add a PayPal email for this payee before approving', current)

  // held → approved atomically, so two clicks (or two caregivers) can't both approve.
  const [approved] = await db
    .update(payments)
    .set({ status: 'approved', payeeEmail, decidedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(payments.id, paymentId), eq(payments.status, 'held')))
    .returning()
  if (!approved) {
    const [now] = await db.select().from(payments).where(eq(payments.id, paymentId))
    throw new PaymentStateError(`This payment is already ${now?.status}`, now ?? null)
  }

  if (opts.addToTrusted && !approved.trustedPayeeId) {
    const [payee] = await db
      .insert(trustedPayees)
      .values({
        seniorId,
        name: approved.payeeName,
        relationship: opts.addToTrusted.relationship,
        paypalEmail: payeeEmail,
      })
      .returning()
    await db.update(payments).set({ trustedPayeeId: payee.id }).where(eq(payments.id, paymentId))
  }

  return sendPayment(db, paymentId, gateway)
}

export async function declinePayment(db: Db, seniorId: string, paymentId: string): Promise<Payment> {
  const [declined] = await db
    .update(payments)
    .set({ status: 'declined', decidedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(payments.id, paymentId), eq(payments.seniorId, seniorId), eq(payments.status, 'held')))
    .returning()
  if (declined) return declined
  const [current] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.seniorId, seniorId)))
  if (!current) throw new PaymentStateError('Payment not found', null)
  throw new PaymentStateError(`This payment is already ${current.status}`, current)
}

// Everything the caregiver dashboard lists. Unconfirmed drafts are left out: they are not payments yet.
export async function listPayments(db: Db, seniorId: string) {
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.seniorId, seniorId), notInArray(payments.status, ['awaiting_confirmation'])))
    .orderBy(desc(payments.createdAt))
    .limit(500)
}

export async function getPaymentDetail(db: Db, seniorId: string, paymentId: string) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.seniorId, seniorId)))
  if (!payment) return null
  const transcript = payment.conversationId
    ? await db
        .select({ role: messages.role, text: messages.text, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.conversationId, payment.conversationId))
        .orderBy(asc(messages.createdAt))
    : []
  return { payment, transcript }
}

// ---- Senior notices: tell Margaret gently what Sarah decided ----

export async function pendingNotices(db: Db, seniorId: string) {
  return db
    .select({
      id: payments.id,
      payeeName: payments.payeeName,
      amountCents: payments.amountCents,
      status: payments.status,
    })
    .from(payments)
    .where(
      and(
        eq(payments.seniorId, seniorId),
        isNotNull(payments.decidedAt),
        isNull(payments.seniorNotifiedAt),
        inArray(payments.status, ['declined', 'approved', 'sending', 'sent', 'failed']),
      ),
    )
    .orderBy(asc(payments.decidedAt))
}

export async function acknowledgeNotices(db: Db, seniorId: string, ids: string[]) {
  if (ids.length === 0) return
  await db
    .update(payments)
    .set({ seniorNotifiedAt: sql`now()` })
    .where(and(eq(payments.seniorId, seniorId), inArray(payments.id, ids)))
}

// ---- Protection rules ----

export const RulesSchema = z.object({
  settings: z.object({
    maxSinglePaymentCents: z.number().int().min(0).max(10_000_000),
    dailyLimitCents: z.number().int().min(0).max(10_000_000),
    newPayeeMode: z.enum(['always', 'over_amount']),
    newPayeeThresholdCents: z.number().int().min(0).max(10_000_000),
    rapidMaxCount: z.number().int().min(1).max(100),
    rapidWindowMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60),
  }),
  payees: z
    .array(
      z.object({
        id: z.string().uuid().nullish(),
        name: z.string().trim().min(1).max(100),
        relationship: z.string().trim().max(100).default(''),
        paypalEmail: z
          .string()
          .trim()
          .toLowerCase()
          .email()
          .nullish()
          .or(z.literal('').transform(() => null)),
        phone: z.string().trim().max(40).nullish(),
        aliases: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
      }),
    )
    .max(100),
})
export type RulesInput = z.infer<typeof RulesSchema>

export async function getRules(db: Db, seniorId: string) {
  const [settings] = await db.select().from(ruleSettings).where(eq(ruleSettings.seniorId, seniorId))
  const payees = await db
    .select()
    .from(trustedPayees)
    .where(eq(trustedPayees.seniorId, seniorId))
    .orderBy(asc(trustedPayees.createdAt))
  return { settings, payees }
}

// Saves the whole rules page at once: settings, plus the trusted list (added, edited, removed).
export async function saveRules(db: Db, seniorId: string, input: RulesInput) {
  await db.transaction(async (tx) => {
    await tx
      .update(ruleSettings)
      .set({ ...input.settings, updatedAt: sql`now()` })
      .where(eq(ruleSettings.seniorId, seniorId))

    const existing = await tx
      .select({ id: trustedPayees.id })
      .from(trustedPayees)
      .where(eq(trustedPayees.seniorId, seniorId))
    const keep = new Set(input.payees.map((p) => p.id).filter(Boolean))
    const removed = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
    if (removed.length) await tx.delete(trustedPayees).where(inArray(trustedPayees.id, removed))

    for (const p of input.payees) {
      const values = {
        name: p.name,
        relationship: p.relationship,
        paypalEmail: p.paypalEmail ?? null,
        phone: p.phone || null,
        aliases: p.aliases,
      }
      const isExisting = p.id && existing.some((e) => e.id === p.id)
      if (isExisting) {
        await tx
          .update(trustedPayees)
          .set({ ...values, updatedAt: sql`now()` })
          .where(and(eq(trustedPayees.id, p.id!), eq(trustedPayees.seniorId, seniorId)))
      } else {
        await tx.insert(trustedPayees).values({ seniorId, ...values })
      }
    }
  })
  return getRules(db, seniorId)
}
