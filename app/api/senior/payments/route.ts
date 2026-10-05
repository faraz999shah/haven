import { and, desc, eq, notInArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { payments } from '@/lib/db/schema'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { maybeReconcile } from '@/lib/payments/reconcile-throttle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  await maybeReconcile(db)
  const rows = await db
    .select({
      id: payments.id,
      payeeName: payments.payeeName,
      amountCents: payments.amountCents,
      purpose: payments.purpose,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    // Unconfirmed and cancelled attempts aren't payments from the senior's point of view.
    .where(
      and(eq(payments.seniorId, DEMO_SENIOR_ID), notInArray(payments.status, ['awaiting_confirmation', 'cancelled'])),
    )
    .orderBy(desc(payments.createdAt))
    .limit(20)
  return Response.json({ payments: rows })
}
