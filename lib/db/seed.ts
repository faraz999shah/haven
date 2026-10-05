import { sql } from 'drizzle-orm'
import { DEMO_CAREGIVER_ID, DEMO_SENIOR_ID } from '@/lib/demo'
import type { Db } from './client'
import { caregivers, conversations, messages, payments, ruleSettings, seniors, trustedPayees } from './schema'

const DAY = 24 * 60 * 60 * 1000

// Resets the database to the demo state. Past payments are all on earlier days so they
// never count toward today's limit and the live demo scenarios start from a clean slate.
export async function seedDemo(db: Db, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE webhook_events, messages, payments, conversations, rule_settings, trusted_payees, seniors, caregivers CASCADE`,
    )

    await tx.insert(caregivers).values({ id: DEMO_CAREGIVER_ID, name: 'Sarah Adams', email: 'sarah.adams@example.com' })
    await tx.insert(seniors).values({
      id: DEMO_SENIOR_ID,
      name: 'Margaret Adams',
      caregiverId: DEMO_CAREGIVER_ID,
      timeZone: process.env.DEMO_TIME_ZONE || 'America/New_York',
    })

    const [maria, joe, linda] = await tx
      .insert(trustedPayees)
      .values([
        {
          seniorId: DEMO_SENIOR_ID,
          name: 'Maria Adams',
          relationship: 'Granddaughter',
          aliases: ['Maria', 'my granddaughter'],
          paypalEmail: process.env.SANDBOX_EMAIL_MARIA || 'maria.adams@example.com',
        },
        {
          seniorId: DEMO_SENIOR_ID,
          name: "Joe's Plumbing",
          relationship: 'Plumber',
          aliases: ['Joe', 'the plumber', 'Joe the plumber'],
          paypalEmail: process.env.SANDBOX_EMAIL_JOE || 'joe@joesplumbing.example.com',
        },
        {
          seniorId: DEMO_SENIOR_ID,
          name: 'Linda Park',
          relationship: 'Neighbor',
          aliases: ['Linda', 'my neighbor'],
          paypalEmail: process.env.SANDBOX_EMAIL_LINDA || 'linda.park@example.com',
          phone: '(555) 014-8820',
        },
      ])
      .returning()

    await tx.insert(ruleSettings).values({
      seniorId: DEMO_SENIOR_ID,
      maxSinglePaymentCents: 20000,
      dailyLimitCents: 30000,
      newPayeeMode: 'always',
      newPayeeThresholdCents: 20000,
      rapidMaxCount: 3,
      rapidWindowMinutes: 60,
    })

    const past: {
      daysAgo: number
      payee: typeof maria | null
      payeeName: string
      amountCents: number
      purpose: string
      status: 'sent' | 'declined'
      riskLevel: 'low' | 'high'
      reason: string
      signals?: string[]
      rules?: { code: 'NEW_PAYEE' | 'MAX_SINGLE' | 'SCAM_LIST'; message: string }[]
      transcript: [string, string][]
    }[] = [
      {
        daysAgo: 6,
        payee: joe,
        payeeName: "Joe's Plumbing",
        amountCents: 15000,
        purpose: 'kitchen sink repair',
        status: 'sent',
        riskLevel: 'low',
        reason: 'Routine payment to a trusted local business for a stated repair.',
        transcript: [
          ['senior', "Pay Joe's Plumbing $150 for fixing the kitchen sink."],
          ['haven', "Send $150 to Joe's Plumbing for kitchen sink repair?"],
          ['senior', 'Yes.'],
          ['haven', "Done. $150 is on its way to Joe's Plumbing."],
        ],
      },
      {
        daysAgo: 5,
        payee: null,
        payeeName: 'Prize Claim Center',
        amountCents: 50000,
        purpose: 'prize processing fee',
        status: 'declined',
        riskLevel: 'high',
        reason:
          'Margaret was told she won a prize and must pay a fee to claim it. Paying to receive a prize is a common scam, and this payee is on the known-scam list.',
        signals: ['prize_or_lottery', 'urgency', 'unknown_payee'],
        rules: [
          {
            code: 'SCAM_LIST',
            message: 'Prize Claim Center matches a known scam name (Lottery or sweepstakes fee scam).',
          },
          {
            code: 'NEW_PAYEE',
            message: "Prize Claim Center isn't on Margaret's trusted list, and you asked to review all new payees.",
          },
          { code: 'MAX_SINGLE', message: '$500 is over the $200 single-payment limit.' },
        ],
        transcript: [
          ['senior', 'I need to send $500 to the Prize Claim Center so they can release my winnings.'],
          ['haven', "I've asked Sarah to take a look before this goes out."],
        ],
      },
      {
        daysAgo: 3,
        payee: maria,
        payeeName: 'Maria Adams',
        amountCents: 6000,
        purpose: 'groceries',
        status: 'sent',
        riskLevel: 'low',
        reason: 'Small grocery payment to her granddaughter, a trusted payee.',
        transcript: [
          ['senior', 'Send Maria $60 for groceries.'],
          ['haven', 'Send $60 to Maria for groceries?'],
          ['senior', 'Yes please.'],
          ['haven', 'Done. $60 is on its way to Maria.'],
        ],
      },
      {
        daysAgo: 2,
        payee: linda,
        payeeName: 'Linda Park',
        amountCents: 2500,
        purpose: 'flowers for the garden club',
        status: 'sent',
        riskLevel: 'low',
        reason: 'Small payment to a trusted neighbor.',
        transcript: [
          ['senior', 'Pay Linda $25 for the garden club flowers.'],
          ['haven', 'Send $25 to Linda for the garden club flowers?'],
          ['senior', 'Yes.'],
          ['haven', 'Done. $25 is on its way to Linda.'],
        ],
      },
    ]

    for (const p of past) {
      const at = new Date(now.getTime() - p.daysAgo * DAY)
      const [conv] = await tx
        .insert(conversations)
        .values({ seniorId: DEMO_SENIOR_ID, status: 'completed', createdAt: at, updatedAt: at })
        .returning()
      await tx.insert(messages).values(
        p.transcript.map(([role, text], i) => ({
          conversationId: conv.id,
          role: role as 'senior' | 'haven',
          text,
          createdAt: new Date(at.getTime() + i * 15_000),
        })),
      )
      const decidedAt = new Date(at.getTime() + 10 * 60_000)
      await tx.insert(payments).values({
        seniorId: DEMO_SENIOR_ID,
        conversationId: conv.id,
        trustedPayeeId: p.payee?.id ?? null,
        payeeName: p.payeeName,
        payeeEmail: p.payee?.paypalEmail ?? null,
        amountCents: p.amountCents,
        purpose: p.purpose,
        status: p.status,
        riskLevel: p.riskLevel,
        aiRiskLevel: p.riskLevel,
        reason: p.reason,
        aiSignals: p.signals ?? [],
        rulesTriggered: p.rules ?? [],
        paypalStatus: p.status === 'sent' ? 'SUCCESS' : null,
        decidedAt: p.status === 'declined' ? decidedAt : null,
        seniorNotifiedAt: p.status === 'declined' ? decidedAt : null,
        sentAt: p.status === 'sent' ? new Date(at.getTime() + 60_000) : null,
        createdAt: at,
        updatedAt: p.status === 'declined' ? decidedAt : at,
      })
    }
  })
}
