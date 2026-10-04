// Turns what the senior said into a payment draft, or a question asking for what's missing.

import { dollarsToCents } from '@/lib/money'
import { models, openaiStructuredCall, type StructuredCall } from './llm'
import { loadPrompt } from './prompts'
import { ParseSchema } from './schemas'
import { formatTranscript, type TranscriptTurn } from './transcript'

export interface PaymentDraft {
  payeeName: string | null
  amountCents: number | null
  purpose: string | null
}

export type ParseResult =
  | { kind: 'complete'; draft: { payeeName: string; amountCents: number; purpose: string | null } }
  | { kind: 'clarify'; draft: PaymentDraft; question: string }

// Anything above this is almost certainly a mishearing; ask rather than guess.
const MAX_SANE_CENTS = 1_000_000_00

export async function parseRequest(
  transcript: TranscriptTurn[],
  previous: PaymentDraft = { payeeName: null, amountCents: null, purpose: null },
  call: StructuredCall = openaiStructuredCall,
): Promise<ParseResult> {
  const input = [
    'Details already collected:',
    JSON.stringify({
      payee_name: previous.payeeName,
      amount: previous.amountCents === null ? null : previous.amountCents / 100,
      purpose: previous.purpose,
    }),
    '',
    'Conversation so far:',
    formatTranscript(transcript),
  ].join('\n')

  const raw = await call({
    model: models.parse(),
    system: loadPrompt('parse'),
    input,
    schema: ParseSchema,
    schemaName: 'payment_request',
  })
  const out = ParseSchema.parse(raw)

  const payeeName = out.payee_name?.trim() || null
  const amountCents =
    out.amount !== null && Number.isFinite(out.amount) && out.amount > 0 && dollarsToCents(out.amount) <= MAX_SANE_CENTS
      ? dollarsToCents(out.amount)
      : null
  const purpose = out.purpose?.trim() || null
  const draft: PaymentDraft = { payeeName, amountCents, purpose }

  if (!out.is_payment_request && !payeeName && amountCents === null) {
    return {
      kind: 'clarify',
      draft,
      question: out.clarifying_question || 'I can help you send money. Who would you like to pay?',
    }
  }
  if (!payeeName) {
    return { kind: 'clarify', draft, question: out.clarifying_question || 'Who would you like to send the money to?' }
  }
  if (amountCents === null) {
    return {
      kind: 'clarify',
      draft,
      question: out.clarifying_question || `How much would you like to send to ${payeeName}?`,
    }
  }
  return { kind: 'complete', draft: { payeeName, amountCents, purpose } }
}
