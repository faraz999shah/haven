// One assessment pass for a complete payment draft:
// resolve payee → rules engine (Layer 1) + AI risk (Layer 2) → combine → Haven's reply.

import { eq } from 'drizzle-orm'
import { assessRisk, type RiskOutcome } from '@/lib/ai/risk'
import type { StructuredCall } from '@/lib/ai/llm'
import type { TranscriptTurn } from '@/lib/ai/transcript'
import type { Db } from '@/lib/db/client'
import { caregivers, seniors, trustedPayees, type TrustedPayee } from '@/lib/db/schema'
import { combine, type Decision } from '@/lib/decision/combine'
import { formatCents } from '@/lib/money'
import { resolvePayee } from '@/lib/payees/resolve'
import { checkPaymentRules, type CheckPaymentResult } from '@/lib/rules/check-payment'

export interface CompleteDraft {
  payeeName: string // as the senior said it
  amountCents: number
  purpose: string | null
}

export interface ResolvedPayee {
  name: string
  trustedPayeeId: string | null
  email: string | null
  relationship: string | null
}

export type AssessResult =
  | { kind: 'clarify_payee'; question: string }
  | {
      kind: 'decided'
      decision: Decision
      reply: string // what Haven says to the senior
      payee: ResolvedPayee
      rules: CheckPaymentResult
      ai: RiskOutcome
    }

export interface AssessInput {
  seniorId: string
  draft: CompleteDraft
  transcript: TranscriptTurn[]
  followUpsAsked: number
  now?: Date
}

export async function assessPayment(db: Db, input: AssessInput, call?: StructuredCall): Promise<AssessResult> {
  const [senior] = await db
    .select({ name: seniors.name, caregiverName: caregivers.name })
    .from(seniors)
    .innerJoin(caregivers, eq(caregivers.id, seniors.caregiverId))
    .where(eq(seniors.id, input.seniorId))
  if (!senior) throw new Error(`Unknown senior ${input.seniorId}`)

  const list = await db.select().from(trustedPayees).where(eq(trustedPayees.seniorId, input.seniorId))
  const resolution = resolvePayee(input.draft.payeeName, list)
  if (resolution.kind === 'ambiguous') {
    const names = resolution.candidates.map((c) => c.name)
    return { kind: 'clarify_payee', question: `Do you mean ${names.slice(0, -1).join(', ')} or ${names.at(-1)}?` }
  }
  const match: TrustedPayee | null = resolution.kind === 'match' ? resolution.payee : null
  const payee: ResolvedPayee = match
    ? { name: match.name, trustedPayeeId: match.id, email: match.paypalEmail, relationship: match.relationship }
    : { name: input.draft.payeeName, trustedPayeeId: null, email: null, relationship: null }

  const [rules, ai] = await Promise.all([
    checkPaymentRules(
      db,
      {
        seniorId: input.seniorId,
        amountCents: input.draft.amountCents,
        payeeName: payee.name,
        payeeEmail: payee.email,
        payeePhone: match?.phone,
        trustedPayeeId: payee.trustedPayeeId,
      },
      input.now,
    ),
    assessRisk(
      {
        seniorName: firstName(senior.name),
        payeeName: payee.name,
        isTrusted: Boolean(match),
        relationship: payee.relationship,
        amountCents: input.draft.amountCents,
        purpose: input.draft.purpose,
        transcript: input.transcript,
      },
      call,
    ),
  ])

  const decision = combine({ rules, ai, followUpsAsked: input.followUpsAsked })
  return {
    kind: 'decided',
    decision,
    reply: replyFor(decision, input.draft, match, senior.caregiverName),
    payee,
    rules,
    ai,
  }
}

function replyFor(decision: Decision, draft: CompleteDraft, match: TrustedPayee | null, caregiverName: string): string {
  switch (decision.action) {
    case 'confirm': {
      // Echo the name the way the senior said it ("Maria"), unless it was a description ("my granddaughter").
      const said = draft.payeeName.trim()
      const name = match && /^(my|the|our)\b/i.test(said) ? match.name : said
      const purpose = draft.purpose ? ` for ${draft.purpose}` : ''
      return `Send ${formatCents(draft.amountCents)} to ${name}${purpose}?`
    }
    case 'ask':
      return decision.question
    case 'hold':
      return `I've asked ${firstName(caregiverName)} to take a look before this goes out.`
  }
}

function firstName(name: string): string {
  return name.split(' ')[0]
}
