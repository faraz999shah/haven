import { z } from 'zod'

export const ParseSchema = z.object({
  is_payment_request: z.boolean(),
  payee_name: z.string().nullable(),
  amount: z.number().nullable(),
  purpose: z.string().nullable(),
  clarifying_question: z.string().nullable(),
})
export type ParseOutput = z.infer<typeof ParseSchema>

export const RISK_SIGNALS = [
  'urgency',
  'secrecy',
  'impersonation',
  'gift_cards',
  'crypto',
  'wire_or_unusual_method',
  'third_party_pressure',
  'never_met_in_person',
  'prize_or_lottery',
  'unknown_payee',
  'unusual_amount',
] as const
export type RiskSignal = (typeof RISK_SIGNALS)[number]

export const RiskSchema = z.object({
  risk_level: z.enum(['low', 'medium', 'high']),
  reason: z.string().min(1).max(1000),
  signals: z.array(z.enum(RISK_SIGNALS)).max(RISK_SIGNALS.length),
  next_question: z.string().max(300).nullable(),
})
export type RiskAssessment = z.infer<typeof RiskSchema>
