// One senior turn: record what they said, advance the conversation, record Haven's reply.
//
//   collecting ──parse──► clarify (ask) ─┐
//       ▲                                 │
//       └─────── follow-up (medium) ◄─────┤ assess (rules + AI + combine)
//                                         ├─► hold ──────────────► done   (payment: held)
//                                         └─► confirm ─► awaiting_confirmation
//                                                yes ─► re-check rules ─► send ─► done (payment: sending)
//                                                no  ─────────────────────────► done (payment: cancelled)

import { and, asc, eq, sql } from 'drizzle-orm'
import { parseRequest } from '@/lib/ai/parse'
import type { StructuredCall } from '@/lib/ai/llm'
import type { TranscriptTurn } from '@/lib/ai/transcript'
import type { Db } from '@/lib/db/client'
import { caregivers, conversations, messages, payments, seniors, type Payment } from '@/lib/db/schema'
import { formatCents } from '@/lib/money'
import { PaymentStateError, paypalGateway, sendPayment, type PayoutGateway } from '@/lib/payments/payouts-service'
import { assessPayment } from '@/lib/pipeline/assess'
import { checkPaymentRules } from '@/lib/rules/check-payment'
import { initialState, readState, type ConversationState, type Stage } from './state'
import { interpretYesNo } from './yes-no'

export interface TurnInput {
  seniorId: string
  conversationId?: string | null
  text?: string | null
  action?: 'confirm' | 'cancel' | null
}

export interface PaymentSummary {
  id: string
  payeeName: string
  amountCents: number
  purpose: string | null
  status: Payment['status']
}

export interface TurnResult {
  conversationId: string
  reply: string
  stage: Stage
  payment: PaymentSummary | null
}

export interface TurnDeps {
  call?: StructuredCall
  gateway?: PayoutGateway
  now?: Date
}

const SORRY = "Sorry, I didn't catch that. Could you say it again?"

// Turns for one conversation run one at a time (Haven runs as a single server process).
const locks = new Map<string, Promise<unknown>>()
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  locks.set(key, next)
  next.finally(() => {
    if (locks.get(key) === next) locks.delete(key)
  })
  return next
}

export async function handleTurn(db: Db, input: TurnInput, deps: TurnDeps = {}): Promise<TurnResult> {
  const conversation = await openConversation(db, input)
  return withLock(conversation.id, () => runTurn(db, conversation.id, input, deps))
}

async function openConversation(db: Db, input: TurnInput) {
  if (input.conversationId) {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.seniorId, input.seniorId)))
    if (existing && existing.status === 'active') return existing
  }
  // A new conversation: any payment still waiting for a yes from an earlier one is dropped.
  await db
    .update(payments)
    .set({ status: 'cancelled', updatedAt: sql`now()` })
    .where(and(eq(payments.seniorId, input.seniorId), eq(payments.status, 'awaiting_confirmation')))
  await db
    .update(conversations)
    .set({ status: 'abandoned', updatedAt: sql`now()` })
    .where(and(eq(conversations.seniorId, input.seniorId), eq(conversations.status, 'active')))
  const [created] = await db
    .insert(conversations)
    .values({ seniorId: input.seniorId, state: initialState() })
    .returning()
  return created
}

async function runTurn(db: Db, conversationId: string, input: TurnInput, deps: TurnDeps): Promise<TurnResult> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId))
  let state = readState(conv.state)

  const said =
    input.action === 'confirm' ? 'Yes, send it.' : input.action === 'cancel' ? 'No, cancel.' : (input.text ?? '').trim()
  if (said) await db.insert(messages).values({ conversationId, role: 'senior', text: said })

  let reply: string
  let paymentId: string | null = state.stage === 'collecting' ? null : state.paymentId

  if (input.action === 'cancel' && state.stage === 'collecting') {
    reply = "Okay, I've stopped. Nothing was sent."
    state = { stage: 'done', paymentId: null }
  } else if (state.stage === 'awaiting_confirmation') {
    const answer = input.action === 'confirm' ? 'yes' : input.action === 'cancel' ? 'no' : interpretYesNo(said)
    ;({ reply, state } = await confirmTurn(db, state.paymentId, answer, deps))
  } else if (state.stage === 'collecting') {
    if (!said) {
      reply = 'Who would you like to pay, and how much?'
    } else {
      ;({ reply, state, paymentId } = await collectTurn(db, conv.seniorId, conversationId, state, deps))
    }
  } else {
    reply = 'That one is all finished. Tap the microphone to start a new payment.'
  }

  await db.insert(messages).values({ conversationId, role: 'haven', text: reply })
  await db
    .update(conversations)
    .set({ state, status: state.stage === 'done' ? 'completed' : 'active', updatedAt: sql`now()` })
    .where(eq(conversations.id, conversationId))

  const payment = paymentId ? await summary(db, paymentId) : null
  return { conversationId, reply, stage: state.stage, payment }
}

