// Layer 1: deterministic rules. No AI, no I/O. Everything it needs is passed in,
// so the result depends only on the caregiver's settings and payment history.

import { COUNTED_STATUSES, type NewPayeeMode, type PaymentStatus, type RuleHit } from '@/lib/domain'
import { formatCents } from '@/lib/money'
import type { ScamMatch } from '@/lib/scam'

export interface RuleSettings {
  maxSinglePaymentCents: number
  dailyLimitCents: number
  newPayeeMode: NewPayeeMode
  newPayeeThresholdCents: number
  rapidMaxCount: number
  rapidWindowMinutes: number
}

export interface PriorPayment {
  amountCents: number
  status: PaymentStatus
  createdAt: Date
}

export interface RulesInput {
  amountCents: number
  payeeName: string
  isTrusted: boolean
  scamMatch: ScamMatch | null
  settings: RuleSettings
  priorPayments: PriorPayment[]
  seniorName: string
  timeZone: string
  now: Date
}

export type RulesVerdict = 'PASS' | 'HOLD'

export interface RulesResult {
  verdict: RulesVerdict
  triggered: RuleHit[]
}

export function evaluateRules(input: RulesInput): RulesResult {
  const { amountCents, payeeName, settings, seniorName, now } = input
  const triggered: RuleHit[] = []

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    // Fail closed: a malformed amount should never reach PayPal without a human.
    triggered.push({ code: 'INVALID_AMOUNT', message: 'The payment amount could not be read clearly.' })
    return { verdict: 'HOLD', triggered }
  }

  if (input.scamMatch) {
    const note = input.scamMatch.note ? ` (${input.scamMatch.note})` : ''
    triggered.push({
      code: 'SCAM_LIST',
      message: `${payeeName} matches a known scam ${input.scamMatch.matchedOn}${note}.`,
    })
  }

  if (!input.isTrusted) {
    if (settings.newPayeeMode === 'always') {
      triggered.push({
        code: 'NEW_PAYEE',
        message: `${payeeName} isn't on ${seniorName}'s trusted list, and you asked to review all new payees.`,
      })
    } else if (amountCents > settings.newPayeeThresholdCents) {
      triggered.push({
        code: 'NEW_PAYEE',
        message: `${payeeName} isn't on ${seniorName}'s trusted list and the amount is over ${formatCents(settings.newPayeeThresholdCents)}.`,
      })
    }
  }

  if (amountCents > settings.maxSinglePaymentCents) {
    triggered.push({
      code: 'MAX_SINGLE',
      message: `${formatCents(amountCents)} is over the ${formatCents(settings.maxSinglePaymentCents)} single-payment limit.`,
    })
  }

  const counted = input.priorPayments.filter((p) => COUNTED_STATUSES.includes(p.status))

  const today = localDate(now, input.timeZone)
  const spentToday = counted
    .filter((p) => localDate(p.createdAt, input.timeZone) === today)
    .reduce((sum, p) => sum + p.amountCents, 0)
  if (spentToday + amountCents > settings.dailyLimitCents) {
    triggered.push({
      code: 'DAILY_LIMIT',
      message: `This would bring today's total to ${formatCents(spentToday + amountCents)}, over the ${formatCents(settings.dailyLimitCents)} daily limit.`,
    })
  }

  const windowStart = now.getTime() - settings.rapidWindowMinutes * 60_000
  const recentCount = counted.filter((p) => p.createdAt.getTime() > windowStart).length
  if (recentCount >= settings.rapidMaxCount) {
    triggered.push({
      code: 'RAPID_PAYMENTS',
      message: `This would be payment number ${recentCount + 1} in ${describeWindow(settings.rapidWindowMinutes)} (limit is ${settings.rapidMaxCount}).`,
    })
  }

  return { verdict: triggered.length > 0 ? 'HOLD' : 'PASS', triggered }
}

// Calendar date (YYYY-MM-DD) in the given time zone.
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function describeWindow(minutes: number): string {
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`
  return `${minutes} minutes`
}
