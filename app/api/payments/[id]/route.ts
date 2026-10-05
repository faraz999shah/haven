import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { payments } from '@/lib/db/schema'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { maybeReconcile } from '@/lib/payments/reconcile-throttle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const db = getDb()
  await maybeReconcile(db)
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, id), eq(payments.seniorId, DEMO_SENIOR_ID)))
  if (!payment) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ payment })
}
