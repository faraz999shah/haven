import { timingSafeEqual } from 'node:crypto'
import { getDb } from '@/lib/db/client'
import { seedDemo } from '@/lib/db/seed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Resets the demo data on a deployment without shell access:
//   curl -X POST https://<host>/api/admin/reset-demo -H "Authorization: Bearer $DEMO_RESET_TOKEN"
// Disabled (404) unless DEMO_RESET_TOKEN is set.
export async function POST(req: Request) {
  const token = process.env.DEMO_RESET_TOKEN
  if (!token) return new Response('Not found', { status: 404 })
  const given = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '')
  const expected = Buffer.from(token)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await seedDemo(getDb())
  return Response.json({ ok: true })
}
