// Sends Haven payments through PayPal Payouts and keeps their status in sync.

import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { payments, seniors, type Payment } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { PayPalError } from '@/lib/paypal/client'
import {
  createPayout,
  getPayoutBatch,
  havenStatusForItem,
  type PayoutBatch,
  type PayoutRequest,
} from '@/lib/paypal/payouts'

export interface PayoutGateway {
  createPayout(req: PayoutRequest): Promise<{ batchId: string; batchStatus: string }>
  getPayoutBatch(batchId: string): Promise<PayoutBatch>
}

export const paypalGateway: PayoutGateway = { createPayout, getPayoutBatch }

export class PaymentStateError extends Error {
  constructor(
    message: string,
    readonly payment: Payment | null,
  ) {
    super(message)
    this.name = 'PaymentStateError'
  }
}

// Only these can be sent: confirmed by the senior (low risk) or approved by the caregiver.
const SENDABLE = ['awaiting_confirmation', 'approved'] as const

export async function sendPayment(db: Db, paymentId: string, gateway: PayoutGateway = paypalGateway): Promise<Payment> {
  // Atomically claim the payment. Two concurrent taps can't both get past this update.
  const [claimed] = await db
    .update(payments)
    .set({ status: 'sending', paypalError: null, updatedAt: sql`now()` })
    .where(and(eq(payments.id, paymentId), inArray(payments.status, SENDABLE), isNotNull(payments.payeeEmail)))
    .returning()

  if (!claimed) {
    const [current] = await db.select().from(payments).where(eq(payments.id, paymentId))
    if (!current) throw new PaymentStateError('Payment not found', null)
    if (current.status === 'sending' || current.status === 'sent') return current // already on its way
    if (!current.payeeEmail) throw new PaymentStateError('This payee has no PayPal email yet', current)
    throw new PaymentStateError(`Payment is ${current.status} and can't be sent`, current)
  }

  const [senior] = await db.select({ name: seniors.name }).from(seniors).where(eq(seniors.id, claimed.seniorId))
  const request: PayoutRequest = {
    paymentId: claimed.id,
    receiverEmail: claimed.payeeEmail!,
    amountCents: claimed.amountCents,
    currency: claimed.currency,
    senderName: senior?.name ?? 'Haven',
    note: claimed.purpose
      ? `${formatCents(claimed.amountCents)} for ${claimed.purpose}, sent with Haven`
      : `${formatCents(claimed.amountCents)} sent with Haven`,
  }

  let result: { batchId: string; batchStatus: string }
  try {
    result = await gateway.createPayout(request)
  } catch (err) {
    // Network errors and 5xx may hide a payout PayPal did accept. Retrying is safe: the same
    // sender_batch_id can't create a second batch, and a duplicate returns the original.
    const retryable = !(err instanceof PayPalError) || err.status === 0 || err.status >= 500
    try {
      if (!retryable) throw err
      result = await gateway.createPayout(request)
    } catch (finalErr) {
      const [failed] = await db
        .update(payments)
        .set({ status: 'failed', paypalError: errorMessage(finalErr), updatedAt: sql`now()` })
        .where(eq(payments.id, claimed.id))
        .returning()
      return failed
    }
  }

  const [sending] = await db
    .update(payments)
    .set({ paypalBatchId: result.batchId, paypalStatus: result.batchStatus, updatedAt: sql`now()` })
    .where(eq(payments.id, claimed.id))
    .returning()
  return sending
}

// Pulls the batch from PayPal and applies the item's status. PayPal is the source of truth, so
// duplicate or out-of-order webhooks are harmless: this can run any number of times.
export async function reconcileBatch(
  db: Db,
  batchId: string,
  gateway: PayoutGateway = paypalGateway,
): Promise<Payment[]> {
  const batch = await gateway.getPayoutBatch(batchId)
  const rows = await db.select().from(payments).where(eq(payments.paypalBatchId, batchId))
  const updated: Payment[] = []

  for (const payment of rows) {
    const item = batch.items.find((i) => i.senderItemId === payment.id) ?? batch.items[0]
    const paypalStatus = item?.transactionStatus ?? batch.batchStatus
    let target = item ? havenStatusForItem(item.transactionStatus) : null
    if (!item && batch.batchStatus === 'DENIED') target = 'failed'

    // Never move backwards: only sending → sent/failed, or sent → failed (returned/refunded).
    let status = payment.status
    if (target === 'sent' && payment.status === 'sending') status = 'sent'
    if (target === 'failed' && (payment.status === 'sending' || payment.status === 'sent')) status = 'failed'

    const changed =
      status !== payment.status ||
      paypalStatus !== payment.paypalStatus ||
      (item && item.payoutItemId !== payment.paypalItemId)
    if (!changed) continue

    const [row] = await db
      .update(payments)
      .set({
        status,
        paypalStatus,
        paypalItemId: item?.payoutItemId ?? payment.paypalItemId,
        paypalError: status === 'failed' ? (item?.error ?? `PayPal status ${paypalStatus}`) : payment.paypalError,
        sentAt: status === 'sent' && !payment.sentAt ? new Date() : payment.sentAt,
        updatedAt: sql`now()`,
      })
      .where(eq(payments.id, payment.id))
      .returning()
    updated.push(row)
  }
  return updated
}

// Fallback for when webhooks can't reach us (local dev, a missed delivery): poll in-flight payouts.
export async function reconcileInFlight(db: Db, gateway: PayoutGateway = paypalGateway): Promise<Payment[]> {
  const inFlight = await db
    .selectDistinct({ batchId: payments.paypalBatchId })
    .from(payments)
    .where(and(eq(payments.status, 'sending'), isNotNull(payments.paypalBatchId)))
  const updated: Payment[] = []
  for (const { batchId } of inFlight) {
    try {
      updated.push(...(await reconcileBatch(db, batchId!, gateway)))
    } catch (err) {
      console.error(`Reconcile failed for batch ${batchId}:`, errorMessage(err))
    }
  }
  return updated
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
