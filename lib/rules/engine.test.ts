import { describe, expect, it } from 'vitest'
import type { PaymentStatus } from '@/lib/domain'
import { evaluateRules, localDate, type PriorPayment, type RulesInput } from './engine'

// Noon in New York on Oct 4 2026 (EDT, UTC-4).
const NOW = new Date('2026-10-04T16:00:00Z')
const MIN = 60_000

function input(overrides: Partial<RulesInput> = {}): RulesInput {
  return {
    amountCents: 8500,
    payeeName: 'Maria Adams',
    isTrusted: true,
    scamMatch: null,
    settings: {
      maxSinglePaymentCents: 20000,
      dailyLimitCents: 30000,
      newPayeeMode: 'always',
      newPayeeThresholdCents: 20000,
      rapidMaxCount: 3,
      rapidWindowMinutes: 60,
    },
    priorPayments: [],
    seniorName: 'Margaret',
    timeZone: 'America/New_York',
    now: NOW,
    ...overrides,
  }
}

function prior(amountCents: number, minutesAgo: number, status: PaymentStatus = 'sent'): PriorPayment {
  return { amountCents, status, createdAt: new Date(NOW.getTime() - minutesAgo * MIN) }
}

const codes = (r: ReturnType<typeof evaluateRules>) => r.triggered.map((t) => t.code)

