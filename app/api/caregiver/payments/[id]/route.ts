import { UUID } from '@/lib/api'
import { getPaymentDetail } from '@/lib/caregiver/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = UUID.test(id) ? await getPaymentDetail(getDb(), DEMO_SENIOR_ID, id) : null
  if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(detail)
}
