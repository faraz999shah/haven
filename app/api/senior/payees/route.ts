import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { trustedPayees } from '@/lib/db/schema'
import { DEMO_SENIOR_ID } from '@/lib/demo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const rows = await getDb()
    .select({ id: trustedPayees.id, name: trustedPayees.name, relationship: trustedPayees.relationship })
    .from(trustedPayees)
    .where(eq(trustedPayees.seniorId, DEMO_SENIOR_ID))
    .orderBy(asc(trustedPayees.name))
  return Response.json({ payees: rows })
}
