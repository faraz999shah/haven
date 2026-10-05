import { z } from 'zod'
import { handleTurn } from '@/lib/conversation/service'
import { getDb } from '@/lib/db/client'
import { DEMO_SENIOR_ID } from '@/lib/demo'
import { clientIp, createRateLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Each turn can make two OpenAI calls, so cap usage per visitor and for the whole site.
const perIp = createRateLimiter(20, 60_000)
const siteWide = createRateLimiter(300, 60 * 60_000)

const Body = z
  .object({
    conversationId: z.string().uuid().nullish(),
    text: z.string().max(1000).nullish(),
    action: z.enum(['confirm', 'cancel']).nullish(),
  })
  .refine((b) => Boolean(b.text?.trim()) || Boolean(b.action), 'Send text or an action')

export async function POST(req: Request) {
  if (!perIp(clientIp(req)) || !siteWide('all')) {
    return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const result = await handleTurn(getDb(), { seniorId: DEMO_SENIOR_ID, ...parsed.data })
    return Response.json(result)
  } catch (err) {
    console.error('Converse failed:', err)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
