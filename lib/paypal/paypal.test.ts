import { describe, expect, it } from 'vitest'
import { existingBatchIdFromDuplicateError, havenStatusForItem, senderBatchIdFor } from './payouts'
import { payoutBatchIdFromEvent } from './webhooks'

describe('existingBatchIdFromDuplicateError', () => {
  it('extracts the original batch id from a real sandbox duplicate response', () => {
    const body = {
      name: 'USER_BUSINESS_ERROR',
      message: 'User business error.',
      details: [
        {
          field: 'SENDER_BATCH_ID',
          location: 'body',
          issue: 'Batch with given sender_batch_id already exists',
          link: [
            { href: 'https://api.sandbox.paypal.com/v1/payments/payouts/86VAGPKAJ74YL', rel: 'self', method: 'GET' },
          ],
        },
      ],
      links: [],
    }
    expect(existingBatchIdFromDuplicateError(body)).toBe('86VAGPKAJ74YL')
  })

  it('returns null for other errors', () => {
    expect(
      existingBatchIdFromDuplicateError({ name: 'VALIDATION_ERROR', details: [{ field: 'items[0].receiver' }] }),
    ).toBeNull()
    expect(existingBatchIdFromDuplicateError(null)).toBeNull()
  })
})

describe('havenStatusForItem', () => {
  it.each([
    ['SUCCESS', 'sent'],
    ['FAILED', 'failed'],
    ['RETURNED', 'failed'],
    ['BLOCKED', 'failed'],
    ['REFUNDED', 'failed'],
    ['CANCELED', 'failed'],
    ['DENIED', 'failed'],
    ['PENDING', null],
    ['UNCLAIMED', null],
    ['ONHOLD', null],
    ['SOMETHING_NEW', null],
  ])('%s → %s', (paypal, haven) => {
    expect(havenStatusForItem(paypal)).toBe(haven)
  })
})

describe('payoutBatchIdFromEvent', () => {
  it('reads item events', () => {
    const e = {
      id: 'WH-1',
      event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      resource: { payout_batch_id: 'B1', payout_item_id: 'I1' },
    }
    expect(payoutBatchIdFromEvent(e)).toBe('B1')
  })

  it('reads batch events', () => {
    const e = {
      id: 'WH-2',
      event_type: 'PAYMENT.PAYOUTSBATCH.SUCCESS',
      resource: { batch_header: { payout_batch_id: 'B2' } },
    }
    expect(payoutBatchIdFromEvent(e)).toBe('B2')
  })

  it('returns null for unrelated events', () => {
    expect(
      payoutBatchIdFromEvent({ id: 'WH-3', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'X' } }),
    ).toBeNull()
  })
})

it('uses a stable sender_batch_id per payment', () => {
  expect(senderBatchIdFor('abc')).toBe('haven-abc')
})
