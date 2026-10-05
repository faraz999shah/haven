import { listPayments } from '@/lib/caregiver/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { maybeReconcile } from '@/lib/payments/reconcile-throttle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  await maybeReconcile(db)
  return Response.json({ payments: await listPayments(db, DEMO_SENIOR_ID) })
}
