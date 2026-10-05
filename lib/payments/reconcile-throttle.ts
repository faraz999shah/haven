import type { Db } from '@/lib/db/client'
import { reconcileInFlight } from './payouts-service'

let lastRun = 0
let running: Promise<unknown> | null = null

// Webhooks are the main way statuses update; this is a cheap safety net called when screens
// refresh, so a missed or unreachable webhook still resolves. At most once every 10 seconds.
export async function maybeReconcile(db: Db, minIntervalMs = 10_000): Promise<void> {
  if (!process.env.PAYPAL_CLIENT_ID || running || Date.now() - lastRun < minIntervalMs) return
  lastRun = Date.now()
  running = reconcileInFlight(db)
    .catch((err) => console.error('Reconcile failed:', err))
    .finally(() => (running = null))
  await running
}