describe('evaluateRules', () => {
  it('passes a routine payment to a trusted payee within limits', () => {
    const r = evaluateRules(input())
    expect(r).toEqual({ verdict: 'PASS', triggered: [] })
  })

  describe('max single payment', () => {
    it('holds a payment over the limit, even to a trusted payee', () => {
      const r = evaluateRules(input({ payeeName: "Joe's Plumbing", amountCents: 35000 }))
      expect(r.verdict).toBe('HOLD')
      expect(codes(r)).toContain('MAX_SINGLE')
      expect(r.triggered.find((t) => t.code === 'MAX_SINGLE')!.message).toBe(
        '$350 is over the $200 single-payment limit.',
      )
    })

    it('allows a payment exactly at the limit', () => {
      expect(codes(evaluateRules(input({ amountCents: 20000 })))).not.toContain('MAX_SINGLE')
    })

    it('holds one cent over the limit', () => {
      expect(codes(evaluateRules(input({ amountCents: 20001 })))).toContain('MAX_SINGLE')
    })
  })

  describe('new payee rule', () => {
    it('"always ask me" holds any untrusted payee, however small', () => {
      const r = evaluateRules(input({ payeeName: 'Kevin', isTrusted: false, amountCents: 100 }))
      expect(r.verdict).toBe('HOLD')
      expect(codes(r)).toEqual(['NEW_PAYEE'])
    })

    it('"ask me only if over $X" passes an untrusted payee at or under the threshold', () => {
      const settings = { ...input().settings, newPayeeMode: 'over_amount' as const, newPayeeThresholdCents: 5000 }
      expect(evaluateRules(input({ isTrusted: false, amountCents: 5000, settings })).verdict).toBe('PASS')
    })

    it('"ask me only if over $X" holds an untrusted payee over the threshold', () => {
      const settings = { ...input().settings, newPayeeMode: 'over_amount' as const, newPayeeThresholdCents: 5000 }
      expect(codes(evaluateRules(input({ isTrusted: false, amountCents: 5001, settings })))).toEqual(['NEW_PAYEE'])
    })

    it('does not apply to trusted payees', () => {
      expect(codes(evaluateRules(input({ isTrusted: true })))).not.toContain('NEW_PAYEE')
    })
  })

  describe('daily limit', () => {
    it('holds when this payment would push today over the limit', () => {
      const r = evaluateRules(input({ amountCents: 8500, priorPayments: [prior(15000, 180), prior(7000, 120)] }))
      expect(codes(r)).toEqual(['DAILY_LIMIT'])
      expect(r.triggered[0].message).toContain("today's total to $305")
    })

    it('allows reaching the limit exactly', () => {
      const r = evaluateRules(input({ amountCents: 10000, priorPayments: [prior(20000, 180)] }))
      expect(r.verdict).toBe('PASS')
    })

    it('counts held, approved and sending payments, not declined, cancelled, failed or unconfirmed ones', () => {
      const ignored = (['declined', 'cancelled', 'failed', 'awaiting_confirmation'] as const).map((s) =>
        prior(20000, 300, s),
      )
      expect(evaluateRules(input({ priorPayments: ignored })).verdict).toBe('PASS')

      for (const s of ['held', 'approved', 'sending', 'sent'] as const) {
        expect(codes(evaluateRules(input({ priorPayments: [prior(25000, 300, s)] })))).toContain('DAILY_LIMIT')
      }
    })

    it("ignores yesterday's payments", () => {
      // 13 hours ago = 11pm yesterday in New York.
      expect(evaluateRules(input({ priorPayments: [prior(29000, 13 * 60)] })).verdict).toBe('PASS')
    })

    it("uses the senior's time zone for 'today'", () => {
      // 2am UTC Oct 5 is still Oct 4 in New York, so a payment at 2pm UTC Oct 4 is "today".
      const now = new Date('2026-10-05T02:00:00Z')
      const earlier = { amountCents: 25000, status: 'sent' as const, createdAt: new Date('2026-10-04T14:00:00Z') }
      expect(codes(evaluateRules(input({ now, priorPayments: [earlier] })))).toContain('DAILY_LIMIT')
      expect(codes(evaluateRules(input({ now, priorPayments: [earlier], timeZone: 'UTC' })))).not.toContain(
        'DAILY_LIMIT',
      )
    })
  })

  describe('rapid payments', () => {
    const smallRecent = (n: number, status: PaymentStatus = 'sent') =>
      Array.from({ length: n }, (_, i) => prior(100, 5 + i * 5, status))

    it('allows up to the configured number of payments in the window', () => {
      expect(evaluateRules(input({ amountCents: 100, priorPayments: smallRecent(2) })).verdict).toBe('PASS')
    })

    it('holds the payment that would exceed the count', () => {
      const r = evaluateRules(input({ amountCents: 100, priorPayments: smallRecent(3) }))
      expect(codes(r)).toEqual(['RAPID_PAYMENTS'])
      expect(r.triggered[0].message).toBe('This would be payment number 4 in 1 hour (limit is 3).')
    })

    it('ignores payments outside the window', () => {
      const old = [prior(100, 61), prior(100, 90), prior(100, 120)]
      expect(evaluateRules(input({ amountCents: 100, priorPayments: old })).verdict).toBe('PASS')
    })

    it('ignores cancelled and declined attempts', () => {
      const r = evaluateRules(input({ amountCents: 100, priorPayments: [...smallRecent(3, 'cancelled')] }))
      expect(r.verdict).toBe('PASS')
    })
  })

  describe('scam list', () => {
    it('holds a payment to a known scam payee even if trusted and small', () => {
      const r = evaluateRules(
        input({
          payeeName: 'Prize Claim Center',
          amountCents: 500,
          scamMatch: { matchedOn: 'name', value: 'prize claim center', source: 'test', note: 'Lottery scam' },
        }),
      )
      expect(r.verdict).toBe('HOLD')
      expect(codes(r)).toEqual(['SCAM_LIST'])
      expect(r.triggered[0].message).toBe('Prize Claim Center matches a known scam name (Lottery scam).')
    })
  })

  describe('invalid amounts', () => {
    it.each([0, -500, 85.5, Number.NaN])('holds amount %s', (amountCents) => {
      const r = evaluateRules(input({ amountCents }))
      expect(r).toEqual({ verdict: 'HOLD', triggered: [expect.objectContaining({ code: 'INVALID_AMOUNT' })] })
    })
  })

  it('reports every rule that fired, not just the first', () => {
    const r = evaluateRules(
      input({
        payeeName: 'Kevin',
        isTrusted: false,
        amountCents: 45000,
        scamMatch: { matchedOn: 'phone', value: '5550100147', source: 'test' },
        priorPayments: [prior(100, 5), prior(100, 10), prior(100, 15)],
      }),
    )
    expect(codes(r).sort()).toEqual(['DAILY_LIMIT', 'MAX_SINGLE', 'NEW_PAYEE', 'RAPID_PAYMENTS', 'SCAM_LIST'])
  })
})

describe('localDate', () => {
  it('formats the calendar date in a time zone', () => {
    expect(localDate(new Date('2026-10-05T02:00:00Z'), 'America/New_York')).toBe('2026-10-04')
    expect(localDate(new Date('2026-10-05T02:00:00Z'), 'UTC')).toBe('2026-10-05')
  })
})
