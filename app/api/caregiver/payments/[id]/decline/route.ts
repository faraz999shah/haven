import { errorResponse, UUID } from '@/lib/api'
import { declinePayment } from '@/lib/caregiver/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  try {
    return Response.json({ payment: await declinePayment(getDb(), DEMO_SENIOR_ID, id) })
  } catch (err) {
    return errorResponse(err)
  }
}
