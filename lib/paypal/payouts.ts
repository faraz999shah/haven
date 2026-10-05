// PayPal Payouts API (v1). One Haven payment = one payout batch with one item.
// Docs: https://developer.paypal.com/docs/api/payments.payouts-batch/v1/

import type { PaymentStatus } from '@/lib/domain'
import { PayPalError, paypalRequest } from './client'

export interface PayoutRequest {
  paymentId: string
  receiverEmail: string
  amountCents: number
  currency: string
  note: string // shown to the recipient
  senderName: string
}

export interface PayoutItemStatus {
  payoutItemId: string
  transactionStatus: string
  senderItemId: string | null
  error: string | null
}

export interface PayoutBatch {
  batchId: string
  batchStatus: string
  items: PayoutItemStatus[]
}

// sender_batch_id is PayPal's idempotency key: the same Haven payment can never create two batches.
export const senderBatchIdFor = (paymentId: string) => `haven-${paymentId}`

export async function createPayout(req: PayoutRequest): Promise<{ batchId: string; batchStatus: string }> {
  const senderBatchId = senderBatchIdFor(req.paymentId)
  try {
    const res = await paypalRequest<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
      'POST',
      '/v1/payments/payouts',
      {
        sender_batch_header: {
          sender_batch_id: senderBatchId,
          recipient_type: 'EMAIL',
          email_subject: `You have a payment from ${req.senderName}`,
          email_message: req.note,
        },
        items: [
          {
            recipient_type: 'EMAIL',
            receiver: req.receiverEmail,
            amount: { value: (req.amountCents / 100).toFixed(2), currency: req.currency },
            note: req.note,
            sender_item_id: req.paymentId,
          },
        ],
      },
    )
    return { batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status }
  } catch (err) {
    // A retry after a lost response: PayPal rejects the duplicate but links the original batch.
    const existing = err instanceof PayPalError ? existingBatchIdFromDuplicateError(err.body) : null
    if (existing) return { batchId: existing, batchStatus: 'PENDING' }
    throw err
  }
}

export function existingBatchIdFromDuplicateError(body: unknown): string | null {
  const details = (body as { details?: { field?: string; link?: { href?: string }[] }[] } | null)?.details ?? []
  for (const d of details) {
    if (d.field !== 'SENDER_BATCH_ID') continue
    const href = d.link?.find((l) => l.href?.includes('/v1/payments/payouts/'))?.href
    const id = href?.split('/v1/payments/payouts/')[1]?.split(/[/?]/)[0]
    if (id) return id
  }
  return null
}

interface RawBatch {
  batch_header: { payout_batch_id: string; batch_status: string }
  items?: {
    payout_item_id: string
    transaction_status: string
    payout_item?: { sender_item_id?: string }
    errors?: { name?: string; message?: string }
  }[]
}

export async function getPayoutBatch(batchId: string): Promise<PayoutBatch> {
  const res = await paypalRequest<RawBatch>('GET', `/v1/payments/payouts/${encodeURIComponent(batchId)}`)
  return {
    batchId: res.batch_header.payout_batch_id,
    batchStatus: res.batch_header.batch_status,
    items: (res.items ?? []).map((i) => ({
      payoutItemId: i.payout_item_id,
      transactionStatus: i.transaction_status,
      senderItemId: i.payout_item?.sender_item_id ?? null,
      error: i.errors ? i.errors.message || i.errors.name || 'Payout failed' : null,
    })),
  }
}

// Maps PayPal's item status to Haven's payment status. null = still in flight, keep "sending".
// UNCLAIMED means the receiver has no PayPal account for that email yet; PayPal returns the
// money after 30 days if unclaimed (RETURNED), so we keep waiting rather than calling it sent.
export function havenStatusForItem(transactionStatus: string): Extract<PaymentStatus, 'sent' | 'failed'> | null {
  switch (transactionStatus) {
    case 'SUCCESS':
      return 'sent'
    case 'FAILED':
    case 'RETURNED':
    case 'REFUNDED':
    case 'REVERSED':
    case 'BLOCKED':
    case 'DENIED':
    case 'CANCELED':
      return 'failed'
    default: // PENDING, UNCLAIMED, ONHOLD, NEW, ...
      return null
  }
}
