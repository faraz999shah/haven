// Loads everything the rules engine needs from the database, runs the scam check,
// and evaluates the rules. The engine itself stays pure (see engine.ts).

import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { payments, ruleSettings, seniors, trustedPayees } from '@/lib/db/schema'
import { checkScamList, type ScamMatch } from '@/lib/scam'
import { evaluateRules, type RulesResult } from './engine'

export interface ProposedPayment {
  seniorId: string
  amountCents: number
  payeeName: string
  payeeEmail?: string | null
  payeePhone?: string | null
  trustedPayeeId?: string | null
}

export interface CheckPaymentResult extends RulesResult {
  isTrusted: boolean
  scamMatch: ScamMatch | null
}

// Prior payments older than this can't affect "today" in any time zone or a rapid window under 2 days.
const LOOKBACK_MS = 48 * 60 * 60 * 1000

export async function checkPaymentRules(db: Db, proposed: ProposedPayment, now = new Date()): Promise<CheckPaymentResult> {
  const [senior] = await db.select().from(seniors).where(eq(seniors.id, proposed.seniorId))
  if (!senior) throw new Error(`Unknown senior ${proposed.seniorId}`)
  const [settings] = await db.select().from(ruleSettings).where(eq(ruleSettings.seniorId, senior.id))
  if (!settings) throw new Error(`No rule settings for senior ${senior.id}`)

  // Only trust the payee id if it really is on this senior's list.
  let isTrusted = false
  if (proposed.trustedPayeeId) {
    const [row] = await db
      .select({ id: trustedPayees.id })
      .from(trustedPayees)
      .where(and(eq(trustedPayees.id, proposed.trustedPayeeId), eq(trustedPayees.seniorId, senior.id)))
    isTrusted = Boolean(row)
  }

  const lookbackMs = Math.max(LOOKBACK_MS, settings.rapidWindowMinutes * 60_000)
  const prior = await db
    .select({ amountCents: payments.amountCents, status: payments.status, createdAt: payments.createdAt })
    .from(payments)
    .where(and(eq(payments.seniorId, senior.id), gt(payments.createdAt, new Date(now.getTime() - lookbackMs))))

  const scamMatch = await checkScamList({
    name: proposed.payeeName,
    email: proposed.payeeEmail,
    phone: proposed.payeePhone,
  })

  const result = evaluateRules({
    amountCents: proposed.amountCents,
    payeeName: proposed.payeeName,
    isTrusted,
    scamMatch,
    settings,
    priorPayments: prior,
    seniorName: senior.name.split(' ')[0],
    timeZone: senior.timeZone,
    now,
  })
  return { ...result, isTrusted, scamMatch }
}
