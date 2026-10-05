import type { PaymentDraft } from '@/lib/ai/parse'

// Stored in conversations.state between turns.
export type ConversationState =
  | { stage: 'collecting'; draft: PaymentDraft; followUpsAsked: number }
  | { stage: 'awaiting_confirmation'; paymentId: string }
  | { stage: 'done'; paymentId: string | null }

export type Stage = ConversationState['stage']

export const initialState = (): ConversationState => ({
  stage: 'collecting',
  draft: { payeeName: null, amountCents: null, purpose: null },
  followUpsAsked: 0,
})

export function readState(raw: unknown): ConversationState {
  const s = raw as Partial<ConversationState> | null
  if (s?.stage === 'awaiting_confirmation' && typeof s.paymentId === 'string') return s as ConversationState
  if (s?.stage === 'done') return { stage: 'done', paymentId: (s as { paymentId?: string }).paymentId ?? null }
  if (s?.stage === 'collecting' && s.draft) return s as ConversationState
  return initialState()
}
