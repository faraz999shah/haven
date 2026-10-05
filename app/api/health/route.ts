import { desc } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { webhookEvents } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Render health check: the app is up and can reach Postgres. Also reports when the last
// verified PayPal webhook arrived, to confirm webhooks are reaching this deployment.
export async function GET() {
  try {
    const [last] = await getDb()
      .select({ at: webhookEvents.receivedAt, type: webhookEvents.eventType })
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(1)
    return Response.json({ ok: true, lastWebhook: last ?? null })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
