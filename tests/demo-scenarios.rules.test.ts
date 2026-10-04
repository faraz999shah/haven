// Integration test: the three demo scenarios against a real, freshly seeded Postgres database.
// Runs only when TEST_DATABASE_URL is set (the database is wiped).

import 'dotenv/config'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '@/lib/db/client'
import { payments, trustedPayees } from '@/lib/db/schema'
import { seedDemo } from '@/lib/db/seed'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { resolvePayee } from '@/lib/payees/resolve'
import { checkPaymentRules } from '@/lib/rules/check-payment'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('demo scenarios through the rules engine', async () => {
  const { db, pool } = createDb(url!)
  await migrate(db, { migrationsFolder: './drizzle' })
  // 1pm New York time, so "today" is unambiguous.
  const now = new Date('2026-10-04T17:00:00Z')

  beforeEach(() => seedDemo(db, now))
  afterAll(() => pool.end())

  async function trusted(spoken: string) {
    const all = await db.select().from(trustedPayees)
    const r = resolvePayee(spoken, all)
    return r.kind === 'match' ? r.payee : null
  }

  it('"Send Maria $85 for groceries" passes', async () => {
    const maria = await trusted('Maria')
    expect(maria?.name).toBe('Maria Adams')
    const r = await checkPaymentRules(
      db,
      { seniorId: DEMO_SENIOR_ID, amountCents: 8500, payeeName: maria!.name, trustedPayeeId: maria!.id },
      now,
    )
    expect(r).toMatchObject({ verdict: 'PASS', triggered: [], isTrusted: true, scamMatch: null })
  })

  it('"Pay Joe\'s Plumbing $350" is held for the single-payment limit', async () => {
    const joe = await trusted("Joe's Plumbing")
    const r = await checkPaymentRules(
      db,
      { seniorId: DEMO_SENIOR_ID, amountCents: 35000, payeeName: joe!.name, trustedPayeeId: joe!.id },
      now,
    )
    expect(r.verdict).toBe('HOLD')
    expect(r.isTrusted).toBe(true)
    expect(r.triggered.map((t) => t.code)).toEqual(['MAX_SINGLE', 'DAILY_LIMIT'])
  })

  it('"My grandson Kevin ... $450 for bail" is held as a new payee over the limits', async () => {
    expect(await trusted('Kevin')).toBeNull()
    const r = await checkPaymentRules(db, { seniorId: DEMO_SENIOR_ID, amountCents: 45000, payeeName: 'Kevin' }, now)
    expect(r.verdict).toBe('HOLD')
    expect(r.isTrusted).toBe(false)
    expect(r.triggered.map((t) => t.code)).toEqual(['NEW_PAYEE', 'MAX_SINGLE', 'DAILY_LIMIT'])
  })

  it('does not trust a payee id that belongs to no one on the list', async () => {
    const r = await checkPaymentRules(
      db,
      {
        seniorId: DEMO_SENIOR_ID,
        amountCents: 1000,
        payeeName: 'Maria Adams',
        trustedPayeeId: '00000000-0000-4000-8000-0000000000ff',
      },
      now,
    )
    expect(r.isTrusted).toBe(false)
    expect(r.verdict).toBe('HOLD')
  })

  it('holds a known scam payee via the scam list', async () => {
    const r = await checkPaymentRules(
      db,
      { seniorId: DEMO_SENIOR_ID, amountCents: 1000, payeeName: 'Quick Bail Bonds Services' },
      now,
    )
    expect(r.triggered.map((t) => t.code)).toContain('SCAM_LIST')
  })

  it("counts today's held payments toward the daily limit", async () => {
    const maria = await trusted('Maria')
    await db.insert(payments).values({
      seniorId: DEMO_SENIOR_ID,
      payeeName: "Joe's Plumbing",
      amountCents: 25000,
      status: 'held',
      riskLevel: 'high',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    const r = await checkPaymentRules(
      db,
      { seniorId: DEMO_SENIOR_ID, amountCents: 8500, payeeName: maria!.name, trustedPayeeId: maria!.id },
      now,
    )
    expect(r.triggered.map((t) => t.code)).toEqual(['DAILY_LIMIT'])
  })
})
