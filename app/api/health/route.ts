import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Render health check: the app is up and can reach Postgres.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
