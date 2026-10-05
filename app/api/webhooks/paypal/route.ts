import { getDb } from '@/lib/db/client'
import { handlePayPalWebhook } from '@/lib/payments/webhook-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const result = await handlePayPalWebhook(getDb(), await req.text(), req.headers)
  return Response.json(result.body, { status: result.status })
}
