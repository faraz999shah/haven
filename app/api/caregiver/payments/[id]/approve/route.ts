import { z } from 'zod'
import { errorResponse, UUID } from '@/lib/api'
import { approvePayment } from '@/lib/caregiver/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  payeeEmail: z.string().max(254).nullish(),
  addToTrusted: z.object({ relationship: z.string().trim().max(100) }).nullish(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return Response.json({ error: 'Not found' }, { status: 404 })
  const body = Body.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
  try {
    return Response.json({ payment: await approvePayment(getDb(), DEMO_SENIOR_ID, id, body.data) })
  } catch (err) {
    return errorResponse(err)
  }
}
