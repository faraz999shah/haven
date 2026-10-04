// Shared domain constants. Kept free of DB/framework imports so pure modules
// (rules engine, combine logic) and the UI can both use them.

export const PAYMENT_STATUSES = [
  'awaiting_confirmation', // low risk, waiting for the senior to say yes
  'held', // waiting for the caregiver
  'approved', // caregiver approved, about to send
  'sending', // payout submitted to PayPal, waiting for webhook
  'sent',
  'failed',
  'declined', // caregiver declined
  'cancelled', // senior said no
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

// Payments that count toward the daily limit and the rapid-payment rule.
// Declined/cancelled/failed money never left, and an unconfirmed payment may never be sent.
export const COUNTED_STATUSES: readonly PaymentStatus[] = ['held', 'approved', 'sending', 'sent']

export const RISK_LEVELS = ['low', 'medium', 'high'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const NEW_PAYEE_MODES = ['always', 'over_amount'] as const
export type NewPayeeMode = (typeof NEW_PAYEE_MODES)[number]

export type RuleCode = 'INVALID_AMOUNT' | 'SCAM_LIST' | 'NEW_PAYEE' | 'MAX_SINGLE' | 'DAILY_LIMIT' | 'RAPID_PAYMENTS'

export interface RuleHit {
  code: RuleCode
  message: string // plain language, shown to the caregiver
}
