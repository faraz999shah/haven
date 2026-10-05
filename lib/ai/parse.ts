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

  const payeeName = text(out.payee_name)
  const seniorWords = transcript
    .filter((t) => t.role === 'senior')
    .map((t) => t.text)
    .join(' ')
  const amountCents =
    out.amount !== null &&
    Number.isFinite(out.amount) &&
    out.amount > 0 &&
    dollarsToCents(out.amount) <= MAX_SANE_CENTS &&
    isAmountGrounded(out.amount, text(out.amount_quote), seniorWords)
      ? dollarsToCents(out.amount)
      : null
  const purpose = isPurposeGrounded(text(out.purpose), seniorWords) ? text(out.purpose) : null
  const modelQuestion = text(out.clarifying_question)
  const draft: PaymentDraft = { payeeName, amountCents, purpose }

  if (!out.is_payment_request && !payeeName && amountCents === null) {
    return {
      kind: 'clarify',
      draft,
      question: modelQuestion || 'I can help you send money. Who would you like to pay?',
    }
  }
  if (!payeeName) {
    return { kind: 'clarify', draft, question: modelQuestion || 'Who would you like to send the money to?' }
  }
  if (amountCents === null) {
    return {
      kind: 'clarify',
      draft,
      question: modelQuestion || `How much would you like to send to ${payeeName}?`,
    }
  }
  return { kind: 'complete', draft: { payeeName, amountCents, purpose } }
}

// Models sometimes write the string "null" (or "") instead of a JSON null.
function text(value: string | null): string | null {
  const t = value?.trim()
  return t && !/^(null|none|n\/a|unknown)$/i.test(t) ? t : null
}

const NUMBER_WORD =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|grand)\b/
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// The model sometimes invents an amount the senior never said. Only accept an amount whose
// quoted words actually appear in the senior's speech, and whose digits (if any) match it.
export function isAmountGrounded(amount: number, quote: string | null, seniorWords: string): boolean {
  if (!quote) return false
  const q = normalize(quote)
  if (!q || !normalize(seniorWords).includes(q)) return false
  const digits = q.match(/\d[\d,]*(\.\d+)?/)
  if (digits) return Math.abs(Number(digits[0].replace(/,/g, '')) - amount) < 0.005
  return NUMBER_WORD.test(q)
}

const FILLER_WORDS = new Set([
  'for',
  'the',
  'a',
  'an',
  'to',
  'of',
  'and',
  'my',
  'her',
  'his',
  'their',
  'some',
  'with',
  'on',
  'in',
])

// The model sometimes invents a purpose (seen live: "fixing the sink" for "send the plumber $20000").
// Keep it only if one of its words, or a close form of one ("fix" / "fixing"), was actually said.
export function isPurposeGrounded(purpose: string | null, seniorWords: string): boolean {
  if (!purpose) return false
  const said = normalize(seniorWords)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter(Boolean)
  const words = normalize(purpose)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w && !FILLER_WORDS.has(w))
  const stem = (w: string) => w.slice(0, Math.max(3, Math.min(w.length, 4)))
  return words.some((w) => said.some((s) => s === w || (s.length >= 3 && w.length >= 3 && stem(s) === stem(w))))
}
