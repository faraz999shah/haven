import { z } from 'zod'
import { acknowledgeNotices, pendingNotices } from '@/lib/caregiver/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Caregiver decisions the senior hasn't been told about yet.
export async function GET() {
  return Response.json({ notices: await pendingNotices(getDb(), DEMO_SENIOR_ID) })
}

// Marks notices as seen.
export async function POST(req: Request) {
  const body = z.object({ ids: z.array(z.string().uuid()).max(50) }).safeParse(await req.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
  await acknowledgeNotices(getDb(), DEMO_SENIOR_ID, body.data.ids)
  return Response.json({ ok: true })
}