async function collectTurn(
  db: Db,
  seniorId: string,
  conversationId: string,
  state: Extract<ConversationState, { stage: 'collecting' }>,
  deps: TurnDeps,
): Promise<{ reply: string; state: ConversationState; paymentId: string | null }> {
  const transcript = await loadTranscript(db, conversationId)

  let parsed: Awaited<ReturnType<typeof parseRequest>>
  try {
    parsed = await parseRequest(transcript, state.draft, deps.call)
  } catch (err) {
    console.error('Parse failed:', err)
    return { reply: SORRY, state, paymentId: null }
  }
  if (parsed.kind === 'clarify') {
    return { reply: parsed.question, state: { ...state, draft: parsed.draft }, paymentId: null }
  }

  const draft = parsed.draft
  const result = await assessPayment(
    db,
    { seniorId, draft, transcript, followUpsAsked: state.followUpsAsked, now: deps.now },
    deps.call,
  )
  if (result.kind === 'clarify_payee') {
    return { reply: result.question, state: { ...state, draft }, paymentId: null }
  }

  const { decision } = result
  // Nowhere to send it yet (a new payee has no PayPal email): the caregiver adds one when approving.
  const needsEmail = decision.action === 'confirm' && !result.payee.email
  if (decision.action === 'ask') {
    return {
      reply: result.reply,
      state: { stage: 'collecting', draft, followUpsAsked: state.followUpsAsked + 1 },
      paymentId: null,
    }
  }

  const [payment] = await db
    .insert(payments)
    .values({
      seniorId,
      conversationId,
      trustedPayeeId: result.payee.trustedPayeeId,
      payeeName: result.payee.name,
      payeeEmail: result.payee.email,
      amountCents: draft.amountCents,
      purpose: draft.purpose,
      status: decision.action === 'confirm' && !needsEmail ? 'awaiting_confirmation' : 'held',
      riskLevel: decision.riskLevel,
      aiRiskLevel: result.ai.ok ? result.ai.assessment.risk_level : null,
      reason: needsEmail
        ? `Haven doesn't have a PayPal email for ${result.payee.name} yet. ${decision.reason}`
        : decision.reason,
      aiSignals: result.ai.ok ? result.ai.assessment.signals : [],
      rulesTriggered: result.rules.triggered,
    })
    .returning()

  if (needsEmail) {
    return {
      reply: await holdReply(db, seniorId),
      state: { stage: 'done', paymentId: payment.id },
      paymentId: payment.id,
    }
  }
  return {
    reply: result.reply,
    state:
      decision.action === 'confirm'
        ? { stage: 'awaiting_confirmation', paymentId: payment.id }
        : { stage: 'done', paymentId: payment.id },
    paymentId: payment.id,
  }
}

async function confirmTurn(
  db: Db,
  paymentId: string,
  answer: 'yes' | 'no' | 'unclear',
  deps: TurnDeps,
): Promise<{ reply: string; state: ConversationState }> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId))
  const amount = formatCents(payment.amountCents)
  const name = payment.payeeName

  if (answer === 'unclear') {
    return {
      reply: `Should I send ${amount} to ${name}? Please say yes or no.`,
      state: { stage: 'awaiting_confirmation', paymentId },
    }
  }
  if (answer === 'no') {
    await db
      .update(payments)
      .set({ status: 'cancelled', updatedAt: sql`now()` })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'awaiting_confirmation')))
    return { reply: "Okay, I won't send it.", state: { stage: 'done', paymentId } }
  }

  // Re-check the rules at the moment of sending: limits may have changed since we asked.
  const recheck = await checkPaymentRules(
    db,
    {
      seniorId: payment.seniorId,
      amountCents: payment.amountCents,
      payeeName: payment.payeeName,
      payeeEmail: payment.payeeEmail,
      trustedPayeeId: payment.trustedPayeeId,
    },
    deps.now,
  )
  if (recheck.verdict === 'HOLD') {
    await db
      .update(payments)
      .set({
        status: 'held',
        riskLevel: 'high',
        rulesTriggered: recheck.triggered,
        reason: recheck.triggered.map((t) => t.message).join(' '),
        updatedAt: sql`now()`,
      })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'awaiting_confirmation')))
    return { reply: await holdReply(db, payment.seniorId), state: { stage: 'done', paymentId } }
  }

  let sent: Payment
  try {
    sent = await sendPayment(db, paymentId, deps.gateway ?? paypalGateway)
  } catch (err) {
    if (!(err instanceof PaymentStateError)) throw err
    return { reply: "That payment can't be sent anymore, so nothing went out.", state: { stage: 'done', paymentId } }
  }
  const reply =
    sent.status === 'failed'
      ? `I couldn't send that just now, so nothing went out. I've let ${await caregiverFirstName(db, payment.seniorId)} know.`
      : `Done. ${amount} is on its way to ${name}.`
  return { reply, state: { stage: 'done', paymentId } }
}

async function loadTranscript(db: Db, conversationId: string): Promise<TranscriptTurn[]> {
  const rows = await db
    .select({ role: messages.role, text: messages.text })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
  return rows
}

async function caregiverFirstName(db: Db, seniorId: string): Promise<string> {
  const [row] = await db
    .select({ name: caregivers.name })
    .from(seniors)
    .innerJoin(caregivers, eq(caregivers.id, seniors.caregiverId))
    .where(eq(seniors.id, seniorId))
  return row?.name.split(' ')[0] ?? 'your family'
}

async function holdReply(db: Db, seniorId: string): Promise<string> {
  return `I've asked ${await caregiverFirstName(db, seniorId)} to take a look before this goes out.`
}

async function summary(db: Db, paymentId: string): Promise<PaymentSummary | null> {
  const [p] = await db
    .select({
      id: payments.id,
      payeeName: payments.payeeName,
      amountCents: payments.amountCents,
      purpose: payments.purpose,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
  return p ?? null
}
